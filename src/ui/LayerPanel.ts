import { MeshManager } from '../core/MeshManager';

export class LayerPanel {
  constructor(
    private readonly root: HTMLElement,
    private readonly meshManager: MeshManager,
    private readonly onChange: () => void,
  ) {
    this.render();
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    this.root.innerHTML = `
      <div class="layer-list">
        ${this.meshManager.objects.map((object) => `
          <article class="layer-row ${object.selected ? 'selected' : ''}" data-object-id="${object.id}">
            <button class="icon-button visibility ${object.visible ? '' : 'muted'}" data-action="visibility" title="${object.visible ? 'Hide object' : 'Show object'}">
              ${object.visible ? 'ON' : 'OFF'}
            </button>
            <input class="object-name" data-action="rename" value="${this.escape(object.name)}" aria-label="Object name">
            <button class="icon-button delete" data-action="delete" title="Delete object">DEL</button>
          </article>
        `).join('')}
      </div>
    `;

    this.root.querySelectorAll<HTMLElement>('[data-object-id]').forEach((row) => {
      const objectId = row.dataset.objectId!;
      row.addEventListener('pointerdown', (event) => {
        const target = event.target as HTMLElement;
        if (target.matches('input, button')) return;
        this.meshManager.selectObject(objectId);
        this.onChange();
      });
      row.querySelector<HTMLInputElement>('[data-action="rename"]')!.addEventListener('change', (event) => {
        this.meshManager.renameObject(objectId, (event.target as HTMLInputElement).value);
        this.onChange();
      });
      row.querySelector<HTMLButtonElement>('[data-action="visibility"]')!.addEventListener('click', (event) => {
        event.stopPropagation();
        const object = this.meshManager.objects.find((item) => item.id === objectId);
        if (!object) return;
        this.meshManager.setObjectVisible(objectId, !object.visible);
        this.onChange();
      });
      row.querySelector<HTMLButtonElement>('[data-action="delete"]')!.addEventListener('click', (event) => {
        event.stopPropagation();
        this.meshManager.selectObject(objectId);
        this.meshManager.deleteActiveObject();
        this.onChange();
      });
    });
  }

  private escape(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }
}
