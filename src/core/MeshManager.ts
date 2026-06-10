import * as THREE from 'three';
import { bufferGeometryToIndexedData, indexedGeometryToObj, objToBufferGeometry } from '../io/ObjIO';
import { createQuadSphereGeometry, type QuadSphereOptions } from '../primitives/QuadSpherePrimitive';
import {
  buildVertexNeighbors,
  invalidateBrushAcceleration,
  rebuildBrushAcceleration,
  recalculateQuadNormals,
} from '../utils/GeometryUtils';
import { SculptEngine } from '../wasm/SculptEngine';
import { MeshFactory } from './MeshFactory';
import { SceneObject } from './SceneObject';

export interface PixRemeshSettings {
  resolution: number;
  adaptiveDensity: number;
  preserveSharpFeatures: boolean;
  smoothIterations: number;
  projectDetails: boolean;
}

export class MeshManager {
  readonly sculptEngine: SculptEngine;
  onObjectsChanged: (() => void) | undefined;
  onSelectionChanged: (() => void) | undefined;

  private readonly objectsInternal: SceneObject[] = [];
  private readonly wireframeOverlay = new THREE.Group();
  private readonly selectionBox = new THREE.BoxHelper(new THREE.Object3D(), 0x8eb6ff);
  private activeObjectInternal!: SceneObject;
  private wireframeEnabled = false;
  private objectCounter = 0;

  constructor(private readonly scene: THREE.Scene, options: QuadSphereOptions = {}) {
    this.selectionBox.visible = false;
    this.selectionBox.material.depthTest = false;
    this.selectionBox.renderOrder = 9;
    scene.add(this.selectionBox);

    const quadSphere = this.createSceneObject('Quad Sphere', createQuadSphereGeometry(options));
    const resolved = quadSphere.mesh.geometry.userData.options as Required<QuadSphereOptions>;
    quadSphere.subdivisionLevel = resolved.subdivisions;
    quadSphere.levelGeometries.set(quadSphere.subdivisionLevel, quadSphere.mesh.geometry);
    this.addObject(quadSphere);
    this.selectObject(quadSphere.id);

    this.sculptEngine = new SculptEngine(() => this.mesh.geometry);
  }

  get objects(): readonly SceneObject[] {
    return this.objectsInternal;
  }

  get activeObject(): SceneObject {
    return this.activeObjectInternal;
  }

  get mesh(): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
    return this.activeObjectInternal.mesh;
  }

  addCube(): SceneObject {
    const object = this.createSceneObject(`Cube ${this.nextObjectNumber()}`, MeshFactory.createCube(0.9));
    object.mesh.position.set(this.objectsInternal.length * 0.25, 0, 0);
    this.addObject(object);
    this.selectObject(object.id);
    return object;
  }

  addCylinder(): SceneObject {
    const object = this.createSceneObject(`Cylinder ${this.nextObjectNumber()}`, MeshFactory.createCylinder(0.45, 1.15, 32));
    object.mesh.position.set(this.objectsInternal.length * 0.25, 0, 0);
    this.addObject(object);
    this.selectObject(object.id);
    return object;
  }

  renameObject(id: string, name: string): void {
    const object = this.findObject(id);
    if (!object) return;
    object.name = name.trim() || object.name;
    object.mesh.name = object.name;
    this.onObjectsChanged?.();
  }

  setObjectVisible(id: string, visible: boolean): void {
    const object = this.findObject(id);
    if (!object) return;
    object.setVisible(visible);
    this.updateSelectionBox();
    this.onObjectsChanged?.();
  }

  selectObject(id: string): void {
    const object = this.findObject(id);
    if (!object) return;

    for (const item of this.objectsInternal) item.selected = item.id === id;
    this.activeObjectInternal = object;
    this.attachWireframeToActiveObject();
    this.updateSelectionBox();
    this.onSelectionChanged?.();
    this.onObjectsChanged?.();
  }

  deleteActiveObject(): void {
    if (this.objectsInternal.length <= 1) return;
    const active = this.activeObjectInternal;
    const index = this.objectsInternal.indexOf(active);
    if (index === -1) return;
    active.mesh.remove(this.wireframeOverlay);
    this.scene.remove(active.mesh);
    active.dispose();
    this.objectsInternal.splice(index, 1);
    const next = this.objectsInternal[Math.max(0, index - 1)] ?? this.objectsInternal[0];
    this.selectObject(next.id);
  }

  replaceQuadSphere(options: QuadSphereOptions): void {
    const active = this.activeObjectInternal;
    for (const geometry of active.levelGeometries.values()) geometry.dispose();
    active.levelGeometries.clear();
    active.mesh.geometry.dispose();
    active.mesh.geometry = createQuadSphereGeometry(options);
    const resolved = active.mesh.geometry.userData.options as Required<QuadSphereOptions>;
    active.subdivisionLevel = resolved.subdivisions;
    active.levelGeometries.set(active.subdivisionLevel, active.mesh.geometry);
    rebuildBrushAcceleration(active.mesh.geometry);
    this.sculptEngine.createQuadSphere(resolved.radius, resolved.subdivisions);
    this.rebuildWireframeOverlay();
    this.updateSelectionBox();
    this.onObjectsChanged?.();
  }

  setSubdivisionLevel(targetLevel: number): number {
    const active = this.activeObjectInternal;
    if (!active.mesh.geometry.userData.quadFaces) return active.subdivisionLevel;

    const clamped = THREE.MathUtils.clamp(Math.round(targetLevel), 0, 7);
    if (clamped === active.subdivisionLevel) return active.subdivisionLevel;

    if (clamped < active.subdivisionLevel) {
      this.propagateHighLevelEdits(active, clamped);
      const previous = active.levelGeometries.get(clamped);
      if (!previous) return active.subdivisionLevel;
      active.mesh.geometry = previous;
      active.subdivisionLevel = clamped;
      this.sculptEngine.restoreCoarseLevel();
      this.rebuildWireframeOverlay();
      this.updateSelectionBox();
      return active.subdivisionLevel;
    }

    const saved = this.sculptEngine.isWasmActive() ? undefined : active.levelGeometries.get(clamped);
    if (saved) {
      active.mesh.geometry = saved;
      active.subdivisionLevel = clamped;
      this.rebuildWireframeOverlay();
      this.updateSelectionBox();
      return active.subdivisionLevel;
    }

    while (active.subdivisionLevel < clamped) {
      const next = this.subdivideGeometry(active.mesh.geometry, active.subdivisionLevel);
      active.mesh.geometry = next;
      active.subdivisionLevel += 1;
      active.levelGeometries.set(active.subdivisionLevel, next);
      this.sculptEngine.subdivideCurrent();
    }
    this.rebuildWireframeOverlay();
    this.updateSelectionBox();
    return active.subdivisionLevel;
  }

  recalculateSurface(): void {
    const active = this.activeObjectInternal;
    this.discardLevelsAbove(active, active.subdivisionLevel);
    const affectedVertices = active.mesh.geometry.userData.lastBrushCandidates as number[] | undefined;
    const position = active.mesh.geometry.getAttribute('position');
    position.needsUpdate = true;
    recalculateQuadNormals(active.mesh.geometry, affectedVertices);
    active.mesh.geometry.getAttribute('normal').needsUpdate = true;
    this.updateWireframeOverlay();
    this.updateSelectionBox();
  }

  finishStroke(): void {
    rebuildBrushAcceleration(this.mesh.geometry);
    this.mesh.geometry.computeBoundingSphere();
    this.mesh.geometry.computeBoundingBox();
    delete this.mesh.geometry.userData.lastBrushCandidates;
    this.updateSelectionBox();
  }

  setWireframe(enabled: boolean): void {
    this.wireframeEnabled = enabled;
    if (enabled) this.updateWireframeOverlay();
    this.wireframeOverlay.visible = enabled;
  }

  refreshActiveTransform(): void {
    this.updateSelectionBox();
    this.onObjectsChanged?.();
  }

  previewPixRemeshTriangles(settings: PixRemeshSettings): number | undefined {
    const source = this.collectVisibleGeometry();
    if (!source) return undefined;
    return this.sculptEngine.previewPixRemeshTriangles(source.positions, source.indices, settings);
  }

  applyPixRemesh(settings: PixRemeshSettings): boolean {
    const source = this.collectVisibleGeometry();
    if (!source) return false;
    const geometry = this.sculptEngine.pixRemesh(source.positions, source.indices, settings);
    if (!geometry) return false;
    this.applyRemeshedGeometry(geometry);
    return true;
  }

  async applyInstantPixRemesh(settings: PixRemeshSettings): Promise<boolean> {
    const source = this.collectVisibleGeometry();
    if (!source) return false;
    const unionResolution = THREE.MathUtils.clamp(settings.resolution, 52, 72);
    const unionSettings: PixRemeshSettings = {
      ...settings,
      resolution: unionResolution,
      adaptiveDensity: Math.min(settings.adaptiveDensity, 0.35),
      smoothIterations: Math.min(Math.max(settings.smoothIterations, 1), 2),
      projectDetails: settings.projectDetails && unionResolution <= 56,
    };
    const volumeUnion = this.sculptEngine.pixRemesh(source.positions, source.indices, unionSettings);
    if (!volumeUnion) {
      throw new Error('C++ WASM PixRemesh volume union is required before Instant Meshes can create one merged shell.');
    }

    const obj = indexedGeometryToObj(bufferGeometryToIndexedData(volumeUnion));
    const targetFaces = Math.round(
      THREE.MathUtils.clamp(settings.resolution * settings.resolution * (4 + settings.adaptiveDensity * 4), 512, 220000),
    );
    const response = await fetch('/__instant_remesh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        obj,
        faces: targetFaces,
        smooth: settings.smoothIterations,
      }),
    });
    const payload = await response.json() as { obj?: string; error?: string };
    if (!response.ok || !payload.obj) {
      volumeUnion.dispose();
      throw new Error(payload.error || `Instant Meshes endpoint failed with HTTP ${response.status}.`);
    }
    volumeUnion.dispose();
    this.applyRemeshedGeometry(objToBufferGeometry(payload.obj));
    return true;
  }

  private applyRemeshedGeometry(geometry: THREE.BufferGeometry): void {
    const active = this.activeObjectInternal;
    for (const stored of active.levelGeometries.values()) stored.dispose();
    active.levelGeometries.clear();
    active.mesh.geometry.dispose();
    active.mesh.geometry = geometry;
    active.mesh.position.set(0, 0, 0);
    active.mesh.rotation.set(0, 0, 0);
    active.mesh.scale.set(1, 1, 1);
    active.subdivisionLevel = 0;
    rebuildBrushAcceleration(active.mesh.geometry);

    for (const object of [...this.objectsInternal]) {
      if (object === active || !object.visible) continue;
      this.removeObject(object);
    }

    this.attachWireframeToActiveObject();
    this.updateSelectionBox();
    this.onObjectsChanged?.();
  }

  private createSceneObject(name: string, geometry: THREE.BufferGeometry): SceneObject {
    const material = new THREE.MeshStandardMaterial({
      color: 0xaab4c5,
      roughness: 0.72,
      metalness: 0.08,
      flatShading: false,
    });
    rebuildBrushAcceleration(geometry);
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return new SceneObject(`object-${++this.objectCounter}`, name, new THREE.Mesh(geometry, material));
  }

  private nextObjectNumber(): number {
    return this.objectCounter + 1;
  }

  private addObject(object: SceneObject): void {
    this.objectsInternal.push(object);
    this.scene.add(object.mesh);
    this.onObjectsChanged?.();
  }

  private findObject(id: string): SceneObject | undefined {
    return this.objectsInternal.find((object) => object.id === id);
  }

  private removeObject(object: SceneObject): void {
    const index = this.objectsInternal.indexOf(object);
    if (index === -1) return;
    object.mesh.remove(this.wireframeOverlay);
    this.scene.remove(object.mesh);
    object.dispose();
    this.objectsInternal.splice(index, 1);
  }

  private collectVisibleGeometry(): { positions: number[]; indices: number[] } | undefined {
    const positions: number[] = [];
    const indices: number[] = [];
    const worldVertex = new THREE.Vector3();
    for (const object of this.objectsInternal) {
      if (!object.visible) continue;
      object.mesh.updateMatrixWorld(true);
      const geometry = object.mesh.geometry;
      const position = geometry.getAttribute('position');
      const offset = positions.length / 3;
      for (let vertex = 0; vertex < position.count; vertex += 1) {
        worldVertex.fromBufferAttribute(position, vertex).applyMatrix4(object.mesh.matrixWorld);
        positions.push(worldVertex.x, worldVertex.y, worldVertex.z);
      }
      const index = geometry.getIndex();
      if (index) {
        for (let item = 0; item < index.count; item += 1) indices.push(index.getX(item) + offset);
      } else {
        for (let item = 0; item < position.count; item += 1) indices.push(item + offset);
      }
    }
    return positions.length >= 9 && indices.length >= 3 ? { positions, indices } : undefined;
  }

  private attachWireframeToActiveObject(): void {
    this.wireframeOverlay.removeFromParent();
    this.activeObjectInternal.mesh.add(this.wireframeOverlay);
    this.rebuildWireframeOverlay();
  }

  private rebuildWireframeOverlay(): void {
    for (const child of this.wireframeOverlay.children) {
      const lines = child as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
      lines.geometry.dispose();
      lines.material.dispose();
    }
    this.wireframeOverlay.clear();
    this.wireframeOverlay.scale.setScalar(1.001);
    const colors = [0xa9c6ff, 0x91afe4, 0x7893c4];
    const opacities = [0.9, 0.5, 0.22];
    const levels = this.getWireframeLevels();

    levels.forEach((indices, level) => {
      if (indices.length === 0) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(indices.length * 3), 3));
      geometry.userData.vertexIndices = indices;
      const material = new THREE.LineBasicMaterial({
        color: colors[level],
        opacity: opacities[level],
        transparent: true,
        depthTest: true,
        depthWrite: false,
      });
      this.wireframeOverlay.add(new THREE.LineSegments(geometry, material));
    });

    this.wireframeOverlay.visible = this.wireframeEnabled;
    this.updateWireframeOverlay();
  }

  private getWireframeLevels(): Uint32Array[] {
    const levels = this.mesh.geometry.userData.wireframeLevels as Uint32Array[] | undefined;
    if (levels) return levels;
    return [new Uint32Array(), new Uint32Array(), this.createFallbackWireframeEdges()];
  }

  private createFallbackWireframeEdges(): Uint32Array {
    const index = this.mesh.geometry.getIndex();
    if (!index) return new Uint32Array();
    const edges: number[] = [];
    const visited = new Set<string>();
    for (let offset = 0; offset < index.count; offset += 3) {
      const triangle = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)];
      for (let edgeIndex = 0; edgeIndex < 3; edgeIndex += 1) {
        const a = triangle[edgeIndex];
        const b = triangle[(edgeIndex + 1) % 3];
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (visited.has(key)) continue;
        visited.add(key);
        edges.push(a, b);
      }
    }
    return new Uint32Array(edges);
  }

  private updateWireframeOverlay(): void {
    if (!this.wireframeEnabled) return;
    const source = this.mesh.geometry.getAttribute('position');
    for (const child of this.wireframeOverlay.children) {
      const lines = child as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
      const target = lines.geometry.getAttribute('position') as THREE.BufferAttribute;
      const indices = lines.geometry.userData.vertexIndices as Uint32Array;
      for (let index = 0; index < indices.length; index += 1) {
        const vertex = indices[index];
        target.setXYZ(index, source.getX(vertex), source.getY(vertex), source.getZ(vertex));
      }
      target.needsUpdate = true;
    }
  }

  private updateSelectionBox(): void {
    this.selectionBox.visible = Boolean(this.activeObjectInternal?.visible);
    if (!this.selectionBox.visible) return;
    this.selectionBox.setFromObject(this.activeObjectInternal.mesh);
  }

  private subdivideGeometry(source: THREE.BufferGeometry, sourceLevel: number): THREE.BufferGeometry {
    const positions = source.getAttribute('position');
    const faces = source.userData.quadFaces as number[][];
    const key = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
    const sourceVertices = Array.from({ length: positions.count }, (_, index) =>
      new THREE.Vector3(positions.getX(index), positions.getY(index), positions.getZ(index)));
    const facePoints = faces.map(([a, b, c, d]) =>
      new THREE.Vector3(
        (positions.getX(a) + positions.getX(b) + positions.getX(c) + positions.getX(d)) * 0.25,
        (positions.getY(a) + positions.getY(b) + positions.getY(c) + positions.getY(d)) * 0.25,
        (positions.getZ(a) + positions.getZ(b) + positions.getZ(c) + positions.getZ(d)) * 0.25,
      ));
    const edges = new Map<string, { a: number; b: number; faces: number[] }>();
    const vertexFaces = sourceVertices.map(() => [] as number[]);
    const vertexEdges = sourceVertices.map(() => new Set<string>());
    faces.forEach((face, faceIndex) => face.forEach((a, edgeIndex) => {
      const b = face[(edgeIndex + 1) % 4], edge = key(a, b);
      const record = edges.get(edge) ?? { a, b, faces: [] };
      record.faces.push(faceIndex);
      edges.set(edge, record);
      vertexFaces[a].push(faceIndex);
      vertexEdges[a].add(edge);
      vertexEdges[b].add(edge);
    }));

    const values: number[] = [];
    sourceVertices.forEach((vertex, vertexIndex) => {
      const faceAverage = new THREE.Vector3();
      for (const faceIndex of vertexFaces[vertexIndex]) faceAverage.add(facePoints[faceIndex]);
      faceAverage.multiplyScalar(1 / vertexFaces[vertexIndex].length);
      const edgeAverage = new THREE.Vector3();
      for (const edge of vertexEdges[vertexIndex]) {
        const record = edges.get(edge)!;
        edgeAverage.add(sourceVertices[record.a]).add(sourceVertices[record.b]);
      }
      edgeAverage.multiplyScalar(0.5 / vertexEdges[vertexIndex].size);
      const count = vertexFaces[vertexIndex].length;
      faceAverage.addScaledVector(edgeAverage, 2).addScaledVector(vertex, count - 3).multiplyScalar(1 / count);
      values.push(faceAverage.x, faceAverage.y, faceAverage.z);
    });

    const edgePoints = new Map<string, number>();
    for (const [edge, record] of edges) {
      const point = sourceVertices[record.a].clone().add(sourceVertices[record.b]);
      for (const faceIndex of record.faces) point.add(facePoints[faceIndex]);
      point.multiplyScalar(1 / (2 + record.faces.length));
      edgePoints.set(edge, values.length / 3);
      values.push(point.x, point.y, point.z);
    }
    const centers = facePoints.map((point) => {
      const index = values.length / 3;
      values.push(point.x, point.y, point.z);
      return index;
    });

    const nextFaces: number[][] = [];
    faces.forEach(([a, b, c, d], faceIndex) => {
      const ab = edgePoints.get(key(a, b))!;
      const bc = edgePoints.get(key(b, c))!;
      const cd = edgePoints.get(key(c, d))!;
      const da = edgePoints.get(key(d, a))!;
      const center = centers[faceIndex];
      nextFaces.push([a, ab, center, da], [ab, b, bc, center], [center, bc, c, cd], [da, center, cd, d]);
    });

    const indices: number[] = [];
    for (const [a, b, c, d] of nextFaces) indices.push(a, b, c, a, c, d);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
    geometry.setIndex(indices);
    geometry.userData.primitive = source.userData.primitive;
    geometry.userData.options = { ...(source.userData.options as object), subdivisions: sourceLevel + 1 };
    geometry.userData.quadFaces = nextFaces;
    geometry.userData.wireframeLevels = this.subdivideWireframeLevels(nextFaces, source.userData.wireframeLevels as Uint32Array[], edgePoints);
    recalculateQuadNormals(geometry);
    geometry.computeBoundingSphere();
    rebuildBrushAcceleration(geometry);
    return geometry;
  }

  private propagateHighLevelEdits(object: SceneObject, targetLevel: number): void {
    for (let level = object.subdivisionLevel; level > targetLevel; level -= 1) {
      const high = object.levelGeometries.get(level);
      const coarse = object.levelGeometries.get(level - 1);
      if (!high || !coarse) continue;
      this.projectHighLevelToCoarse(coarse, high);
    }
  }

  private projectHighLevelToCoarse(coarse: THREE.BufferGeometry, high: THREE.BufferGeometry): void {
    const coarsePositions = coarse.getAttribute('position') as THREE.BufferAttribute;
    const highPositions = high.getAttribute('position') as THREE.BufferAttribute;
    const highNeighbors = buildVertexNeighbors(high);
    const scratch = new THREE.Vector3();
    const average = new THREE.Vector3();

    for (let index = 0; index < coarsePositions.count; index += 1) {
      scratch.fromBufferAttribute(highPositions, index);
      average.set(0, 0, 0);
      for (const neighbor of highNeighbors[index]) {
        average.x += highPositions.getX(neighbor);
        average.y += highPositions.getY(neighbor);
        average.z += highPositions.getZ(neighbor);
      }
      if (highNeighbors[index].length > 0) {
        average.multiplyScalar(1 / highNeighbors[index].length);
        scratch.lerp(average, 0.35);
      }
      coarsePositions.setXYZ(index, scratch.x, scratch.y, scratch.z);
    }

    coarsePositions.needsUpdate = true;
    recalculateQuadNormals(coarse);
    coarse.getAttribute('normal').needsUpdate = true;
    coarse.computeBoundingSphere();
    coarse.computeBoundingBox();
    invalidateBrushAcceleration(coarse);
    rebuildBrushAcceleration(coarse);
  }

  private subdivideWireframeLevels(faces: number[][], levels: Uint32Array[], edgePoints: Map<string, number>): Uint32Array[] {
    const key = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
    const inherited = new Map<string, number>();
    levels.forEach((indices, level) => {
      for (let index = 0; index < indices.length; index += 2) {
        const a = indices[index], b = indices[index + 1], midpoint = edgePoints.get(key(a, b))!;
        const promotedLevel = level === 2 ? 1 : 0;
        inherited.set(key(a, midpoint), promotedLevel);
        inherited.set(key(midpoint, b), promotedLevel);
      }
    });
    const result = [[], [], []] as number[][];
    const visited = new Set<string>();
    for (const face of faces) face.forEach((a, index) => {
      const b = face[(index + 1) % 4], edge = key(a, b);
      if (visited.has(edge)) return;
      visited.add(edge);
      result[inherited.get(edge) ?? 2].push(a, b);
    });
    return result.map((indices) => new Uint32Array(indices));
  }

  private discardLevelsAbove(object: SceneObject, level: number): void {
    for (const [candidate, geometry] of object.levelGeometries) {
      if (candidate <= level) continue;
      geometry.dispose();
      object.levelGeometries.delete(candidate);
    }
  }
}
