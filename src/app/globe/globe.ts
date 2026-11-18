import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  effect,
  signal,
  viewChild,
} from '@angular/core';
import type { GlobeHandle } from './globe-scene';

@Component({
  selector: 'app-globe',
  templateUrl: './globe.html',
  styleUrl: './globe.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Globe implements OnDestroy {
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private handle?: GlobeHandle;
  private destroyed = false;

  protected readonly girando = signal(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  protected readonly error = signal(false);

  constructor() {
    afterNextRender(() => void this.iniciar());
    effect(() => this.handle?.setSpinning(this.girando()));
  }

  private async iniciar(): Promise<void> {
    try {
      // three.js se carga aparte para no pesar en la carga inicial de la página.
      const { createGlobe } = await import('./globe-scene');
      if (this.destroyed) return;
      this.handle = createGlobe(this.stage().nativeElement, { spinning: this.girando() });
    } catch {
      this.error.set(true);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.handle?.dispose();
  }
}
