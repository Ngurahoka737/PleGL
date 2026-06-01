import * as THREE from 'three';
import { Brush, type BrushContext } from '../Brush';

export class DrawBrush extends Brush {
  readonly name = 'Draw';
  private readonly position = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();

  apply({ geometry, center, settings }: BrushContext): boolean {
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const direction = settings.invert ? -1 : 1;
    let changed = false;

    for (let index = 0; index < positions.count; index += 1) {
      this.position.fromBufferAttribute(positions, index);
      const distance = this.position.distanceTo(center);
      if (distance > settings.radius) continue;
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
