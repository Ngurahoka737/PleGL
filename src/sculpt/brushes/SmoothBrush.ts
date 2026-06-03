import * as THREE from 'three';
import { Brush, type BrushContext } from '../Brush';

const MAX_SMOOTH_ITERATIONS = 4;

function iterationStrengths(strength: number): number[] {
  const clamped = THREE.MathUtils.clamp(strength, 0, 1);
  const fullIterations = Math.floor(clamped * MAX_SMOOTH_ITERATIONS);
  const last = MAX_SMOOTH_ITERATIONS * (clamped - fullIterations / MAX_SMOOTH_ITERATIONS);
  const result = Array.from({ length: fullIterations }, () => 1);
  if (last > 0) result.push(last);
  return result;
}

export class SmoothBrush extends Brush {
  readonly name = 'Smooth';
  private readonly position = new THREE.Vector3();
  private readonly average = new THREE.Vector3();
  private readonly neighbor = new THREE.Vector3();

  apply({ geometry, center, settings, neighbors, candidates }: BrushContext): boolean {
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    const radiusSquared = settings.radius * settings.radius;
    const indices = candidates ?? Array.from({ length: positions.count }, (_, index) => index);
    let changed = false;

    for (const strength of iterationStrengths(settings.strength * 5)) {
      const updates: number[] = [];

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

        const factor = THREE.MathUtils.clamp(strength * this.falloff(distance, settings.radius), 0, 1);
        if (factor <= 0) continue;
        updates.push(
          index,
          this.position.x + (this.average.x - this.position.x) * factor,
          this.position.y + (this.average.y - this.position.y) * factor,
          this.position.z + (this.average.z - this.position.z) * factor,
        );
      }

      for (let offset = 0; offset < updates.length; offset += 4) {
        positions.setXYZ(updates[offset], updates[offset + 1], updates[offset + 2], updates[offset + 3]);
      }
      changed ||= updates.length > 0;
    }
    return changed;
  }
}
