# Radar RD (vuelos)

Prototipo de página estática para el seguimiento de vuelos en tiempo real desde y hacia República Dominicana, pensado como propuesta de mejora para Arajet y Aerodom.

Hecho con Angular (componentes standalone, signals y formularios reactivos).

## Guía rápida para una IA (o para cualquiera que abra esto por primera vez)

Esto es lo mínimo para orientarse sin tener que leer todo el código:

- **Qué es:** una sola página (sin backend) con una barra de búsqueda sticky arriba y, debajo, un globo terráqueo 3D que muestra vuelos en vivo. Pensada para compilarse como sitio estático y publicarse en GitHub Pages.
- **Stack:** Angular 22 (standalone, sin `NgModule`), signals en vez de `@Input`/`@Output`/`@ViewChild` (se usan `input()`, `output()`, `viewChild()`), `ChangeDetectionStrategy.OnPush` en todos los componentes, SCSS, RxJS solo en la capa de datos, three.js para el globo 3D. Las pruebas corren con **Vitest** vía `ng test` (es el runner por defecto de esta versión de Angular, no Jasmine/Karma).
- **Los datos de vuelos son simulados** pero la capa que los provee está diseñada para aceptar una API real cambiando una sola línea (ver "Capa de datos de vuelos" más abajo). No asumas que lo que ves en el globo son vuelos reales.
- **El idioma del código:** todo el texto de interfaz, los comentarios y los nombres específicos del dominio (`buscar`, `alBuscar`, `girando`, `zoomedCountry`, `aeropuertos`) están en español. Los nombres de tipos/conceptos genéricos de programación (`Flight`, `Marker`, `GlobeHandle`) están en inglés. Sigue esa misma mezcla al editar.
- **El globo (`globe/globe-scene.ts`) NO es un componente Angular a propósito.** Es una función (`createGlobe(container, opts) → GlobeHandle`) con su propio `requestAnimationFrame`, para que Angular no intente aplicar su detección de cambios dentro de un render loop de 60 fps. El componente `globe/globe.ts` es solo el envoltorio delgado que la invoca, le pasa las señales y muestra los botones/leyendas alrededor del `<canvas>`.

### Mapa de archivos

```
src/app/
├── app.ts / app.html / app.scss     Componente raíz: compone la barra superior y el globo.
├── app.config.ts                    Arranque de Angular. Aquí se elige la fuente de datos (mock o HTTP real).
│
├── top-bar/                         Barra de búsqueda sticky.
│   └── top-bar.ts/html/scss           Formulario reactivo: aerolínea, n.º de vuelo, origen, destino, fecha.
│
├── globe/                           El globo 3D.
│   ├── globe.ts/html/scss             Componente Angular: wrapper fino, señales de hover/zoom, carga perezosa.
│   └── globe-scene.ts                 Todo el three.js (escena, cámara, arrastre, zoom, países, vuelos).
│
└── core/                            Capa de datos y utilidades. Sin dependencias de Angular ni del DOM.
    ├── flight.model.ts                Tipo `Flight` y su clasificación (nacional / saliente / entrante).
    ├── airports.ts                    Lista estática de aeropuertos (lat/lon, si es de RD).
    ├── countries.ts                   Países (world-atlas, 50 m) y búsqueda de país por lat/lon.
    ├── geo.ts                         Matemática esférica: distancia, rumbo, interpolación en círculo máximo.
    ├── extrapolate.ts                 Estima la posición actual entre actualizaciones de la fuente de datos.
    ├── flight-data.provider.ts        Contrato `FlightDataProvider` (clase abstracta). La app solo depende de esto.
    ├── flight-data.tokens.ts          Tipos de configuración + el `InjectionToken`.
    ├── mock-flight.provider.ts        Implementación simulada (los vuelos de ejemplo).
    ├── http-flight.provider.ts        Implementación genérica para una API HTTP real.
    ├── provide-flight-data.ts         `provideFlightData(...)`: registra una u otra implementación.
    ├── flight-tracker.service.ts      Sondea la fuente y expone señales (`flights`, `error`, `query`).
    ├── adapters/opensky.adapter.ts    Ejemplo de adaptador para una API concreta (sin probar contra la real).
    └── core.spec.ts                   Pruebas de todo lo de arriba (sin depender de Angular ni de three.js).
```

### Flujo de datos

```
Barra de búsqueda ─▶ FlightTrackerService ─▶ FlightDataProvider ─▶ (mock | API HTTP)
                            │  señales: flights, error, query
                            ▼
                       Globo 3D  (extrapola la posición entre actualizaciones)
```

### Decisiones y límites conocidos (para no "redescubrirlos")

- El país de referencia para clasificar un vuelo como nacional/saliente/entrante es República Dominicana, codificado como el campo `rd` en `core/airports.ts`. No hay forma de cambiarlo desde la interfaz.
- El campo `fecha` de la búsqueda todavía no filtra nada: los datos en vivo son siempre "de ahora".
- El hover y el zoom del globo dependen de un `<canvas>` con WebGL: no son operables por teclado ni lector de pantalla. Es una limitación conocida, no un olvido.
- El acercamiento a un país (click) y el zoom libre (rueda/pellizco) son dos mecanismos separados en `globe-scene.ts` (`zoomTo`/`zoomOut` vs. `userDistance`); no se combinan a propósito, para evitar casos raros de interacción.
- El pellizco con dos dedos se escribió siguiendo la API de Pointer Events pero no se probó en un dispositivo táctil real.
- `countries.ts` usa resolución 50 m de `world-atlas`; algunas coordenadas exactas muy pegadas a la costa (ej. un aeropuerto justo en la orilla) pueden caer técnicamente "en el mar" al consultarlas. Por eso las pruebas en `core.spec.ts` usan puntos bien adentro del país, no coordenadas de aeropuertos.

### ¿Dónde miro para...?

| Quiero...                                            | Archivo(s)                                              |
|-------------------------------------------------------|----------------------------------------------------------|
| Cambiar los campos o la validación de la búsqueda      | `top-bar/top-bar.ts`, `top-bar/top-bar.html`              |
| Conectar una API real de vuelos                        | `core/provide-flight-data.ts`, `core/adapters/`, sección "Conectar una API" más abajo |
| Cambiar el aspecto del globo, el avión o los colores   | `globe/globe-scene.ts`                                    |
| Agregar un aeropuerto o una ruta simulada              | `core/airports.ts`, `core/mock-flight.provider.ts`         |
| Cambiar qué cuenta como vuelo nacional/saliente/entrante | `core/flight.model.ts` (función `classifyRoute`)         |
| Cambiar el despliegue a GitHub Pages                   | `.github/workflows/deploy.yml`                            |

## Estado actual

- Barra superior sticky con los parámetros de búsqueda: aerolínea, número de vuelo, origen, destino y fecha, con un avioncito de diseño en su esquina inferior izquierda.
- Globo terráqueo 3D (three.js) en "Rastreo en vivo": gira hacia el este, se puede arrastrar (al soltar se reanuda el giro) y tiene botón de pausa. Se carga bajo demanda.
- Al pasar el cursor por un país se resaltan sus fronteras en verde azulado (con contornos de 50 m, bastante más fieles que antes); al hacer click se hace zoom hacia ese país (y un botón "Volver al planeta" para salir). Mientras está acercado, el giro automático se pausa solo.
- Además del zoom a un país, el globo se puede acercar o alejar libremente con la rueda del mouse o con un pellizco de dos dedos en pantallas táctiles.
- Cada vuelo se muestra como una silueta de avión (fuselaje, alas y cola), orientada hacia su rumbo real, en vez de un punto o una flecha.
- Los aeropuertos se ven más pequeños y se reducen todavía más al acercarse a un país, para no tapar el mapa.
- Los arcos de ruta van bajos, pegados a la superficie, en vez de formar un domo que parece ignorar la curvatura del planeta.
- Los vuelos se colorean según su tipo respecto a República Dominicana: verde si son nacionales o salen del país, amarillo si están entrando.
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

- `flight.model.ts`: el modelo `Flight` (posición, rumbo, velocidad, altitud, origen, destino...). Es el único formato que entiende la interfaz.
- `flight-data.provider.ts`: el contrato `FlightDataProvider`. La app solo depende de él.
- `mock-flight.provider.ts`: fuente simulada (14 vuelos ilustrativos, tiempo acelerado x60; se cambia con `mock.speedFactor`).
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
