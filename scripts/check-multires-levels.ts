import * as THREE from 'three';
import { MeshManager } from '../src/core/MeshManager';

const scene = new THREE.Scene();
const manager = new MeshManager(scene, { subdivisions: 5 });
const settings = { radius: 0.26, strength: 0.035, invert: false };

manager.sculptEngine.applyDraw(new THREE.Vector3(0, 0, 1), settings);
manager.recalculateSurface();
manager.finishStroke();

const level5AfterDraw = Array.from(manager.mesh.geometry.getAttribute('position').array as ArrayLike<number>);
manager.setSubdivisionLevel(6);
manager.sculptEngine.applyDraw(new THREE.Vector3(0.12, 0.05, 1), settings);
manager.recalculateSurface();
manager.finishStroke();

const level6AfterDraw = Array.from(manager.mesh.geometry.getAttribute('position').array as ArrayLike<number>);
manager.setSubdivisionLevel(5);
const level5AfterDownsample = Array.from(manager.mesh.geometry.getAttribute('position').array as ArrayLike<number>);
manager.setSubdivisionLevel(6);
const level6AfterReturn = Array.from(manager.mesh.geometry.getAttribute('position').array as ArrayLike<number>);

const totalDelta5 = level5AfterDownsample.reduce((sum, value, index) => sum + Math.abs(value - level5AfterDraw[index]), 0);
const totalDelta6 = level6AfterReturn.reduce((sum, value, index) => sum + Math.abs(value - level6AfterDraw[index]), 0);

if (totalDelta5 <= 0) throw new Error('Level 6 sculpt was not projected back to level 5.');
if (totalDelta6 > 1e-6) throw new Error(`Level 6 detail changed after level roundtrip: ${totalDelta6}`);

console.log({
  level5Vertices: level5AfterDownsample.length / 3,
  level6Vertices: level6AfterReturn.length / 3,
  projectedDeltaToLevel5: Number(totalDelta5.toFixed(6)),
  level6RoundtripDelta: totalDelta6,
});
