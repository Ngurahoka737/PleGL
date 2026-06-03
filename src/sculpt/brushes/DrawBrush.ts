import * as THREE from 'three';
import { Brush, type BrushContext } from '../Brush';

export class DrawBrush extends Brush {
  readonly name = 'Draw';
  private readonly position = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();

  apply({ geometry, center, settings, candidates }: BrushContext): boolean {
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const direction = settings.invert ? -1 : 1;
    const radiusSquared = settings.radius * settings.radius;
    const indices = candidates ?? Array.from({ length: positions.count }, (_, index) => index);
    let changed = false;

    for (const index of indices) {
      this.position.fromBufferAttribute(positions, index);
      const distanceSquared = this.position.distanceToSquared(center);
      if (distanceSquared > radiusSquared) continue;
      const distance = Math.sqrt(distanceSquared);
      this.normal.fromBufferAttribute(normals, index);
      this.position.addScaledVector(
        this.normal,
        direction * settings.strength * this.falloff(distance, settings.radius),
      );
      positions.setXYZ(index, this.position.x, this.position.y, this.position.z);
      changed = true;
    }
    return changed;
  }
}
