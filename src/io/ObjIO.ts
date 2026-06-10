import * as THREE from 'three';

export interface IndexedGeometryData {
  positions: number[];
  indices: number[];
}

export function bufferGeometryToIndexedData(geometry: THREE.BufferGeometry): IndexedGeometryData {
  const positionsAttribute = geometry.getAttribute('position');
  const positions: number[] = [];
  for (let vertex = 0; vertex < positionsAttribute.count; vertex += 1) {
    positions.push(
      positionsAttribute.getX(vertex),
      positionsAttribute.getY(vertex),
      positionsAttribute.getZ(vertex),
    );
  }

  const indices: number[] = [];
  const index = geometry.getIndex();
  if (index) {
    for (let item = 0; item < index.count; item += 1) indices.push(index.getX(item));
  } else {
    for (let item = 0; item < positionsAttribute.count; item += 1) indices.push(item);
  }

  return { positions, indices };
}

export function indexedGeometryToObj(data: IndexedGeometryData): string {
  const lines: string[] = ['# PixRemesh Instant Meshes experiment export'];
  for (let index = 0; index < data.positions.length; index += 3) {
    lines.push(`v ${data.positions[index]} ${data.positions[index + 1]} ${data.positions[index + 2]}`);
  }
  for (let index = 0; index < data.indices.length; index += 3) {
    lines.push(`f ${data.indices[index] + 1} ${data.indices[index + 1] + 1} ${data.indices[index + 2] + 1}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function objToBufferGeometry(obj: string): THREE.BufferGeometry {
  const vertices: number[] = [];
  const parsedFaces: number[][] = [];

  for (const rawLine of obj.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    if (parts[0] === 'v' && parts.length >= 4) {
      vertices.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
      continue;
    }
    if (parts[0] !== 'f' || parts.length < 4) continue;

    const face = parts.slice(1).map((token) => {
      const vertex = Number(token.split('/')[0]);
      return vertex < 0 ? vertices.length / 3 + vertex : vertex - 1;
    });
    if (face.every((vertex) => Number.isInteger(vertex) && vertex >= 0 && vertex < vertices.length / 3)) parsedFaces.push(face);
  }

  const mainFaces = keepLargestFaceComponent(parsedFaces);
  const quads = mainFaces.filter((face) => face.length === 4).map((face) => [face[0], face[1], face[2], face[3]]);
  const nonQuadCount = mainFaces.length - quads.length;
  const indices: number[] = [];
  for (const [a, b, c, d] of quads) indices.push(a, b, c, a, c, d);

  if (vertices.length < 9 || indices.length < 3 || quads.length === 0) {
    throw new Error('Instant Meshes returned an OBJ without usable vertices/faces.');
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  geometry.userData.primitive = 'pix-remesh';
  geometry.userData.instantMeshesStats = {
    faces: mainFaces.length,
    quads: quads.length,
    removedFaces: parsedFaces.length - mainFaces.length,
    nonQuadFaces: nonQuadCount,
  };
  if (quads.length > 0) {
    geometry.userData.quadFaces = quads;
    geometry.userData.wireframeLevels = [new Uint32Array(), new Uint32Array(), buildQuadEdges(quads)];
  }
  return geometry;
}

function keepLargestFaceComponent(faces: number[][]): number[][] {
  if (faces.length === 0) return faces;

  const vertexFaces = new Map<number, number[]>();
  faces.forEach((face, faceIndex) => {
    for (const vertex of face) {
      const bucket = vertexFaces.get(vertex);
      if (bucket) {
        bucket.push(faceIndex);
      } else {
        vertexFaces.set(vertex, [faceIndex]);
      }
    }
  });

  const visited = new Uint8Array(faces.length);
  let largest: number[] = [];
  for (let start = 0; start < faces.length; start += 1) {
    if (visited[start]) continue;
    const component: number[] = [];
    const stack = [start];
    visited[start] = 1;
    while (stack.length > 0) {
      const faceIndex = stack.pop()!;
      component.push(faceIndex);
      for (const vertex of faces[faceIndex]) {
        for (const neighbor of vertexFaces.get(vertex) ?? []) {
          if (visited[neighbor]) continue;
          visited[neighbor] = 1;
          stack.push(neighbor);
        }
      }
    }
    if (component.length > largest.length) largest = component;
  }

  return largest.map((faceIndex) => faces[faceIndex]);
}

function buildQuadEdges(quads: number[][]): Uint32Array {
  const edges: number[] = [];
  const visited = new Set<string>();
  const key = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
  for (const quad of quads) {
    for (let index = 0; index < 4; index += 1) {
      const a = quad[index];
      const b = quad[(index + 1) % 4];
      const edge = key(a, b);
      if (visited.has(edge)) continue;
      visited.add(edge);
      edges.push(a, b);
    }
  }
  return new Uint32Array(edges);
}
