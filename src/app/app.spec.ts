import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
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
});
