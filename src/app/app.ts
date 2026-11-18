import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { BusquedaVuelo, TopBar } from './top-bar/top-bar';

@Component({
  selector: 'app-root',
  imports: [TopBar],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly busqueda = signal<BusquedaVuelo | null>(null);

  protected readonly filtros = computed(() => {
    const b = this.busqueda();
    if (!b) return [];
    return [
      b.aerolinea !== 'todas' ? { etiqueta: 'Aerolínea', valor: b.aerolinea } : null,
      b.numero ? { etiqueta: 'Vuelo', valor: b.numero } : null,
      b.origen ? { etiqueta: 'Origen', valor: b.origen } : null,
      b.destino ? { etiqueta: 'Destino', valor: b.destino } : null,
      b.fecha ? { etiqueta: 'Fecha', valor: b.fecha } : null,
    ].filter((f): f is { etiqueta: string; valor: string } => f !== null);
  });

  protected alBuscar(b: BusquedaVuelo): void {
    this.busqueda.set(b);
  }
}
