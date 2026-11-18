# Radar RD (vuelos)

Prototipo de página estática para el seguimiento de vuelos en tiempo real desde y hacia República Dominicana, pensado como propuesta de mejora para Arajet y Aerodom.

Hecho con Angular (componentes standalone, signals y formularios reactivos).

## Estado actual

- Barra superior sticky con los parámetros de búsqueda: aerolínea, número de vuelo, origen, destino y fecha.
- Avioncito de diseño en la esquina inferior izquierda de la barra, con una ruta punteada que recorre su borde.
- Contenido de ejemplo para ver el comportamiento sticky (el mapa y el detalle llegan en los siguientes pasos).

## Desarrollo

```bash
npm install
npm start        # http://localhost:4200
npm run build    # genera dist/vuelos/browser (sitio estático)
npm test
```
