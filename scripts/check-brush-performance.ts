import * as THREE from 'three';
import { MeshManager } from '../src/core/MeshManager';

const scene = new THREE.Scene();
const manager = new MeshManager(scene, { subdivisions: 7 });
const settings = { radius: 0.24, strength: 0.012, invert: false };
const centers = [
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0.04, 0.02, 1),
  new THREE.Vector3(0.08, 0.03, 1),
  new THREE.Vector3(0.12, 0.05, 1),
  new THREE.Vector3(0.16, 0.06, 1),
];

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function measure(label: 'draw' | 'smooth' | 'move'): number {
  const times: number[] = [];
  if (label === 'move') manager.sculptEngine.beginMove(centers[0], settings);
  for (const center of centers) {
    const start = performance.now();
    const changed = label === 'draw'
      ? manager.sculptEngine.applyDraw(center, settings)
      : label === 'move'
        ? manager.sculptEngine.applyMove(center.clone().sub(centers[0]), settings)
        : manager.sculptEngine.applySmooth(center, settings);
    if (changed) manager.recalculateSurface();
    times.push(performance.now() - start);
  }
  manager.finishStroke();
  return average(times);
}

const drawAverageMs = measure('draw');
const smoothAverageMs = measure('smooth');
const moveAverageMs = measure('move');

console.log({
  level: 7,
  vertices: manager.mesh.geometry.getAttribute('position').count,
  drawAverageMs: Number(drawAverageMs.toFixed(3)),
  smoothAverageMs: Number(smoothAverageMs.toFixed(3)),
  moveAverageMs: Number(moveAverageMs.toFixed(3)),
});
