import * as THREE from 'three';
import { Brush, type BrushContext } from '../Brush';

export class ClayBrush extends Brush {
  readonly name = 'Clay';
  private readonly position = new THREE.Vector3();
  private readonly planePoint = new THREE.Vector3();

  applyWithPlane({ geometry, center, settings }: BrushContext, planeNormal: THREE.Vector3): boolean {
    const positions = geometry.getAttribute('position');
    const normal = planeNormal.clone().normalize();
    const direction = settings.invert ? -1 : 1;
    this.planePoint.copy(center).addScaledVector(normal, direction * settings.radius * 0.08);
    let changed = false;

    for (let index = 0; index < positions.count; index += 1) {
      this.position.fromBufferAttribute(positions, index);
      const distance = this.position.distanceTo(center);
      if (distance > settings.radius) continue;
      const signedDistance = this.position.clone().sub(this.planePoint).dot(normal);
      this.position.addScaledVector(normal, -signedDistance * settings.strength * 12 * this.falloff(distance, settings.radius));
      positions.setXYZ(index, this.position.x, this.position.y, this.position.z);
      changed = true;
    }
    return changed;
  }

  apply(_context: BrushContext): boolean {
    throw new Error('Clay Brush requires a brush plane normal.');
  }
}
