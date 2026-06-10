import * as THREE from 'three';
import { MeshManager } from './MeshManager';
import { SceneManager } from './SceneManager';

export type TransformMode = 'none' | 'move' | 'scale';

type GizmoHandle =
  | 'move-x'
  | 'move-y'
  | 'move-z'
  | 'move-xy'
  | 'move-xz'
  | 'move-yz'
  | 'scale-uniform'
  | 'scale-x'
  | 'scale-y'
  | 'scale-z';

const AXIS_COLORS: Record<'x' | 'y' | 'z', number> = {
  x: 0xff5a66,
  y: 0x54d884,
  z: 0x5d8cff,
};

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || element.isContentEditable;
}

export class TransformGizmo {
  mode: TransformMode = 'none';

  private readonly group = new THREE.Group();
  private readonly moveGroup = new THREE.Group();
  private readonly scaleGroup = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly dragPlane = new THREE.Plane();
  private readonly dragStartHit = new THREE.Vector3();
  private readonly dragCurrentHit = new THREE.Vector3();
  private readonly dragStartPosition = new THREE.Vector3();
  private readonly dragStartScale = new THREE.Vector3();
  private readonly handleObjects: THREE.Object3D[] = [];
  private readonly handleMaterials = new Map<THREE.Object3D, THREE.MeshBasicMaterial>();
  private readonly baseOpacity = new Map<THREE.Object3D, number>();
  private readonly baseColor = new Map<THREE.Object3D, THREE.Color>();
  private activeHandle: GizmoHandle | undefined;
  private hoveredHandle: GizmoHandle | undefined;
  private dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;

  constructor(
    private readonly sceneManager: SceneManager,
    private readonly meshManager: MeshManager,
  ) {
    this.group.name = 'Transform Gizmo';
    this.group.renderOrder = 20;
    this.group.visible = false;
    this.buildMoveGizmo();
    this.buildScaleGizmo();
    this.group.add(this.moveGroup, this.scaleGroup);
    sceneManager.scene.add(this.group);

    const canvas = sceneManager.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDown, true);
    canvas.addEventListener('pointermove', this.onPointerMove, true);
    canvas.addEventListener('pointerup', this.onPointerUp, true);
    canvas.addEventListener('pointercancel', this.onPointerCancel, true);
    window.addEventListener('keydown', this.onKeyDown);
  }

  get isActive(): boolean {
    return this.mode !== 'none';
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  toggleMove(): void {
    this.setMode(this.mode === 'move' ? 'none' : 'move');
  }

  toggleScale(): void {
    this.setMode(this.mode === 'scale' ? 'none' : 'scale');
  }

  setMode(mode: TransformMode): void {
    if (this.dragging) this.applyDrag();
    this.mode = mode;
    this.activeHandle = undefined;
    this.hoveredHandle = undefined;
    this.moveGroup.visible = mode === 'move';
    this.scaleGroup.visible = mode === 'scale';
    this.group.visible = mode !== 'none' && Boolean(this.meshManager.activeObject?.visible);
    this.refreshMaterials();
    this.update();
  }

  exit(): void {
    this.setMode('none');
  }

  cancelOrExit(): void {
    if (this.dragging) {
      this.cancelDrag();
      return;
    }
    this.exit();
  }

  update(): void {
    const active = this.meshManager.activeObject;
    this.group.visible = this.mode !== 'none' && Boolean(active?.visible);
    if (!this.group.visible) return;

    active.mesh.getWorldPosition(this.group.position);
    const distance = this.sceneManager.camera.position.distanceTo(this.group.position);
    this.group.scale.setScalar(THREE.MathUtils.clamp(distance * 0.16, 0.18, 1.35));
    this.group.quaternion.identity();
  }

  private buildMoveGizmo(): void {
    this.moveGroup.name = 'Move Gizmo';
    this.moveGroup.add(
      this.makeAxis('x', 'move-x'),
      this.makeAxis('y', 'move-y'),
      this.makeAxis('z', 'move-z'),
      this.makeMovePlane('move-xy', new THREE.Vector3(0.22, 0.22, 0), 0x87d7ff),
      this.makeMovePlane('move-xz', new THREE.Vector3(0.22, 0, 0.22), 0xb997ff),
      this.makeMovePlane('move-yz', new THREE.Vector3(0, 0.22, 0.22), 0x8bffbd),
    );
  }

  private buildScaleGizmo(): void {
    this.scaleGroup.name = 'Scale Gizmo';
    const uniform = this.registerHandle(
      new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 18, 12),
        this.makeMaterial(0xffd166, 0.95),
      ),
      'scale-uniform',
      0.95,
    );
    this.scaleGroup.add(
      uniform,
      this.makeScaleAxis('x', 'scale-x'),
      this.makeScaleAxis('y', 'scale-y'),
      this.makeScaleAxis('z', 'scale-z'),
    );
  }

  private makeAxis(axis: 'x' | 'y' | 'z', handle: GizmoHandle): THREE.Group {
    const group = new THREE.Group();
    const material = this.makeMaterial(AXIS_COLORS[axis], 0.88);
    const shaft = this.registerHandle(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.82, 12), material.clone()), handle, 0.88);
    const head = this.registerHandle(new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 16), material.clone()), handle, 0.88);
    shaft.position.y = 0.41;
    head.position.y = 0.9;
    group.add(shaft, head);
    this.orientAxis(group, axis);
    return group;
  }

  private makeScaleAxis(axis: 'x' | 'y' | 'z', handle: GizmoHandle): THREE.Group {
    const group = new THREE.Group();
    const material = this.makeMaterial(AXIS_COLORS[axis], 0.9);
    const shaft = this.registerHandle(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.72, 10), material.clone()), handle, 0.9);
    const box = this.registerHandle(new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.105, 0.105), material.clone()), handle, 0.9);
    shaft.position.y = 0.36;
    box.position.y = 0.78;
    group.add(shaft, box);
    this.orientAxis(group, axis);
    return group;
  }

  private makeMovePlane(handle: GizmoHandle, position: THREE.Vector3, color: number): THREE.Mesh {
    const plane = this.registerHandle(
      new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), this.makeMaterial(color, 0.22)),
      handle,
      0.22,
    ) as THREE.Mesh;
    plane.position.copy(position);
    if (handle === 'move-xz') plane.rotation.x = -Math.PI / 2;
    if (handle === 'move-yz') plane.rotation.y = Math.PI / 2;
    return plane;
  }

  private orientAxis(group: THREE.Group, axis: 'x' | 'y' | 'z'): void {
    if (axis === 'x') group.rotation.z = -Math.PI / 2;
    if (axis === 'z') group.rotation.x = Math.PI / 2;
  }

  private registerHandle<T extends THREE.Object3D>(object: T, handle: GizmoHandle, opacity: number): T {
    object.userData.gizmoHandle = handle;
    object.renderOrder = 21;
    this.handleObjects.push(object);
    const material = (object as unknown as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
    if (material) {
      material.depthTest = false;
      material.depthWrite = false;
      material.transparent = true;
      this.handleMaterials.set(object, material);
      this.baseOpacity.set(object, opacity);
      this.baseColor.set(object, material.color.clone());
    }
    return object;
  }

  private makeMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      opacity,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.mode === 'none') return;
    this.stopEvent(event);
    this.updateHover(event);
    if (!this.hoveredHandle) return;

    this.activeHandle = this.hoveredHandle;
    this.dragging = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.dragStartPosition.copy(this.meshManager.mesh.position);
    this.dragStartScale.copy(this.meshManager.mesh.scale);
    this.configureDragPlane();
    this.intersectDragPlane(event, this.dragStartHit);
    this.sceneManager.controls.enabled = false;
    this.sceneManager.renderer.domElement.setPointerCapture(event.pointerId);
    this.refreshMaterials();
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (this.mode === 'none') return;
    this.stopEvent(event);
    if (!this.dragging) {
      this.updateHover(event);
      return;
    }
    if (this.mode === 'move') this.dragMove(event);
    else this.dragScale(event);
    this.meshManager.refreshActiveTransform();
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (this.mode === 'none') return;
    this.stopEvent(event);
    if (this.dragging) this.applyDrag();
    const canvas = this.sceneManager.renderer.domElement;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };

  private onPointerCancel = (event: PointerEvent): void => {
    if (this.mode === 'none') return;
    this.stopEvent(event);
    if (this.dragging) this.cancelDrag();
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'g') {
      event.preventDefault();
      this.toggleMove();
    } else if (key === 's') {
      event.preventDefault();
      this.toggleScale();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelOrExit();
    } else if (event.key === 'Enter' && this.dragging) {
      event.preventDefault();
      this.applyDrag();
    }
  };

  private updateHover(event: Pick<PointerEvent, 'clientX' | 'clientY'>): void {
    this.updatePointer(event);
    this.raycaster.setFromCamera(this.pointer, this.sceneManager.camera);
    const hit = this.raycaster.intersectObjects(this.mode === 'move' ? this.moveGroup.children : this.scaleGroup.children, true)[0];
    this.hoveredHandle = hit?.object.userData.gizmoHandle as GizmoHandle | undefined;
    this.refreshMaterials();
  }

  private configureDragPlane(): void {
    const center = this.group.position;
    if (this.activeHandle === 'move-xy') this.dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), center);
    else if (this.activeHandle === 'move-xz') this.dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), center);
    else if (this.activeHandle === 'move-yz') this.dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(1, 0, 0), center);
    else {
      const cameraNormal = new THREE.Vector3();
      this.sceneManager.camera.getWorldDirection(cameraNormal);
      this.dragPlane.setFromNormalAndCoplanarPoint(cameraNormal, center);
    }
  }

  private dragMove(event: Pick<PointerEvent, 'clientX' | 'clientY'>): void {
    if (!this.intersectDragPlane(event, this.dragCurrentHit)) return;
    const delta = this.dragCurrentHit.sub(this.dragStartHit);
    if (this.activeHandle === 'move-x') delta.set(delta.x, 0, 0);
    else if (this.activeHandle === 'move-y') delta.set(0, delta.y, 0);
    else if (this.activeHandle === 'move-z') delta.set(0, 0, delta.z);
    else if (this.activeHandle === 'move-xy') delta.set(delta.x, delta.y, 0);
    else if (this.activeHandle === 'move-xz') delta.set(delta.x, 0, delta.z);
    else if (this.activeHandle === 'move-yz') delta.set(0, delta.y, delta.z);
    this.meshManager.mesh.position.copy(this.dragStartPosition).add(delta);
  }

  private dragScale(event: Pick<PointerEvent, 'clientX' | 'clientY'>): void {
    const pixelDelta = (event.clientX - this.dragStartX) - (event.clientY - this.dragStartY);
    const factor = Math.max(0.04, 1 + pixelDelta * 0.008);
    const scale = this.dragStartScale.clone();
    if (this.activeHandle === 'scale-x') scale.x = Math.max(0.01, this.dragStartScale.x * factor);
    else if (this.activeHandle === 'scale-y') scale.y = Math.max(0.01, this.dragStartScale.y * factor);
    else if (this.activeHandle === 'scale-z') scale.z = Math.max(0.01, this.dragStartScale.z * factor);
    else scale.multiplyScalar(factor);
    this.meshManager.mesh.scale.copy(scale);
  }

  private intersectDragPlane(event: Pick<PointerEvent, 'clientX' | 'clientY'>, target: THREE.Vector3): boolean {
    this.updatePointer(event);
    this.raycaster.setFromCamera(this.pointer, this.sceneManager.camera);
    const point = this.raycaster.ray.intersectPlane(this.dragPlane, target);
    return Boolean(point);
  }

  private applyDrag(): void {
    this.dragging = false;
    this.activeHandle = undefined;
    this.sceneManager.controls.enabled = true;
    this.meshManager.refreshActiveTransform();
    this.refreshMaterials();
  }

  private cancelDrag(): void {
    this.meshManager.mesh.position.copy(this.dragStartPosition);
    this.meshManager.mesh.scale.copy(this.dragStartScale);
    this.dragging = false;
    this.activeHandle = undefined;
    this.sceneManager.controls.enabled = true;
    this.meshManager.refreshActiveTransform();
    this.refreshMaterials();
  }

  private updatePointer(event: Pick<PointerEvent, 'clientX' | 'clientY'>): void {
    const rect = this.sceneManager.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  private refreshMaterials(): void {
    for (const object of this.handleObjects) {
      const material = this.handleMaterials.get(object);
      if (!material) continue;
      const handle = object.userData.gizmoHandle as GizmoHandle;
      const highlighted = handle === this.hoveredHandle || handle === this.activeHandle;
      material.opacity = highlighted ? 1 : (this.baseOpacity.get(object) ?? 0.8);
      material.color.copy(this.baseColor.get(object) ?? material.color);
      if (highlighted) material.color.lerp(new THREE.Color(0xffffff), 0.22);
    }
  }

  private stopEvent(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if ('stopImmediatePropagation' in event) event.stopImmediatePropagation();
  }
}
