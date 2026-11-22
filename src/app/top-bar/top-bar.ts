import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AIRPORT_LIST } from '../core/airports';
import { FlightQuery } from '../core/flight.model';

/** Fecha de hoy (AAAA-MM-DD) en la zona horaria de República Dominicana. */
function hoyRD(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
}

@Component({
  selector: 'app-top-bar',
  imports: [ReactiveFormsModule],
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopBar {
  private readonly fb = inject(FormBuilder);

  readonly buscar = output<FlightQuery>();
  readonly limpio = output<void>();

  protected readonly aeropuertos = AIRPORT_LIST;
  protected readonly abierto = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    aerolinea: ['todas'],
    numero: ['', Validators.pattern(/^[A-Za-z0-9]{2}\s?\d{1,4}$/)],
    origen: ['', Validators.pattern(/^[A-Za-z]{3}$/)],
    destino: ['', Validators.pattern(/^[A-Za-z]{3}$/)],
    fecha: [hoyRD()],
  });

  protected invalido(campo: 'numero' | 'origen' | 'destino'): boolean {
    const c = this.form.controls[campo];
    return c.invalid && c.touched;
  }

  protected intercambiar(): void {
    const { origen, destino } = this.form.getRawValue();
    this.form.patchValue({ origen: destino, destino: origen });
  }

  protected limpiar(): void {
    this.form.reset({ aerolinea: 'todas', numero: '', origen: '', destino: '', fecha: hoyRD() });
    this.error.set(null);
    this.limpio.emit();
  }

  protected enviar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revisa los campos marcados: el vuelo es como DM201 y los aeropuertos son códigos de 3 letras.');
      return;
    }
    const v = this.form.getRawValue();
    const numero = v.numero.replace(/\s+/g, '').toUpperCase();
    const origen = v.origen.toUpperCase();
    const destino = v.destino.toUpperCase();

    if (!numero && !origen && !destino) {
      this.error.set('Indica un número de vuelo o una ruta (origen y destino).');
      return;
    }
    this.error.set(null);
    this.buscar.emit({ aerolinea: v.aerolinea, numero, origen, destino, fecha: v.fecha });
    this.abierto.set(false);
  }
}
