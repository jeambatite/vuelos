import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  effect,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { Flight } from '../core/flight.model';
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

  readonly flights = input<Flight[]>([]);
  readonly fuente = input('');
  readonly simulado = input(false);
  readonly error = input<string | null>(null);

  protected readonly girando = signal(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  protected readonly fallo = signal(false);
  protected readonly hovered = signal<string | null>(null);
  protected readonly zoomedCountry = signal<string | null>(null);

  constructor() {
    afterNextRender(() => void this.iniciar());
    effect(() => {
      const on = this.girando(); // se lee siempre, para que el efecto dependa de la señal
      this.handle?.setSpinning(on);
    });
    effect(() => {
      const lista = this.flights(); // se lee siempre, para que el efecto dependa de la señal
      this.handle?.setFlights(lista);
    });
  }

  protected alternar(): void {
    const on = !this.girando();
    this.girando.set(on);
    this.handle?.setSpinning(on);
  }

  protected volver(): void {
    this.handle?.zoomOut();
  }

  private async iniciar(): Promise<void> {
    try {
      // three.js se carga aparte para no pesar en la carga inicial de la página.
      const { createGlobe } = await import('./globe-scene');
      if (this.destroyed) return;
      this.handle = createGlobe(this.stage().nativeElement, {
        spinning: this.girando(),
        onHoverChange: (nombre) => this.hovered.set(nombre),
        onZoomChange: (nombre) => this.zoomedCountry.set(nombre),
      });
      this.handle.setFlights(this.flights());
    } catch {
      this.fallo.set(true);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.handle?.dispose();
  }
}
