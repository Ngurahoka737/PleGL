import * as THREE from 'three';
import { createQuadSphereGeometry, type QuadSphereOptions } from '../primitives/QuadSpherePrimitive';
import { SculptEngine } from '../wasm/SculptEngine';

export class MeshManager {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly sculptEngine: SculptEngine;
  private readonly wireframeOverlay = new THREE.Group();
  private wireframeEnabled = false;

  constructor(scene: THREE.Scene, options: QuadSphereOptions = {}) {
    const material = new THREE.MeshStandardMaterial({
      color: 0xaab4c5,
      roughness: 0.72,
      metalness: 0.08,
      flatShading: false,
    });
    this.mesh = new THREE.Mesh(createQuadSphereGeometry(options), material);
    this.sculptEngine = new SculptEngine(() => this.mesh.geometry);
    scene.add(this.mesh);
    this.mesh.add(this.wireframeOverlay);
    this.rebuildWireframeOverlay();
  }

  replaceQuadSphere(options: QuadSphereOptions): void {
    const previous = this.mesh.geometry;
    this.mesh.geometry = createQuadSphereGeometry(options);
    const resolved = this.mesh.geometry.userData.options as Required<QuadSphereOptions>;
    this.sculptEngine.createQuadSphere(resolved.radius, resolved.subdivisions);
    previous.dispose();
    this.rebuildWireframeOverlay();
  }

  recalculateSurface(): void {
    const position = this.mesh.geometry.getAttribute('position');
    position.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
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

}
