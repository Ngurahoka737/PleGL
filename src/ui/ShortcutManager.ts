export class ShortcutManager {
  constructor(private readonly onBrush: (name: string) => void) {
    window.addEventListener('keydown', this.handleKey);
  }

  private readonly handleKey = (event: KeyboardEvent): void => {
    if (event.key === '1') this.onBrush('Draw');
    if (event.key === '2') this.onBrush('Smooth');
    if (event.key === '3') this.onBrush('Clay');
  };
}
