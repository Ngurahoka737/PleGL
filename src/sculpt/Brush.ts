import * as THREE from 'three';

export interface BrushSettings {
  radius: number;
  strength: number;
  invert: boolean;
}

export interface BrushContext {
  geometry: THREE.BufferGeometry;
  center: THREE.Vector3;
  settings: BrushSettings;
  neighbors: number[][];
}

export abstract class Brush {
  abstract readonly name: string;
  abstract apply(context: BrushContext): boolean;

  protected falloff(distance: number, radius: number): number {
    const t = THREE.MathUtils.clamp(1 - distance / radius, 0, 1);
    return t * t * (3 - 2 * t);
  }
}
