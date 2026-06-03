import * as THREE from 'three';
import { Brush, type BrushContext, type BrushSettings } from '../Brush';

interface GrabbedVertex {
  index: number;
  weight: number;
  x: number;
  y: number;
  z: number;
}

export class MoveBrush extends Brush {
  readonly name = 'Move';
  private grabbed: GrabbedVertex[] = [];

  begin({ geometry, center, settings, candidates }: BrushContext): void {
    const positions = geometry.getAttribute('position');
    const indices = candidates ?? Array.from({ length: positions.count }, (_, index) => index);
    const radiusSquared = settings.radius * settings.radius;
    const position = new THREE.Vector3();

    this.grabbed = [];
    for (const index of indices) {
      position.fromBufferAttribute(positions, index);
      const distanceSquared = position.distanceToSquared(center);
      if (distanceSquared > radiusSquared) continue;
      this.grabbed.push({
        index,
        weight: this.falloff(Math.sqrt(distanceSquared), settings.radius),
        x: position.x,
        y: position.y,
        z: position.z,
      });
    }

    geometry.userData.lastBrushCandidates = this.grabbed.map((vertex) => vertex.index);
  }

  applyMove(geometry: THREE.BufferGeometry, delta: THREE.Vector3, settings: BrushSettings): boolean {
    if (this.grabbed.length === 0) return false;

    const positions = geometry.getAttribute('position');
    const direction = settings.invert ? -1 : 1;
    for (const vertex of this.grabbed) {
      const influence = vertex.weight * direction;
      positions.setXYZ(
        vertex.index,
        vertex.x + delta.x * influence,
        vertex.y + delta.y * influence,
        vertex.z + delta.z * influence,
      );
    }
    geometry.userData.lastBrushCandidates = this.grabbed.map((vertex) => vertex.index);
    return true;
  }

  apply(_context: BrushContext): boolean {
    throw new Error('Move Brush requires a drag delta.');
  }
}
