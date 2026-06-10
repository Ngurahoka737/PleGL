import * as THREE from 'three';

export class MeshFactory {
  static createCube(size = 1): THREE.BufferGeometry {
    const geometry = new THREE.BoxGeometry(size, size, size, 1, 1, 1);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    geometry.userData.primitive = 'cube';
    return geometry;
  }

  static createCylinder(radius = 0.5, height = 1.25, segments = 32): THREE.BufferGeometry {
    const geometry = new THREE.CylinderGeometry(radius, radius, height, segments, 1, false);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    geometry.userData.primitive = 'cylinder';
    return geometry;
  }
}
