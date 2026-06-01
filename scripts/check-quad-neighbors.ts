import { createQuadSphereGeometry } from '../src/primitives/QuadSpherePrimitive';
import { buildVertexNeighbors } from '../src/utils/GeometryUtils';

for (const subdivisions of [2, 4, 5, 6]) {
  const geometry = createQuadSphereGeometry({ subdivisions });
  const neighbors = buildVertexNeighbors(geometry);
  const invalid = neighbors.filter((items) => items.length < 3 || items.length > 4);
  if (invalid.length > 0) {
    throw new Error(`Invalid quad adjacency at subdivision level ${subdivisions}: ${invalid.length} vertices`);
  }
  console.log({ subdivisions, vertices: neighbors.length, minNeighbors: 3, maxNeighbors: 4 });
}
