export type SwapSlot = 'blue' | 'green';

export interface SwapManagerOptions {
  blueFrame: HTMLIFrameElement;
  greenFrame: HTMLIFrameElement;
  activeSlot?: SwapSlot;
  zIndexActive?: number;
  zIndexInactive?: number;
}

export class SwapManager {
  private readonly frames: Record<SwapSlot, HTMLIFrameElement>;
  private activeSlot: SwapSlot;
  private readonly zIndexActive: number;
  private readonly zIndexInactive: number;

  constructor({
    blueFrame,
    greenFrame,
    activeSlot = 'blue',
    zIndexActive = 2,
    zIndexInactive = 1,
  }: SwapManagerOptions) {
    this.frames = { blue: blueFrame, green: greenFrame };
    this.activeSlot = activeSlot;
    this.zIndexActive = zIndexActive;
    this.zIndexInactive = zIndexInactive;

    this.applyVisibility();
  }

  injectToInactive(html: string): void {
    const inactive = this.frames[this.getInactiveSlot()];
    inactive.srcdoc = html;
  }

  swap(): void {
    this.activeSlot = this.getInactiveSlot();
    this.applyVisibility();
  }

  getActiveSlot(): SwapSlot {
    return this.activeSlot;
  }

  waitForLoad(timeout: number): Promise<boolean> {
    const target = this.frames[this.getInactiveSlot()];

    return new Promise((resolve, reject) => {
      let settled = false;

      const clear = () => {
        target.removeEventListener('load', onLoad);
        if (timer !== null) {
          clearTimeout(timer);
        }
      };

      const onLoad = () => {
        if (settled) return;
        settled = true;
        clear();
        resolve(true);
      };

      const timer = timeout > 0
        ? setTimeout(() => {
            if (settled) return;
            settled = true;
            clear();
            reject(new Error('Preview iframe load timed out.'));
          }, timeout)
        : null;

      target.addEventListener('load', onLoad);
    });
  }

  private getInactiveSlot(): SwapSlot {
    return this.activeSlot === 'blue' ? 'green' : 'blue';
  }

  private applyVisibility(): void {
    const active = this.frames[this.activeSlot];
    const inactive = this.frames[this.getInactiveSlot()];

    active.style.opacity = '1';
    active.style.zIndex = String(this.zIndexActive);
    active.style.pointerEvents = 'auto';

    inactive.style.opacity = '0';
    inactive.style.zIndex = String(this.zIndexInactive);
    inactive.style.pointerEvents = 'none';
  }
}
