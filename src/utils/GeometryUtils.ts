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

interface QuadNormalData {
  vertexFaces: number[][];
  faceNormals: Float32Array;
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

export function invalidateQuadNormalData(geometry: THREE.BufferGeometry): void {
  delete geometry.userData.quadNormalData;
}

function buildQuadNormalData(geometry: THREE.BufferGeometry, quadFaces: number[][]): QuadNormalData {
  const positions = geometry.getAttribute('position');
  const vertexFaces = Array.from({ length: positions.count }, () => [] as number[]);
  quadFaces.forEach((face, faceIndex) => {
    for (const vertex of face) vertexFaces[vertex].push(faceIndex);
  });
  const data = { vertexFaces, faceNormals: new Float32Array(quadFaces.length * 3) };
  geometry.userData.quadNormalData = data;
  return data;
}

function writeFaceNormal(
  positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  face: number[],
  target: Float32Array,
  faceIndex: number,
): void {
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
  const offset = faceIndex * 3;
  target[offset] = x;
  target[offset + 1] = y;
  target[offset + 2] = z;
}

export function recalculateQuadNormals(geometry: THREE.BufferGeometry, changedVertices?: number[]): void {
  const positions = geometry.getAttribute('position');
  const quadFaces = geometry.userData.quadFaces as number[][] | undefined;
  if (!quadFaces) {
    geometry.computeVertexNormals();
    return;
  }

  let normals = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (!normals || normals.count !== positions.count) {
    normals = new THREE.BufferAttribute(new Float32Array(positions.count * 3), 3);
    geometry.setAttribute('normal', normals);
  }

  let data = geometry.userData.quadNormalData as QuadNormalData | undefined;
  if (!data || data.faceNormals.length !== quadFaces.length * 3 || data.vertexFaces.length !== positions.count) {
    data = buildQuadNormalData(geometry, quadFaces);
  }

  if (changedVertices?.length) {
    const affectedFaces = new Set<number>();
    const normalVertices = new Set<number>();
    for (const vertex of changedVertices) {
      for (const faceIndex of data.vertexFaces[vertex] ?? []) affectedFaces.add(faceIndex);
    }
    for (const faceIndex of affectedFaces) {
      const face = quadFaces[faceIndex];
      writeFaceNormal(positions, face, data.faceNormals, faceIndex);
      for (const vertex of face) normalVertices.add(vertex);
    }
    for (const vertex of normalVertices) {
      let x = 0;
      let y = 0;
      let z = 0;
      for (const faceIndex of data.vertexFaces[vertex]) {
        const offset = faceIndex * 3;
        x += data.faceNormals[offset];
        y += data.faceNormals[offset + 1];
        z += data.faceNormals[offset + 2];
      }
      const length = Math.hypot(x, y, z) || 1;
      normals.setXYZ(vertex, x / length, y / length, z / length);
    }
    normals.needsUpdate = true;
    return;
  }

  const normalArray = normals.array as Float32Array;
  normalArray.fill(0);
  for (let faceIndex = 0; faceIndex < quadFaces.length; faceIndex += 1) {
    const face = quadFaces[faceIndex];
    writeFaceNormal(positions, face, data.faceNormals, faceIndex);
    const offset = faceIndex * 3;
    for (const index of face) {
      normalArray[index * 3] += data.faceNormals[offset];
      normalArray[index * 3 + 1] += data.faceNormals[offset + 1];
      normalArray[index * 3 + 2] += data.faceNormals[offset + 2];
    }
  }

  for (let index = 0; index < positions.count; index += 1) {
    const offset = index * 3;
    const length = Math.hypot(normalArray[offset], normalArray[offset + 1], normalArray[offset + 2]) || 1;
    normalArray[offset] /= length;
    normalArray[offset + 1] /= length;
    normalArray[offset + 2] /= length;
  }
  normals.needsUpdate = true;
}
