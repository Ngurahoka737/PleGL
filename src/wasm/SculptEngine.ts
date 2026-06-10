import * as THREE from 'three';
import type { BrushSettings } from '../sculpt/Brush';
import { DrawBrush } from '../sculpt/brushes/DrawBrush';
import { SmoothBrush } from '../sculpt/brushes/SmoothBrush';
import { ClayBrush } from '../sculpt/brushes/ClayBrush';
import { MoveBrush } from '../sculpt/brushes/MoveBrush';
import { buildVertexNeighbors, queryBrushCandidates } from '../utils/GeometryUtils';

interface EmbindVector<T> {
  size(): number;
  get(index: number): T;
  delete(): void;
}

interface MutableEmbindVector<T> extends EmbindVector<T> {
  push_back(value: T): void;
}

interface WasmEngine {
  createQuadSphere(radius: number, subdivisionLevel: number): void;
  subdivideCurrent(): void;
  restoreCoarseLevel(): boolean;
  pixRemesh(positions: MutableEmbindVector<number>, indices: MutableEmbindVector<number>, resolution: number, adaptiveDensity: number, preserveSharpFeatures: boolean, smoothIterations: number, projectDetails: boolean): boolean;
  previewPixRemeshTriangles(positions: MutableEmbindVector<number>, indices: MutableEmbindVector<number>, resolution: number, adaptiveDensity: number, preserveSharpFeatures: boolean, smoothIterations: number, projectDetails: boolean): number;
  applyDraw(x: number, y: number, z: number, radius: number, strength: number, invert: boolean): boolean;
  applySmooth(x: number, y: number, z: number, radius: number, strength: number): boolean;
  applyClay(x: number, y: number, z: number, nx: number, ny: number, nz: number, radius: number, strength: number, invert: boolean): boolean;
  beginMove(x: number, y: number, z: number, radius: number): void;
  applyMove(dx: number, dy: number, dz: number, invert: boolean): boolean;
  beginStroke(): void;
  positions(): EmbindVector<number>;
  normals(): EmbindVector<number>;
  indices(): EmbindVector<number>;
  displayEdges(): EmbindVector<number>;
  quads(): EmbindVector<number>;
}

interface WasmModule {
  SculptEngine: new () => WasmEngine;
  FloatVector: new () => MutableEmbindVector<number>;
  UIntVector: new () => MutableEmbindVector<number>;
}

export class SculptEngine {
  onReady: (() => void) | undefined;
  private wasm: WasmEngine | undefined;
  private wasmModule: WasmModule | undefined;
  private loadError: string | undefined;
  private readonly drawFallback = new DrawBrush();
  private readonly smoothFallback = new SmoothBrush();
  private readonly clayFallback = new ClayBrush();
  private readonly moveFallback = new MoveBrush();

  constructor(private readonly getGeometry: () => THREE.BufferGeometry) {
    void this.load();
  }

  createQuadSphere(radius: number, subdivisionLevel: number): void {
    if (!this.wasm) return;
    this.wasm.createQuadSphere(radius, subdivisionLevel);
  }

  beginStroke(): void {
    this.wasm?.beginStroke();
  }

  isWasmActive(): boolean {
    return Boolean(this.wasm);
  }

  getWasmLoadError(): string | undefined {
    return this.loadError;
  }

  subdivideCurrent(): void {
    if (!this.wasm) return;
    this.wasm.subdivideCurrent();
  }

  restoreCoarseLevel(): void {
    if (!this.wasm || !this.wasm.restoreCoarseLevel()) return;
  }

  pixRemesh(
    positions: number[],
    indices: number[],
    options: { resolution: number; adaptiveDensity: number; preserveSharpFeatures: boolean; smoothIterations: number; projectDetails: boolean },
  ): THREE.BufferGeometry | undefined {
    if (!this.wasm || !this.wasmModule) return undefined;
    const buffers = this.createWasmBuffers(positions, indices);
    try {
      const changed = this.wasm.pixRemesh(
        buffers.positions,
        buffers.indices,
        options.resolution,
        options.adaptiveDensity,
        options.preserveSharpFeatures,
        options.smoothIterations,
        options.projectDetails,
      );
      return changed ? this.createGeometryFromWasm() : undefined;
    } finally {
      buffers.positions.delete();
      buffers.indices.delete();
    }
  }

  previewPixRemeshTriangles(
    positions: number[],
    indices: number[],
    options: { resolution: number; adaptiveDensity: number; preserveSharpFeatures: boolean; smoothIterations: number; projectDetails: boolean },
  ): number | undefined {
    if (!this.wasm || !this.wasmModule) return undefined;
    const buffers = this.createWasmBuffers(positions, indices);
    try {
      return this.wasm.previewPixRemeshTriangles(
        buffers.positions,
        buffers.indices,
        options.resolution,
        options.adaptiveDensity,
        options.preserveSharpFeatures,
        options.smoothIterations,
        options.projectDetails,
      );
    } finally {
      buffers.positions.delete();
      buffers.indices.delete();
    }
  }

  applyDraw(center: THREE.Vector3, settings: BrushSettings): boolean {
    const wasm = this.wasmForCurrentGeometry();
    if (wasm) {
      const changed = wasm.applyDraw(center.x, center.y, center.z, settings.radius, settings.strength, settings.invert);
      if (changed) this.syncPositionsAndNormals();
      return changed;
    }
    const geometry = this.getGeometry();
    const candidates = queryBrushCandidates(geometry, center, settings.radius);
    geometry.userData.lastBrushCandidates = candidates;
    return this.drawFallback.apply({
      geometry,
      center,
      settings,
      neighbors: buildVertexNeighbors(geometry),
      candidates,
    });
  }

  applySmooth(center: THREE.Vector3, settings: BrushSettings): boolean {
    const wasm = this.wasmForCurrentGeometry();
    if (wasm) {
      const changed = wasm.applySmooth(center.x, center.y, center.z, settings.radius, settings.strength);
      if (changed) this.syncPositionsAndNormals();
      return changed;
    }
    const geometry = this.getGeometry();
    const candidates = queryBrushCandidates(geometry, center, settings.radius);
    geometry.userData.lastBrushCandidates = candidates;
    return this.smoothFallback.apply({
      geometry,
      center,
      settings,
      neighbors: buildVertexNeighbors(geometry),
      candidates,
    });
  }

  applyClay(center: THREE.Vector3, planeNormal: THREE.Vector3, settings: BrushSettings): boolean {
    const wasm = this.wasmForCurrentGeometry();
    if (wasm) {
      const changed = wasm.applyClay(
        center.x, center.y, center.z,
        planeNormal.x, planeNormal.y, planeNormal.z,
        settings.radius, settings.strength, settings.invert,
      );
      if (changed) this.syncPositionsAndNormals();
      return changed;
    }
    const geometry = this.getGeometry();
    const candidates = queryBrushCandidates(geometry, center, settings.radius);
    geometry.userData.lastBrushCandidates = candidates;
    return this.clayFallback.applyWithPlane({
      geometry,
      center,
      settings,
      neighbors: buildVertexNeighbors(geometry),
      candidates,
    }, planeNormal);
  }

  beginMove(center: THREE.Vector3, settings: BrushSettings): void {
    const wasm = this.wasmForCurrentGeometry();
    if (wasm) {
      wasm.beginMove(center.x, center.y, center.z, settings.radius);
      return;
    }
    const geometry = this.getGeometry();
    const candidates = queryBrushCandidates(geometry, center, settings.radius);
    this.moveFallback.begin({
      geometry,
      center,
      settings,
      neighbors: buildVertexNeighbors(geometry),
      candidates,
    });
  }

  applyMove(delta: THREE.Vector3, settings: BrushSettings): boolean {
    const wasm = this.wasmForCurrentGeometry();
    if (wasm) {
      const changed = wasm.applyMove(delta.x, delta.y, delta.z, settings.invert);
      if (changed) this.syncPositionsAndNormals();
      return changed;
    }
    return this.moveFallback.applyMove(this.getGeometry(), delta, settings);
  }

  private async load(): Promise<void> {
    try {
      const moduleUrl = `/wasm/sculpt-engine.js?v=${Date.now()}`;
      const nativeImport = new Function('moduleUrl', 'return import(moduleUrl)') as (url: string) => Promise<{ default: () => Promise<WasmModule> }>;
      const createModule = (await nativeImport(moduleUrl)).default;
      const module = await createModule();
      this.wasmModule = module;
      this.wasm = new module.SculptEngine();
      this.loadError = undefined;
      const options = this.getGeometry().userData.options as { radius: number; subdivisions: number } | undefined;
      if (options) this.wasm.createQuadSphere(options.radius, options.subdivisions);
      (globalThis as { __pixWasmReady?: boolean; __pixWasmError?: string }).__pixWasmReady = true;
      (globalThis as { __pixWasmReady?: boolean; __pixWasmError?: string }).__pixWasmError = undefined;
      console.info('Sculpt core: C++ WebAssembly');
      this.onReady?.();
    } catch (error) {
      this.wasm = undefined;
      this.wasmModule = undefined;
      this.loadError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      (globalThis as { __pixWasmReady?: boolean; __pixWasmError?: string }).__pixWasmReady = false;
      (globalThis as { __pixWasmReady?: boolean; __pixWasmError?: string }).__pixWasmError = this.loadError;
      console.warn('Sculpt core: TypeScript fallback. Run npm run build:wasm after activating Emscripten.', error);
    }
  }

  private createWasmBuffers(positions: number[], indices: number[]): { positions: MutableEmbindVector<number>; indices: MutableEmbindVector<number> } {
    if (!this.wasmModule) throw new Error('WASM module is not loaded.');
    const wasmPositions = new this.wasmModule.FloatVector();
    const wasmIndices = new this.wasmModule.UIntVector();
    for (const value of positions) wasmPositions.push_back(value);
    for (const value of indices) wasmIndices.push_back(value);
    return { positions: wasmPositions, indices: wasmIndices };
  }

  private syncPositionsAndNormals(): void {
    if (!this.wasm) return;
    const geometry = this.getGeometry();
    this.copyVector(this.wasm.positions(), geometry.getAttribute('position') as THREE.BufferAttribute);
    this.copyVector(this.wasm.normals(), geometry.getAttribute('normal') as THREE.BufferAttribute);
  }

  private createGeometryFromWasm(): THREE.BufferGeometry {
    if (!this.wasm) throw new Error('WASM sculpt engine is not loaded.');
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.vectorToArray(this.wasm.positions()), 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.vectorToArray(this.wasm.normals()), 3));
    geometry.setIndex(this.vectorToArray(this.wasm.indices()));
    geometry.userData.primitive = 'pix-remesh';
    const quads = this.vectorToArray(this.wasm.quads());
    const displayEdges = this.vectorToArray(this.wasm.displayEdges());
    geometry.userData.wireframeLevels = [new Uint32Array(), new Uint32Array(), new Uint32Array(displayEdges)];
    if (quads.length > 0) {
      const quadFaces = this.flatQuadsToFaces(quads);
      geometry.userData.quadFaces = quadFaces;
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  private wasmForCurrentGeometry(): WasmEngine | undefined {
    return undefined;
  }

  private canSyncCurrentGeometry(): boolean {
    if (!this.wasm) return false;
    const positions = this.wasm.positions();
    const wasmSize = positions.size();
    positions.delete();
    return wasmSize === (this.getGeometry().getAttribute('position').array as Float32Array).length;
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

  private vectorToArray(source: EmbindVector<number>): number[] {
    const result: number[] = [];
    result.length = source.size();
    for (let index = 0; index < result.length; index += 1) result[index] = source.get(index);
    source.delete();
    return result;
  }

  private flatQuadsToFaces(values: number[]): number[][] {
    const faces: number[][] = [];
    for (let index = 0; index + 3 < values.length; index += 4) {
      faces.push([values[index], values[index + 1], values[index + 2], values[index + 3]]);
    }
    return faces;
  }
}
