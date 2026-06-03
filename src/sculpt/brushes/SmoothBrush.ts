import * as THREE from 'three';
import { Brush, type BrushContext } from '../Brush';

export class SmoothBrush extends Brush {
  readonly name = 'Smooth';
  private readonly position = new THREE.Vector3();
  private readonly average = new THREE.Vector3();
  private readonly neighbor = new THREE.Vector3();

  apply({ geometry, center, settings, neighbors, candidates }: BrushContext): boolean {
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    const next = new Float32Array(positions.array as ArrayLike<number>);
    const radiusSquared = settings.radius * settings.radius;
    const indices = candidates ?? Array.from({ length: positions.count }, (_, index) => index);
    let changed = false;

    for (const index of indices) {
      this.position.fromBufferAttribute(positions, index);
      const distanceSquared = this.position.distanceToSquared(center);
      if (distanceSquared > radiusSquared || neighbors[index].length === 0) continue;
      const distance = Math.sqrt(distanceSquared);

      this.average.set(0, 0, 0);
      for (const neighborIndex of neighbors[index]) {
        this.neighbor.fromBufferAttribute(positions, neighborIndex);
        this.average.add(this.neighbor);
      }
      this.average.multiplyScalar(1 / neighbors[index].length);
      const influence = settings.strength * 5 * this.falloff(distance, settings.radius);
      this.position.lerp(this.average, THREE.MathUtils.clamp(influence, 0, 1));
      this.position.toArray(next, index * 3);
      changed = true;
    }

    if (changed) positions.copyArray(next);
    return changed;
  }
}
