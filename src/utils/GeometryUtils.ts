import * as THREE from 'three';

export interface GeometryValidation {
  vertices: number;
  triangles: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
  duplicatePositions: number;
  valid: boolean;
}

export function validateClosedIndexedGeometry(geometry: THREE.BufferGeometry): GeometryValidation {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!index) throw new Error('Expected indexed geometry.');

  const edges = new Map<string, number>();
  for (let offset = 0; offset < index.count; offset += 3) {
    for (let edge = 0; edge < 3; edge += 1) {
      const a = index.getX(offset + edge);
      const b = index.getX(offset + ((edge + 1) % 3));
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }

  const positions = new Set<string>();
  let duplicatePositions = 0;
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const key = `${position.getX(vertex).toFixed(7)}:${position.getY(vertex).toFixed(7)}:${position.getZ(vertex).toFixed(7)}`;
    if (positions.has(key)) duplicatePositions += 1;
    positions.add(key);
  }

  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const count of edges.values()) {
    if (count === 1) boundaryEdges += 1;
    if (count > 2) nonManifoldEdges += 1;
  }

  return {
    vertices: position.count,
    triangles: index.count / 3,
    boundaryEdges,
    nonManifoldEdges,
    duplicatePositions,
    valid: boundaryEdges === 0 && nonManifoldEdges === 0 && duplicatePositions === 0,
  };
}

export function buildVertexNeighbors(geometry: THREE.BufferGeometry): number[][] {
  const position = geometry.getAttribute('position');
  const quadFaces = geometry.userData.quadFaces as number[][] | undefined;
  if (quadFaces) {
    const neighbors = Array.from({ length: position.count }, () => new Set<number>());
    for (const face of quadFaces) {
      face.forEach((a, index) => {
        const b = face[(index + 1) % face.length];
        neighbors[a].add(b);
        neighbors[b].add(a);
      });
    }
    return neighbors.map((items) => [...items]);
  }
  const index = geometry.getIndex();
  if (!index) throw new Error('Expected indexed geometry.');
  const neighbors = Array.from({ length: position.count }, () => new Set<number>());
  for (let offset = 0; offset < index.count; offset += 3) {
    const a = index.getX(offset);
    const b = index.getX(offset + 1);
    const c = index.getX(offset + 2);
    neighbors[a].add(b).add(c);
    neighbors[b].add(a).add(c);
    neighbors[c].add(a).add(b);
  }
  return neighbors.map((items) => [...items]);
}

export function recalculateQuadNormals(geometry: THREE.BufferGeometry): void {
  const positions = geometry.getAttribute('position');
  const quadFaces = geometry.userData.quadFaces as number[][] | undefined;
  if (!quadFaces) {
    geometry.computeVertexNormals();
    return;
  }

  const normals = new Float32Array(positions.count * 3);
  for (const face of quadFaces) {
    let x = 0;
    let y = 0;
    let z = 0;
    face.forEach((index, edge) => {
      const next = face[(edge + 1) % face.length];
      const ax = positions.getX(index), ay = positions.getY(index), az = positions.getZ(index);
      const bx = positions.getX(next), by = positions.getY(next), bz = positions.getZ(next);
      x += (ay - by) * (az + bz);
      y += (az - bz) * (ax + bx);
      z += (ax - bx) * (ay + by);
    });
    for (const index of face) {
      normals[index * 3] += x;
      normals[index * 3 + 1] += y;
      normals[index * 3 + 2] += z;
    }
  }

  for (let index = 0; index < positions.count; index += 1) {
    const offset = index * 3;
    const length = Math.hypot(normals[offset], normals[offset + 1], normals[offset + 2]) || 1;
    normals[offset] /= length;
    normals[offset + 1] /= length;
    normals[offset + 2] /= length;
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
}
