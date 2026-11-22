# Radar RD (vuelos)

Prototipo de página estática para el seguimiento de vuelos en tiempo real desde y hacia República Dominicana, pensado como propuesta de mejora para Arajet y Aerodom.

Hecho con Angular (componentes standalone, signals y formularios reactivos).

## Estado actual

- Barra superior sticky con los parámetros de búsqueda: aerolínea, número de vuelo, origen, destino y fecha, con un avioncito de diseño en su esquina inferior izquierda.
- Globo terráqueo 3D (three.js) en "Rastreo en vivo": gira hacia el este, se puede arrastrar (al soltar se reanuda el giro) y tiene botón de pausa. Se carga bajo demanda.
- Los vuelos del globo vienen de una **capa de datos intercambiable**. Hoy usa datos simulados; ya está preparada para una API real.
- La barra de búsqueda filtra los vuelos que se muestran en el globo.
- Panel de detalle de vuelo pendiente.

## Desarrollo

```bash
npm install
npm start        # http://localhost:4200
npm run build    # genera dist/vuelos/browser (sitio estático)
npm test
```

## Publicar en GitHub Pages

El proyecto se publica solo con GitHub Actions (`.github/workflows/deploy.yml`) cada vez que se hace push a `main`.

1. En GitHub: **Settings > Pages > Build and deployment > Source: GitHub Actions** (se hace una sola vez).
2. Haz merge de tus cambios a `main`. El workflow corre las pruebas, compila y publica.
3. La página queda en `https://<usuario>.github.io/vuelos/`. El avance se ve en la pestaña **Actions**.

Si el repositorio se llama distinto a `vuelos`, el workflow ya usa el nombre real del repo. Solo cambia `build:pages` en `package.json` si quieres compilar con esa ruta en local:

```bash
npm run build:pages   # genera dist/vuelos/browser con base-href /vuelos/
```

## Capa de datos de vuelos (`src/app/core`)

```
Barra de búsqueda ─▶ FlightTrackerService ─▶ FlightDataProvider ─▶ (mock | API HTTP)
                            │  señales: flights, error, query
                            ▼
                       Globo 3D  (extrapola la posición entre actualizaciones)
```

- `flight.model.ts`: el modelo `Flight` (posición, rumbo, velocidad, altitud, origen, destino...). Es el único formato que entiende la interfaz.
- `flight-data.provider.ts`: el contrato `FlightDataProvider`. La app solo depende de él.
- `mock-flight.provider.ts`: fuente simulada (12 vuelos ilustrativos, tiempo acelerado x60; se cambia con `mock.speedFactor`).
- `http-flight.provider.ts` + `FlightApiAdapter`: fuente genérica para APIs HTTP/JSON.
- `adapters/opensky.adapter.ts`: ejemplo de adaptador (sin probar contra la API real).
- `flight-tracker.service.ts`: consulta la fuente cada `pollIntervalMs`, expone los vuelos como señales y conserva los últimos datos si la API falla.
- `extrapolate.ts`: estima la posición actual con rumbo y velocidad, para que el movimiento sea fluido aunque la API actualice cada 10 s.

### Conectar una API de vuelos

1. Escribe un adaptador que implemente `FlightApiAdapter` (ver `adapters/opensky.adapter.ts`). Solo tiene dos métodos: `request()` arma la petición y `parse()` convierte la respuesta al modelo `Flight`.
2. En `src/app/app.config.ts`, reemplaza la línea de `provideFlightData`:

```ts
provideFlightData({
  mode: 'http',
  pollIntervalMs: 10_000,
  http: { baseUrl: 'https://tu-api.example.com', adapter: miAdaptador() },
}),
```

No hay que tocar el globo ni la barra de búsqueda.

Notas para producción:
- Una clave de API puesta en el front queda visible. Con APIs de pago conviene un backend o proxy propio que guarde la clave y resuelva CORS.
- Si la API usa WebSocket o SSE en vez de HTTP, se crea otra implementación de `FlightDataProvider` y se registra igual.
- El campo `fecha` de la búsqueda aún no se usa: los datos en vivo son siempre "de ahora".
