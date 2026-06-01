import { createQuadSphereGeometry } from '../src/primitives/QuadSpherePrimitive';
import { validateClosedIndexedGeometry } from '../src/utils/GeometryUtils';

for (const subdivisions of [0, 1, 2, 4, 5, 6]) {
  for (const catmullClarkIterations of [0, 1]) {
    const geometry = createQuadSphereGeometry({ subdivisions, catmullClarkIterations });
    const validation = validateClosedIndexedGeometry(geometry);
    if (!validation.valid) {
      throw new Error(`Invalid topology for subdivisions=${subdivisions}, iterations=${catmullClarkIterations}: ${JSON.stringify(validation)}`);
    }
    console.log({ subdivisions, catmullClarkIterations, ...validation });
  }
}
