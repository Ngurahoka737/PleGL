import * as THREE from 'three';
import { createQuadSphereGeometry, type QuadSphereOptions } from '../primitives/QuadSpherePrimitive';
import { recalculateQuadNormals } from '../utils/GeometryUtils';
import { SculptEngine } from '../wasm/SculptEngine';

export class MeshManager {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly sculptEngine: SculptEngine;
  private readonly wireframeOverlay = new THREE.Group();
  private readonly levelGeometries = new Map<number, THREE.BufferGeometry>();
  private wireframeEnabled = false;
  private subdivisionLevel: number;

  constructor(scene: THREE.Scene, options: QuadSphereOptions = {}) {
    const material = new THREE.MeshStandardMaterial({
      color: 0xaab4c5,
      roughness: 0.72,
      metalness: 0.08,
      flatShading: false,
    });
    this.mesh = new THREE.Mesh(createQuadSphereGeometry(options), material);
    this.subdivisionLevel = (this.mesh.geometry.userData.options as Required<QuadSphereOptions>).subdivisions;
    this.levelGeometries.set(this.subdivisionLevel, this.mesh.geometry);
    this.sculptEngine = new SculptEngine(() => this.mesh.geometry);
    scene.add(this.mesh);
    this.mesh.add(this.wireframeOverlay);
    this.rebuildWireframeOverlay();
  }

  replaceQuadSphere(options: QuadSphereOptions): void {
    for (const geometry of this.levelGeometries.values()) geometry.dispose();
    this.levelGeometries.clear();
    this.mesh.geometry = createQuadSphereGeometry(options);
    const resolved = this.mesh.geometry.userData.options as Required<QuadSphereOptions>;
    this.subdivisionLevel = resolved.subdivisions;
    this.levelGeometries.set(this.subdivisionLevel, this.mesh.geometry);
    this.sculptEngine.createQuadSphere(resolved.radius, resolved.subdivisions);
    this.rebuildWireframeOverlay();
  }

  setSubdivisionLevel(targetLevel: number): number {
    const clamped = THREE.MathUtils.clamp(Math.round(targetLevel), 0, 7);
    if (clamped === this.subdivisionLevel) return this.subdivisionLevel;

    if (clamped < this.subdivisionLevel) {
      const previous = this.levelGeometries.get(clamped);
      if (!previous) return this.subdivisionLevel;
      this.mesh.geometry = previous;
      this.subdivisionLevel = clamped;
      this.sculptEngine.restoreCoarseLevel();
      this.discardLevelsAbove(clamped);
      this.rebuildWireframeOverlay();
      return this.subdivisionLevel;
    }

    while (this.subdivisionLevel < clamped) {
      const next = this.subdivideGeometry(this.mesh.geometry);
      this.mesh.geometry = next;
      this.subdivisionLevel += 1;
      this.levelGeometries.set(this.subdivisionLevel, next);
      this.sculptEngine.subdivideCurrent();
    }
    this.rebuildWireframeOverlay();
    return this.subdivisionLevel;
  }

  recalculateSurface(): void {
    const position = this.mesh.geometry.getAttribute('position');
    position.needsUpdate = true;
    recalculateQuadNormals(this.mesh.geometry);
    this.mesh.geometry.getAttribute('normal').needsUpdate = true;
    this.mesh.geometry.computeBoundingSphere();
    this.mesh.geometry.computeBoundingBox();
    this.updateWireframeOverlay();
  }

  setWireframe(enabled: boolean): void {
    this.wireframeEnabled = enabled;
    this.wireframeOverlay.visible = enabled;
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
    const levels = this.mesh.geometry.userData.wireframeLevels as Uint32Array[];

    levels.forEach((indices, level) => {
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

  private updateWireframeOverlay(): void {
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

  private subdivideGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
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
    geometry.userData.options = { ...(source.userData.options as object), subdivisions: this.subdivisionLevel + 1 };
    geometry.userData.quadFaces = nextFaces;
    geometry.userData.wireframeLevels = this.subdivideWireframeLevels(nextFaces, source.userData.wireframeLevels as Uint32Array[], edgePoints);
    recalculateQuadNormals(geometry);
    geometry.computeBoundingSphere();
    return geometry;
  }

  private subdivideWireframeLevels(faces: number[][], levels: Uint32Array[], edgePoints: Map<string, number>): Uint32Array[] {
    const key = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
    const inherited = new Map<string, number>();
    levels.forEach((indices, level) => {
      for (let index = 0; index < indices.length; index += 2) {
        const a = indices[index], b = indices[index + 1], midpoint = edgePoints.get(key(a, b))!;
        // Each Divide inserts a new minor line between the existing lines.
        // Promote inherited lines so the visible hierarchy stays 4x4 and 2x2.
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

  private discardLevelsAbove(level: number): void {
    for (const [candidate, geometry] of this.levelGeometries) {
      if (candidate <= level) continue;
      geometry.dispose();
      this.levelGeometries.delete(candidate);
    }
  }

}
