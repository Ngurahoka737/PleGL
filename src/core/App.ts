import { BrushEngine } from '../sculpt/BrushEngine';
import { UIManager } from '../ui/UIManager';
import { MeshManager } from './MeshManager';
import { SceneManager } from './SceneManager';

export class App {
  private readonly sceneManager: SceneManager;
  private readonly meshManager: MeshManager;
  private readonly brushEngine: BrushEngine;
  private readonly uiManager: UIManager;

  constructor(root: HTMLElement) {
    root.innerHTML = '<main data-viewport></main><section data-ui></section>';
    this.sceneManager = new SceneManager(root.querySelector('[data-viewport]')!);
    this.meshManager = new MeshManager(this.sceneManager.scene);
    this.brushEngine = new BrushEngine(this.sceneManager, this.meshManager);
    this.uiManager = new UIManager(root.querySelector('[data-ui]')!, this.meshManager, this.brushEngine);
    this.brushEngine.onChange = () => this.uiManager.refreshStats();
    this.animate();
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    this.sceneManager.render();
  };
}
