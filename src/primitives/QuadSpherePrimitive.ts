import * as THREE from 'three';
import { recalculateQuadNormals } from '../utils/GeometryUtils';

interface Vertex {
  position: THREE.Vector3;
  cubePosition: THREE.Vector3;
}

interface Face {
  indices: number[];
}

interface Topology {
  vertices: Vertex[];
  faces: Face[];
}

interface Edge {
  a: number;
  b: number;
  faces: number[];
}

export interface QuadSphereOptions {
  radius?: number;
  subdivisions?: number;
  catmullClarkIterations?: number;
}

const edgeKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
const clampInteger = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value)));

function createCubeTopology(): Topology {
  const points = [
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
  ] as const;
  const vertices = points.map(([x, y, z]) => {
    const position = new THREE.Vector3(x, y, z);
    return { position, cubePosition: position.clone() };
  });

  // Six outward-facing quads share the same eight cube vertices.
  const faces = [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 4, 7, 3],
    [1, 2, 6, 5],
    [0, 1, 5, 4],
    [3, 7, 6, 2],
  ].map((indices) => ({ indices }));

  return { vertices, faces };
}

function subdivideCatmullClark(topology: Topology): Topology {
  const edges = new Map<string, Edge>();
  const vertexFaces = topology.vertices.map(() => [] as number[]);
  const vertexEdges = topology.vertices.map(() => new Set<string>());
  const facePoints = topology.faces.map((face, faceIndex) => {
    const point = new THREE.Vector3();
    for (const vertexIndex of face.indices) {
      point.add(topology.vertices[vertexIndex].position);
      vertexFaces[vertexIndex].push(faceIndex);
      const nextIndex = face.indices[(face.indices.indexOf(vertexIndex) + 1) % face.indices.length];
      const key = edgeKey(vertexIndex, nextIndex);
      const edge = edges.get(key) ?? { a: vertexIndex, b: nextIndex, faces: [] };
      edge.faces.push(faceIndex);
      edges.set(key, edge);
      vertexEdges[vertexIndex].add(key);
      vertexEdges[nextIndex].add(key);
    }
    return point.multiplyScalar(1 / face.indices.length);
  });

  const vertices: Vertex[] = topology.vertices.map((vertex, vertexIndex) => {
    const adjacentFaces = vertexFaces[vertexIndex];
    const adjacentEdges = [...vertexEdges[vertexIndex]];
    const faceAverage = new THREE.Vector3();
    const edgeMidpointAverage = new THREE.Vector3();
    for (const faceIndex of adjacentFaces) faceAverage.add(facePoints[faceIndex]);
    for (const key of adjacentEdges) {
      const edge = edges.get(key)!;
      edgeMidpointAverage.add(
        topology.vertices[edge.a].position.clone().add(topology.vertices[edge.b].position).multiplyScalar(0.5),
      );
    }
    const count = adjacentFaces.length;
    faceAverage.multiplyScalar(1 / count);
    edgeMidpointAverage.multiplyScalar(1 / adjacentEdges.length);
    return {
      position: faceAverage
        .addScaledVector(edgeMidpointAverage, 2)
        .addScaledVector(vertex.position, count - 3)
        .multiplyScalar(1 / count),
      cubePosition: vertex.cubePosition.clone(),
    };
  });

  const edgePointIndices = new Map<string, number>();
  for (const [key, edge] of edges) {
    const point = topology.vertices[edge.a].position.clone().add(topology.vertices[edge.b].position);
    for (const faceIndex of edge.faces) point.add(facePoints[faceIndex]);
    edgePointIndices.set(key, vertices.length);
    vertices.push({
      position: point.multiplyScalar(1 / (2 + edge.faces.length)),
      cubePosition: topology.vertices[edge.a].cubePosition
        .clone()
        .add(topology.vertices[edge.b].cubePosition)
        .multiplyScalar(0.5),
    });
  }

  const facePointIndices = facePoints.map((point, faceIndex) => {
    const face = topology.faces[faceIndex];
    const cubePosition = new THREE.Vector3();
    for (const vertexIndex of face.indices) cubePosition.add(topology.vertices[vertexIndex].cubePosition);
    vertices.push({ position: point, cubePosition: cubePosition.multiplyScalar(1 / face.indices.length) });
    return vertices.length - 1;
  });

  const faces: Face[] = [];
  topology.faces.forEach((face, faceIndex) => {
    face.indices.forEach((vertexIndex, index) => {
      const previous = face.indices[(index + face.indices.length - 1) % face.indices.length];
      const next = face.indices[(index + 1) % face.indices.length];
      faces.push({
        indices: [
          vertexIndex,
          edgePointIndices.get(edgeKey(vertexIndex, next))!,
          facePointIndices[faceIndex],
          edgePointIndices.get(edgeKey(previous, vertexIndex))!,
        ],
      });
    });
  });

  return { vertices, faces };
}

function relaxOnSphere(topology: Topology, radius: number, iterations = 32): THREE.Vector3[] {
  const neighbors = topology.vertices.map(() => new Set<number>());
  for (const face of topology.faces) {
    face.indices.forEach((vertexIndex, index) => {
      const next = face.indices[(index + 1) % face.indices.length];
      neighbors[vertexIndex].add(next);
      neighbors[next].add(vertexIndex);
    });
  }

  let positions = topology.vertices.map((vertex) => vertex.position.clone().normalize().multiplyScalar(radius));
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    positions = positions.map((position, vertexIndex) => {
      const average = new THREE.Vector3();
      for (const neighbor of neighbors[vertexIndex]) average.add(positions[neighbor]);
      average.multiplyScalar(1 / neighbors[vertexIndex].size).normalize().multiplyScalar(radius);
      return position.clone().lerp(average, 0.5).normalize().multiplyScalar(radius);
    });
  }
  return positions;
}

export function createQuadSphereGeometry(options: QuadSphereOptions = {}): THREE.BufferGeometry {
  const radius = Math.max(0.001, options.radius ?? 1);
  const subdivisions = clampInteger(options.subdivisions ?? 5, 0, 7);
  const iterations = clampInteger(options.catmullClarkIterations ?? 0, 0, 2);
  const totalLevels = subdivisions + iterations;
  let topology = createCubeTopology();

  for (let iteration = 0; iteration < totalLevels; iteration += 1) {
    topology = subdivideCatmullClark(topology);
  }

  const positions = new Float32Array(topology.vertices.length * 3);
  relaxOnSphere(topology, radius).forEach((position, index) => position.toArray(positions, index * 3));

  const indices: number[] = [];
  for (const face of topology.faces) {
    indices.push(face.indices[0], face.indices[1], face.indices[2]);
    indices.push(face.indices[0], face.indices[2], face.indices[3]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.userData.primitive = 'quad-sphere';
  geometry.userData.options = { radius, subdivisions, catmullClarkIterations: iterations };
  geometry.userData.quadFaces = topology.faces.map((face) => [...face.indices]);
  geometry.userData.wireframeLevels = createWireframeLevels(topology, 2 ** totalLevels);
  recalculateQuadNormals(geometry);
  geometry.computeBoundingSphere();
  return geometry;
}

function createWireframeLevels(topology: Topology, resolution: number): Uint32Array[] {
  const levels = [[], [], []] as number[][];
  const visited = new Set<string>();
  const epsilon = 1e-5;

  for (const face of topology.faces) {
    face.indices.forEach((a, edgeIndex) => {
      const b = face.indices[(edgeIndex + 1) % face.indices.length];
      const key = edgeKey(a, b);
      if (visited.has(key)) return;
      visited.add(key);

      const start = topology.vertices[a].cubePosition;
      const end = topology.vertices[b].cubePosition;
      const fixedCoordinates: number[] = [];
      for (const axis of ['x', 'y', 'z'] as const) {
        if (Math.abs(start[axis] - end[axis]) < epsilon) fixedCoordinates.push(start[axis]);
      }

      const gridCoordinate = fixedCoordinates.find((value) => Math.abs(Math.abs(value) - 1) > epsilon);
      const gridIndex = gridCoordinate === undefined ? 0 : Math.round(((gridCoordinate + 1) * resolution) / 2);
      const level = gridIndex % 4 === 0 ? 0 : gridIndex % 2 === 0 ? 1 : 2;
      levels[level].push(a, b);
    });
  }

  return levels.map((level) => new Uint32Array(level));
}
