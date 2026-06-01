import { BrushEngine } from '../sculpt/BrushEngine';
import { MeshManager } from '../core/MeshManager';
import { validateClosedIndexedGeometry } from '../utils/GeometryUtils';

export class UIManager {
  private subdivisions = 5;
  private readonly stats: HTMLElement;
  private readonly topology: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly meshManager: MeshManager,
    private readonly brushEngine: BrushEngine,
  ) {
    root.innerHTML = `
      <header><strong>Quad Sphere Sculpt</strong><span>Shared topology study</span></header>
      <aside>
        <h2>Brush</h2>
        <button class="active" data-brush="Draw">Draw <kbd>1</kbd></button>
        <button data-brush="Smooth">Smooth <kbd>2</kbd></button>
        <button data-brush="Clay">Clay <kbd>3</kbd></button>
        <label>Radius <output data-value="radius"></output><input data-setting="radius" type="range" min="0.04" max="0.7" step="0.01"></label>
        <label>Strength <output data-value="strength"></output><input data-setting="strength" type="range" min="0.001" max="0.04" step="0.001"></label>
        <label class="check"><input data-setting="invert" type="checkbox"> Invert</label>
        <label class="check"><input data-setting="wireframe" type="checkbox"> Wireframe</label>
        <h2>Quad Sphere</h2>
        <label>Subdivision level <output data-value="subdivisions"></output><input data-setting="subdivisions" type="range" min="0" max="7" step="1"></label>
        <button data-action="reset">Rebuild manifold mesh</button>
        <p class="hint">Higher levels preserve the current sculpt. Lower levels restore an available coarse snapshot. Rebuild resets the mesh.</p>
      </aside>
      <footer><span data-stats></span><span data-topology></span></footer>
    `;
    this.stats = root.querySelector('[data-stats]')!;
    this.topology = root.querySelector('[data-topology]')!;
    this.bind();
    this.syncInputs();
    this.refreshStats();
  }

  refreshStats(): void {
    const validation = validateClosedIndexedGeometry(this.meshManager.mesh.geometry);
    this.stats.textContent = `${validation.vertices.toLocaleString()} vertices  ${validation.triangles.toLocaleString()} triangles`;
    this.topology.textContent = validation.valid ? 'Manifold: closed, indexed, no duplicate seam vertices' : 'Topology check failed';
    this.topology.classList.toggle('error', !validation.valid);
  }

  private bind(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-brush]').forEach((button) => {
      button.addEventListener('click', () => {
        this.brushEngine.setBrush(button.dataset.brush!);
        this.root.querySelectorAll('[data-brush]').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
      });
    });
    this.root.querySelector<HTMLInputElement>('[data-setting="radius"]')!.addEventListener('input', (event) => {
      this.brushEngine.settings.radius = Number((event.target as HTMLInputElement).value);
      this.syncInputs();
    });
    this.root.querySelector<HTMLInputElement>('[data-setting="strength"]')!.addEventListener('input', (event) => {
      this.brushEngine.settings.strength = Number((event.target as HTMLInputElement).value);
      this.syncInputs();
    });
    this.root.querySelector<HTMLInputElement>('[data-setting="invert"]')!.addEventListener('change', (event) => {
      this.brushEngine.settings.invert = (event.target as HTMLInputElement).checked;
    });
    this.root.querySelector<HTMLInputElement>('[data-setting="wireframe"]')!.addEventListener('change', (event) => {
      this.meshManager.setWireframe((event.target as HTMLInputElement).checked);
    });
    this.root.querySelector<HTMLInputElement>('[data-setting="subdivisions"]')!.addEventListener('input', (event) => {
      this.subdivisions = this.meshManager.setSubdivisionLevel(Number((event.target as HTMLInputElement).value));
      this.syncInputs();
      this.brushEngine.geometryReplaced();
      this.refreshStats();
    });
    this.root.querySelector('[data-action="reset"]')!.addEventListener('click', () => {
      this.meshManager.replaceQuadSphere({ subdivisions: this.subdivisions });
      this.brushEngine.geometryReplaced();
      this.refreshStats();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === '1') (this.root.querySelector('[data-brush="Draw"]') as HTMLButtonElement).click();
      if (event.key === '2') (this.root.querySelector('[data-brush="Smooth"]') as HTMLButtonElement).click();
      if (event.key === '3') (this.root.querySelector('[data-brush="Clay"]') as HTMLButtonElement).click();
    });
  }

  private syncInputs(): void {
    const set = (name: string, value: number): void => {
      (this.root.querySelector(`[data-setting="${name}"]`) as HTMLInputElement).value = String(value);
      this.root.querySelector(`[data-value="${name}"]`)!.textContent = String(value);
    };
    set('radius', this.brushEngine.settings.radius);
    set('strength', this.brushEngine.settings.strength);
    set('subdivisions', this.subdivisions);
  }

}
