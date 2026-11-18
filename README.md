# Radar RD (vuelos)

Prototipo de página estática para el seguimiento de vuelos en tiempo real desde y hacia República Dominicana, pensado como propuesta de mejora para Arajet y Aerodom.

Hecho con Angular (componentes standalone, signals y formularios reactivos).

## Estado actual

- Barra superior sticky con los parámetros de búsqueda: aerolínea, número de vuelo, origen, destino y fecha.
- Avioncito de diseño en la esquina inferior izquierda de la barra, con una ruta punteada que recorre su borde.
- Globo terráqueo 3D (three.js) en "Rastreo en vivo": gira hacia el este, con aeropuertos, rutas de ejemplo y aviones en movimiento. Se carga bajo demanda y tiene botón para pausar el giro.
- Panel de detalle de vuelo pendiente (llega en los siguientes pasos).

## Desarrollo

```bash
npm install
npm start        # http://localhost:4200
npm run build    # genera dist/vuelos/browser (sitio estático)
npm test
```
