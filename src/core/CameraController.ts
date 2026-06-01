import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class CameraController {
  constructor(readonly controls: OrbitControls) {}

  setSculpting(active: boolean): void {
    this.controls.enabled = !active;
  }
}
