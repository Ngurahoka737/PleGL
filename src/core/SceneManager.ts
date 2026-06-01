import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  readonly controls: OrbitControls;

  constructor(container: HTMLElement) {
    this.scene.background = new THREE.Color(0x15181d);
    this.camera.position.set(0, 0.4, 3.8);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.scene.add(new THREE.HemisphereLight(0xdde7ff, 0x252833, 1.8));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(3, 4, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x7396ff, 1.2);
    rim.position.set(-4, 1, -3);
    this.scene.add(rim);
    const grid = new THREE.GridHelper(10, 20, 0x353c48, 0x262b33);
    grid.position.y = -1.35;
    this.scene.add(grid);

    const resize = (): void => {
      const { clientWidth, clientHeight } = container;
      this.camera.aspect = clientWidth / clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(clientWidth, clientHeight, false);
    };
    window.addEventListener('resize', resize);
    resize();
  }

  render(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
