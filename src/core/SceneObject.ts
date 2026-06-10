import * as THREE from 'three';

export interface SceneObjectTransform {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

export class SceneObject {
  readonly id: string;
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly levelGeometries = new Map<number, THREE.BufferGeometry>();
  name: string;
  visible = true;
  selected = false;
  subdivisionLevel = 0;

  constructor(id: string, name: string, mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>) {
    this.id = id;
    this.name = name;
    this.mesh = mesh;
    this.mesh.name = name;
  }

  get transform(): SceneObjectTransform {
    return {
      position: this.mesh.position,
      rotation: this.mesh.rotation,
      scale: this.mesh.scale,
    };
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.mesh.visible = visible;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    for (const geometry of this.levelGeometries.values()) {
      if (geometry !== this.mesh.geometry) geometry.dispose();
    }
    this.levelGeometries.clear();
  }
}
