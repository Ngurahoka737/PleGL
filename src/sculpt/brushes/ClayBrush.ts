import * as THREE from 'three';
import { Brush, type BrushContext } from '../Brush';

export class ClayBrush extends Brush {
  readonly name = 'Clay';
  private readonly position = new THREE.Vector3();
  private readonly planePoint = new THREE.Vector3();

  applyWithPlane({ geometry, center, settings, candidates }: BrushContext, planeNormal: THREE.Vector3): boolean {
    const positions = geometry.getAttribute('position');
    const normal = planeNormal.clone().normalize();
    const direction = settings.invert ? -1 : 1;
    const radiusSquared = settings.radius * settings.radius;
    const indices = candidates ?? Array.from({ length: positions.count }, (_, index) => index);
    this.planePoint.copy(center).addScaledVector(normal, direction * settings.radius * 0.08);
    let changed = false;

    for (const index of indices) {
      this.position.fromBufferAttribute(positions, index);
      const distanceSquared = this.position.distanceToSquared(center);
      if (distanceSquared > radiusSquared) continue;
      const distance = Math.sqrt(distanceSquared);
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
