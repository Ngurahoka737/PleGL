import * as THREE from 'three';
import type { BrushSettings } from '../sculpt/Brush';
import { DrawBrush } from '../sculpt/brushes/DrawBrush';
import { SmoothBrush } from '../sculpt/brushes/SmoothBrush';
import { ClayBrush } from '../sculpt/brushes/ClayBrush';
import { buildVertexNeighbors, queryBrushCandidates } from '../utils/GeometryUtils';

interface EmbindVector<T> {
  size(): number;
  get(index: number): T;
  delete(): void;
}

interface WasmEngine {
  createQuadSphere(radius: number, subdivisionLevel: number): void;
  subdivideCurrent(): void;
  restoreCoarseLevel(): boolean;
  applyDraw(x: number, y: number, z: number, radius: number, strength: number, invert: boolean): boolean;
  applySmooth(x: number, y: number, z: number, radius: number, strength: number): boolean;
  applyClay(x: number, y: number, z: number, nx: number, ny: number, nz: number, radius: number, strength: number, invert: boolean): boolean;
  beginStroke(): void;
  positions(): EmbindVector<number>;
  normals(): EmbindVector<number>;
  indices(): EmbindVector<number>;
}

interface WasmModule {
  SculptEngine: new () => WasmEngine;
}

export class SculptEngine {
  private wasm: WasmEngine | undefined;
  private readonly drawFallback = new DrawBrush();
  private readonly smoothFallback = new SmoothBrush();
  private readonly clayFallback = new ClayBrush();

  constructor(private readonly getGeometry: () => THREE.BufferGeometry) {
    void this.load();
  }

  createQuadSphere(radius: number, subdivisionLevel: number): void {
    if (!this.wasm) return;
    this.wasm.createQuadSphere(radius, subdivisionLevel);
    this.syncPositionsAndNormals();
  }

  beginStroke(): void {
    this.wasm?.beginStroke();
  }

  isWasmActive(): boolean {
    return Boolean(this.wasm);
  }

  subdivideCurrent(): void {
    if (!this.wasm) return;
    this.wasm.subdivideCurrent();
    this.syncPositionsAndNormals();
  }

  restoreCoarseLevel(): void {
    if (!this.wasm || !this.wasm.restoreCoarseLevel()) return;
    this.syncPositionsAndNormals();
  }

  applyDraw(center: THREE.Vector3, settings: BrushSettings): boolean {
    if (this.wasm) {
      const changed = this.wasm.applyDraw(center.x, center.y, center.z, settings.radius, settings.strength, settings.invert);
      if (changed) this.syncPositionsAndNormals();
      return changed;
    }
    const geometry = this.getGeometry();
    return this.drawFallback.apply({
      geometry,
      center,
      settings,
      neighbors: buildVertexNeighbors(geometry),
      candidates: queryBrushCandidates(geometry, center, settings.radius),
    });
  }

  applySmooth(center: THREE.Vector3, settings: BrushSettings): boolean {
    if (this.wasm) {
      const changed = this.wasm.applySmooth(center.x, center.y, center.z, settings.radius, settings.strength);
      if (changed) this.syncPositionsAndNormals();
      return changed;
    }
    const geometry = this.getGeometry();
    return this.smoothFallback.apply({
      geometry,
      center,
      settings,
      neighbors: buildVertexNeighbors(geometry),
      candidates: queryBrushCandidates(geometry, center, settings.radius),
    });
  }

  applyClay(center: THREE.Vector3, planeNormal: THREE.Vector3, settings: BrushSettings): boolean {
    if (this.wasm) {
      const changed = this.wasm.applyClay(
        center.x, center.y, center.z,
        planeNormal.x, planeNormal.y, planeNormal.z,
        settings.radius, settings.strength, settings.invert,
      );
      if (changed) this.syncPositionsAndNormals();
      return changed;
    }
    const geometry = this.getGeometry();
    return this.clayFallback.applyWithPlane({
      geometry,
      center,
      settings,
      neighbors: buildVertexNeighbors(geometry),
      candidates: queryBrushCandidates(geometry, center, settings.radius),
    }, planeNormal);
  }

  private async load(): Promise<void> {
    try {
      const moduleUrl = '/wasm/sculpt-engine.js';
      const createModule = (await import(/* @vite-ignore */ moduleUrl)).default as () => Promise<WasmModule>;
      const module = await createModule();
      this.wasm = new module.SculptEngine();
      const options = this.getGeometry().userData.options as { radius: number; subdivisions: number };
      this.wasm.createQuadSphere(options.radius, options.subdivisions);
      this.syncPositionsAndNormals();
      console.info('Sculpt core: C++ WebAssembly');
    } catch {
      console.info('Sculpt core: TypeScript fallback. Run npm run build:wasm after activating Emscripten.');
    }
  }

  private syncPositionsAndNormals(): void {
    if (!this.wasm) return;
    const geometry = this.getGeometry();
    this.copyVector(this.wasm.positions(), geometry.getAttribute('position') as THREE.BufferAttribute);
    this.copyVector(this.wasm.normals(), geometry.getAttribute('normal') as THREE.BufferAttribute);
  }

  private copyVector(source: EmbindVector<number>, target: THREE.BufferAttribute): void {
    const array = target.array as Float32Array;
    if (source.size() !== array.length) {
      source.delete();
      throw new Error('WASM and Three.js buffers have different sizes.');
    }
    for (let index = 0; index < array.length; index += 1) array[index] = source.get(index);
    source.delete();
    target.needsUpdate = true;
  }
}
