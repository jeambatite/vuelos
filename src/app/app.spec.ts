import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { provideFlightData } from './core/provide-flight-data';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideFlightData({ mode: 'mock' })],
    }).compileComponents();
  });

  it('crea la app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('muestra la barra superior con el formulario de búsqueda', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-top-bar header.bar')).toBeTruthy();
    expect(el.querySelector('#numero')).toBeTruthy();
    expect(el.querySelector('svg.plane')).toBeTruthy();
    expect(el.querySelector('app-globe .stage')).toBeTruthy();
  });

  it('el botón alterna entre pausar y girar', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const boton = el.querySelector('app-globe .toggle') as HTMLButtonElement;
    expect(boton.textContent).toContain('Pausar giro');
    boton.click();
    await fixture.whenStable();
    expect(boton.textContent).toContain('Girar');
    boton.click();
    await fixture.whenStable();
    expect(boton.textContent).toContain('Pausar giro');
  });

  it('muestra los vuelos de la fuente simulada en el globo', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    // El servicio hace su primera consulta con un timer(0): se espera un instante real.
    await new Promise((resolve) => setTimeout(resolve, 50));
    await fixture.whenStable();
    fixture.detectChanges();
    const caption = (fixture.nativeElement as HTMLElement).querySelector('app-globe .caption')!.textContent!;
    expect(caption).toContain('12 vuelos en vivo');
    expect(caption).toContain('datos simulados');
  });
});
