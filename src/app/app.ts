import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FlightQuery } from './core/flight.model';
import { FlightTrackerService } from './core/flight-tracker.service';
import { Globe } from './globe/globe';
import { TopBar } from './top-bar/top-bar';

@Component({
  selector: 'app-root',
  imports: [TopBar, Globe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly tracker = inject(FlightTrackerService);
  protected readonly busqueda = signal<FlightQuery | null>(null);

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

  protected alBuscar(b: FlightQuery): void {
    this.busqueda.set(b);
    this.tracker.buscar(b);
  }

  protected alLimpiar(): void {
    this.busqueda.set(null);
    this.tracker.limpiar();
  }
}
