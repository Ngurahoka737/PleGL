import * as THREE from 'three';
import { MeshManager } from '../core/MeshManager';
import { SceneManager } from '../core/SceneManager';
import type { BrushSettings } from './Brush';

export class BrushEngine {
  readonly settings: BrushSettings = { radius: 0.24, strength: 0.012, invert: false };
  activeBrush = 'Draw';
  onChange: (() => void) | undefined;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly localCenter = new THREE.Vector3();
  private readonly localNormal = new THREE.Vector3();
  private readonly lastDabCenter = new THREE.Vector3();
  private readonly cursor: THREE.Mesh;
  private sculpting = false;
  private hasLastDab = false;
  private pendingPointer: Pick<PointerEvent, 'clientX' | 'clientY'> | undefined;
  private pointerFrame = 0;

  constructor(
    private readonly sceneManager: SceneManager,
    private readonly meshManager: MeshManager,
  ) {
    this.cursor = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.018, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0x8eb6ff, depthTest: false }),
    );
    this.cursor.renderOrder = 10;
    this.cursor.visible = false;
    sceneManager.scene.add(this.cursor);

    const canvas = sceneManager.renderer.domElement;
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !this.updateHit(event)) return;
      this.sculpting = true;
      this.hasLastDab = false;
      meshManager.sculptEngine.beginStroke();
      sceneManager.controls.enabled = false;
      canvas.setPointerCapture(event.pointerId);
      this.apply(true);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!this.sculpting) {
        this.updateHit(event);
        return;
      }
      this.pendingPointer = { clientX: event.clientX, clientY: event.clientY };
      this.schedulePointerFrame();
    });
    canvas.addEventListener('pointerup', (event) => {
      this.sculpting = false;
      this.pendingPointer = undefined;
      sceneManager.controls.enabled = true;
      meshManager.finishStroke();
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointercancel', () => {
      this.sculpting = false;
      this.pendingPointer = undefined;
      sceneManager.controls.enabled = true;
      meshManager.finishStroke();
    });
    canvas.addEventListener('pointerleave', () => {
      if (!this.sculpting) this.cursor.visible = false;
    });
  }

  setBrush(name: string): void {
    if (name === 'Draw' || name === 'Smooth' || name === 'Clay') this.activeBrush = name;
  }

  geometryReplaced(): void {}

  private updateHit(event: Pick<PointerEvent, 'clientX' | 'clientY'>): boolean {
    const canvas = this.sceneManager.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.sceneManager.camera);
    const hit = this.raycaster.intersectObject(this.meshManager.mesh, false)[0];
    this.cursor.visible = Boolean(hit);
    if (!hit || !hit.face) return false;

    this.localCenter.copy(hit.point);
    this.meshManager.mesh.worldToLocal(this.localCenter);
    this.localNormal.copy(hit.face.normal).transformDirection(this.meshManager.mesh.matrixWorld);
    this.cursor.position.copy(hit.point).addScaledVector(this.localNormal, 0.002);
    this.cursor.scale.setScalar(this.settings.radius);
    this.cursor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.localNormal);
    return true;
  }

  private schedulePointerFrame(): void {
    if (this.pointerFrame) return;
    this.pointerFrame = requestAnimationFrame(() => {
      this.pointerFrame = 0;
      if (!this.sculpting || !this.pendingPointer) return;
      const hit = this.updateHit(this.pendingPointer);
      if (hit) this.apply(false);
    });
  }

  private apply(force: boolean): void {
    const spacing = this.settings.radius * 0.18;
    if (!force && this.hasLastDab && this.localCenter.distanceToSquared(this.lastDabCenter) < spacing * spacing) return;
    const changed = this.activeBrush === 'Smooth'
      ? this.meshManager.sculptEngine.applySmooth(this.localCenter, this.settings)
      : this.activeBrush === 'Clay'
        ? this.meshManager.sculptEngine.applyClay(this.localCenter, this.localNormal, this.settings)
        : this.meshManager.sculptEngine.applyDraw(this.localCenter, this.settings);
    if (!changed) return;
    this.lastDabCenter.copy(this.localCenter);
    this.hasLastDab = true;
    this.meshManager.recalculateSurface();
    this.onChange?.();
  }
}
