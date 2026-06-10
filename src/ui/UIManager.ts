import { BrushEngine } from '../sculpt/BrushEngine';
import { MeshManager } from '../core/MeshManager';
import { TransformGizmo } from '../core/TransformGizmo';
import { validateClosedIndexedGeometry } from '../utils/GeometryUtils';
import { LayerPanel } from './LayerPanel';

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || element.isContentEditable;
}

export class UIManager {
  private subdivisions = 5;
  private pixPreviewTimer = 0;
  private readonly stats: HTMLElement;
  private readonly topology: HTMLElement;
  private readonly pixPreview: HTMLElement;
  private readonly pixStatus: HTMLElement;
  private readonly layerPanel: LayerPanel;

  constructor(
    private readonly root: HTMLElement,
    private readonly meshManager: MeshManager,
    private readonly brushEngine: BrushEngine,
    private readonly transformGizmo: TransformGizmo,
  ) {
    root.innerHTML = `
      <header>
        <div class="brand">
          <strong>Quad Sphere Sculpt</strong>
          <span>Seamless multires sculpting</span>
        </div>
        <div class="header-pills">
          <span class="pill">C++ / WASM ready</span>
          <span class="pill accent">Quad topology</span>
        </div>
      </header>
      <aside>
        <section class="panel-card">
          <h2>Brush</h2>
          <div class="brush-grid">
            <button class="active" data-brush="Draw"><span>Draw</span><kbd>1</kbd></button>
            <button data-brush="Smooth"><span>Smooth</span><kbd>2</kbd></button>
            <button data-brush="Clay"><span>Clay</span><kbd>3</kbd></button>
            <button data-brush="Move"><span>Move</span><kbd>4</kbd></button>
          </div>
          <label class="control">Radius <output data-value="radius"></output><input data-setting="radius" type="range" min="0.04" max="0.7" step="0.01"></label>
          <label class="control">Strength <output data-value="strength"></output><input data-setting="strength" type="range" min="0.001" max="0.04" step="0.001"></label>
          <div class="toggle-row">
            <label class="check"><input data-setting="invert" type="checkbox"><span>Invert</span></label>
            <label class="check"><input data-setting="wireframe" type="checkbox"><span>Wireframe</span></label>
          </div>
        </section>
        <section class="panel-card">
          <h2>Add Mesh</h2>
          <div class="primitive-grid">
            <button data-add="cube"><span>Cube</span></button>
            <button data-add="cylinder"><span>Cylinder</span></button>
          </div>
          <p class="hint">New primitives become separate objects and are selected immediately.</p>
        </section>
        <section class="panel-card">
          <h2>Transform</h2>
          <div class="primitive-grid">
            <button data-transform="move"><span>Move</span><kbd>G</kbd></button>
            <button data-transform="scale"><span>Scale</span><kbd>S</kbd></button>
          </div>
          <p class="hint">Press G or S to show the gizmo, then drag a colored handle. Esc cancels, Enter applies.</p>
        </section>
        <section class="panel-card">
          <h2>Objects</h2>
          <div data-layer-panel></div>
        </section>
        <section class="panel-card">
          <h2>PixRemesh</h2>
          <label class="control">Resolution <output data-value="pix-resolution"></output><input data-pix="resolution" type="range" min="12" max="96" step="4"></label>
          <label class="control">Adaptive Density <output data-value="pix-adaptive"></output><input data-pix="adaptiveDensity" type="range" min="0" max="1" step="0.05"></label>
          <label class="control">Smooth Iterations <output data-value="pix-smooth"></output><input data-pix="smoothIterations" type="range" min="0" max="8" step="1"></label>
          <div class="toggle-row">
            <label class="check"><input data-pix="preserveSharpFeatures" type="checkbox"><span>Sharp</span></label>
            <label class="check"><input data-pix="projectDetails" type="checkbox" checked><span>Project</span></label>
          </div>
          <div class="preview-row">
            <span>Preview triangles</span>
            <strong data-pix-preview>Waiting</strong>
          </div>
          <button data-action="pix-remesh"><span>Apply Instant PixRemesh</span></button>
          <p class="hint" data-pix-status>Instant Meshes experiment uses the local Vite dev server.</p>
        </section>
        <section class="panel-card">
          <h2>Quad Sphere</h2>
          <label class="control">Subdivision level <output data-value="subdivisions"></output><input data-setting="subdivisions" type="range" min="0" max="7" step="1"></label>
          <button class="danger" data-action="reset"><span>Rebuild manifold mesh</span></button>
          <p class="hint">Higher levels preserve the current sculpt. Lower levels restore an available coarse snapshot. Rebuild resets the mesh.</p>
        </section>
      </aside>
      <footer>
        <span class="status-chip" data-stats></span>
        <span class="status-chip" data-topology></span>
      </footer>
    `;
    this.stats = root.querySelector('[data-stats]')!;
    this.topology = root.querySelector('[data-topology]')!;
    this.pixPreview = root.querySelector('[data-pix-preview]')!;
    this.pixStatus = root.querySelector('[data-pix-status]')!;
    this.layerPanel = new LayerPanel(root.querySelector('[data-layer-panel]')!, this.meshManager, () => {
      this.syncInputs();
      this.refreshStats();
    });
    this.meshManager.onObjectsChanged = () => {
      this.layerPanel.refresh();
      this.syncInputs();
      this.refreshStats();
    };
    this.meshManager.onSelectionChanged = () => {
      this.subdivisions = this.meshManager.activeObject.subdivisionLevel;
      this.syncInputs();
      this.refreshStats();
    };
    this.meshManager.sculptEngine.onReady = () => {
      this.pixStatus.textContent = 'C++ WASM core ready. Instant Meshes endpoint is preferred in dev.';
      this.pixPreview.textContent = 'Ready';
    };
    this.bind();
    this.syncInputs();
    this.refreshStats();
  }

  refreshStats(): void {
    const active = this.meshManager.activeObject;
    const validation = validateClosedIndexedGeometry(this.meshManager.mesh.geometry);
    this.stats.textContent = `${validation.vertices.toLocaleString()} vertices  ${validation.triangles.toLocaleString()} triangles`;
    if (this.meshManager.mesh.geometry.userData.primitive === 'pix-remesh') {
      this.topology.textContent = `${active.name}: quad-dominant PixRemesh`;
      this.topology.classList.remove('error');
      return;
    }
    if (this.meshManager.mesh.geometry.userData.primitive !== 'quad-sphere') {
      this.topology.textContent = `${active.name}: active triangle mesh`;
      this.topology.classList.remove('error');
      return;
    }
    this.topology.textContent = validation.valid
      ? `${active.name}: manifold quad sphere`
      : `${active.name}: topology check failed`;
    this.topology.classList.toggle('error', !validation.valid);
  }

  private bind(): void {
    this.root.querySelector<HTMLButtonElement>('[data-add="cube"]')!.addEventListener('click', () => {
      this.meshManager.addCube();
      this.brushEngine.geometryReplaced();
      this.refreshStats();
    });
    this.root.querySelector<HTMLButtonElement>('[data-add="cylinder"]')!.addEventListener('click', () => {
      this.meshManager.addCylinder();
      this.brushEngine.geometryReplaced();
      this.refreshStats();
    });
    this.root.querySelector<HTMLButtonElement>('[data-transform="move"]')!.addEventListener('click', () => {
      this.transformGizmo.toggleMove();
    });
    this.root.querySelector<HTMLButtonElement>('[data-transform="scale"]')!.addEventListener('click', () => {
      this.transformGizmo.toggleScale();
    });
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
    this.root.querySelectorAll<HTMLInputElement>('[data-pix]').forEach((input) => {
      input.addEventListener('input', () => {
        this.syncInputs();
        this.schedulePixRemeshPreview();
      });
      input.addEventListener('change', () => {
        this.syncInputs();
        this.schedulePixRemeshPreview();
      });
    });
    this.root.querySelector('[data-action="pix-remesh"]')!.addEventListener('click', async () => {
      window.clearTimeout(this.pixPreviewTimer);
      this.pixStatus.textContent = 'Merging visible objects, then running Instant Meshes...';
      const button = this.root.querySelector<HTMLButtonElement>('[data-action="pix-remesh"]')!;
      button.disabled = true;
      let applied = false;
      try {
        applied = await this.meshManager.applyInstantPixRemesh(this.pixRemeshSettings());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.pixStatus.textContent = `Instant PixRemesh failed: ${message}`;
        button.disabled = false;
        return;
      }
      button.disabled = false;
      this.brushEngine.geometryReplaced();
      this.refreshStats();
      this.syncInputs();
      this.pixStatus.textContent = applied
        ? 'Applied: volume union was retopologized with Instant Meshes.'
        : 'No visible mesh data was available for remeshing.';
      if (applied) {
        window.clearTimeout(this.pixPreviewTimer);
        const index = this.meshManager.mesh.geometry.getIndex();
        this.pixPreview.textContent = index ? Math.floor(index.count / 3).toLocaleString() : 'Applied';
      } else {
        this.pixPreview.textContent = 'No source';
      }
    });
    window.addEventListener('keydown', (event) => {
      if (isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === '1') (this.root.querySelector('[data-brush="Draw"]') as HTMLButtonElement).click();
      if (event.key === '2') (this.root.querySelector('[data-brush="Smooth"]') as HTMLButtonElement).click();
      if (event.key === '3') (this.root.querySelector('[data-brush="Clay"]') as HTMLButtonElement).click();
      if (event.key === '4') (this.root.querySelector('[data-brush="Move"]') as HTMLButtonElement).click();
      if (event.key === 'Delete') {
        this.meshManager.deleteActiveObject();
        this.brushEngine.geometryReplaced();
        this.refreshStats();
      }
    });
  }

  private syncInputs(): void {
    const supportsSubdivision = Boolean(this.meshManager.mesh.geometry.userData.quadFaces);
    this.subdivisions = this.meshManager.activeObject.subdivisionLevel;
    const set = (name: string, value: number): void => {
      (this.root.querySelector(`[data-setting="${name}"]`) as HTMLInputElement).value = String(value);
      this.root.querySelector(`[data-value="${name}"]`)!.textContent = String(value);
    };
    set('radius', this.brushEngine.settings.radius);
    set('strength', this.brushEngine.settings.strength);
    set('subdivisions', this.subdivisions);
    this.setPixInput('resolution', this.pixResolution());
    this.setPixInput('adaptiveDensity', this.pixAdaptiveDensity());
    this.setPixInput('smoothIterations', this.pixSmoothIterations());
    (this.root.querySelector('[data-setting="subdivisions"]') as HTMLInputElement).disabled = !supportsSubdivision;
    (this.root.querySelector('[data-action="reset"]') as HTMLButtonElement).disabled = !supportsSubdivision;
  }

  private pixRemeshSettings(): {
    resolution: number;
    adaptiveDensity: number;
    preserveSharpFeatures: boolean;
    smoothIterations: number;
    projectDetails: boolean;
  } {
    return {
      resolution: this.pixResolution(),
      adaptiveDensity: this.pixAdaptiveDensity(),
      preserveSharpFeatures: (this.root.querySelector('[data-pix="preserveSharpFeatures"]') as HTMLInputElement).checked,
      smoothIterations: this.pixSmoothIterations(),
      projectDetails: (this.root.querySelector('[data-pix="projectDetails"]') as HTMLInputElement).checked,
    };
  }

  private pixResolution(): number {
    return Number((this.root.querySelector('[data-pix="resolution"]') as HTMLInputElement).value || 40);
  }

  private pixAdaptiveDensity(): number {
    return Number((this.root.querySelector('[data-pix="adaptiveDensity"]') as HTMLInputElement).value || 0);
  }

  private pixSmoothIterations(): number {
    return Number((this.root.querySelector('[data-pix="smoothIterations"]') as HTMLInputElement).value || 2);
  }

  private setPixInput(name: string, value: number): void {
    const input = this.root.querySelector(`[data-pix="${name}"]`) as HTMLInputElement;
    const output = this.root.querySelector(`[data-value="pix-${name === 'adaptiveDensity' ? 'adaptive' : name === 'smoothIterations' ? 'smooth' : 'resolution'}"]`)!;
    if (!input.value) input.value = String(value);
    output.textContent = String(value);
  }

  private schedulePixRemeshPreview(): void {
    window.clearTimeout(this.pixPreviewTimer);
    this.pixPreview.textContent = 'Instant Meshes on apply';
  }

  private refreshPixRemeshPreview(): void {
    const triangles = this.meshManager.previewPixRemeshTriangles(this.pixRemeshSettings());
    if (triangles === undefined) {
      this.pixPreview.textContent = 'WASM unavailable';
      this.pixStatus.textContent = this.pixRemeshUnavailableText();
      return;
    }
    this.pixPreview.textContent = triangles.toLocaleString();
  }

  private pixRemeshUnavailableText(): string {
    const loadError = this.meshManager.sculptEngine.getWasmLoadError();
    return loadError
      ? `PixRemesh WASM failed to load: ${loadError}`
      : 'PixRemesh needs C++ WASM. Run build:wasm after activating Emscripten.';
  }

}
