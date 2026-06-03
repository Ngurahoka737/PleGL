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
  const cached = geometry.userData.vertexNeighbors as number[][] | undefined;
  if (cached) return cached;

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
    const result = neighbors.map((items) => [...items]);
    geometry.userData.vertexNeighbors = result;
    return result;
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
  const result = neighbors.map((items) => [...items]);
  geometry.userData.vertexNeighbors = result;
  return result;
}

interface BrushGrid {
  cellSize: number;
  cells: Map<string, number[]>;
}

const BRUSH_GRID_CELL_SIZE = 0.12;
const BRUSH_GRID_MARGIN = 0.08;

const cellKey = (x: number, y: number, z: number): string => `${x}:${y}:${z}`;

export function invalidateBrushAcceleration(geometry: THREE.BufferGeometry): void {
  delete geometry.userData.brushGrid;
}

export function rebuildBrushAcceleration(geometry: THREE.BufferGeometry): void {
  const positions = geometry.getAttribute('position');
  const cells = new Map<string, number[]>();

  for (let index = 0; index < positions.count; index += 1) {
    const x = Math.floor(positions.getX(index) / BRUSH_GRID_CELL_SIZE);
    const y = Math.floor(positions.getY(index) / BRUSH_GRID_CELL_SIZE);
    const z = Math.floor(positions.getZ(index) / BRUSH_GRID_CELL_SIZE);
    const key = cellKey(x, y, z);
    const list = cells.get(key);
    if (list) list.push(index);
    else cells.set(key, [index]);
  }

  geometry.userData.brushGrid = { cellSize: BRUSH_GRID_CELL_SIZE, cells } satisfies BrushGrid;
}

export function queryBrushCandidates(
  geometry: THREE.BufferGeometry,
  center: THREE.Vector3,
  radius: number,
): number[] {
  if (!geometry.userData.brushGrid) rebuildBrushAcceleration(geometry);
  const grid = geometry.userData.brushGrid as BrushGrid;
  const searchRadius = radius + BRUSH_GRID_MARGIN;
  const minX = Math.floor((center.x - searchRadius) / grid.cellSize);
  const minY = Math.floor((center.y - searchRadius) / grid.cellSize);
  const minZ = Math.floor((center.z - searchRadius) / grid.cellSize);
  const maxX = Math.floor((center.x + searchRadius) / grid.cellSize);
  const maxY = Math.floor((center.y + searchRadius) / grid.cellSize);
  const maxZ = Math.floor((center.z + searchRadius) / grid.cellSize);
  const result: number[] = [];

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const vertices = grid.cells.get(cellKey(x, y, z));
        if (vertices) result.push(...vertices);
      }
    }
  }

  return result;
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
