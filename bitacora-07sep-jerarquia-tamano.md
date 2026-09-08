# Bitácora 07sep — jerarquía de tamaño en ranking
Handoff. Código gana si esto contradice algo.
Trabajo del 7-sep-2026. Continúa [bitacora-07sep-matchmaking-tamano-area.md](bitacora-07sep-matchmaking-tamano-area.md).

## Pedido y decisión

Adler: el filtro de entrada se queda (el sponsor elige con qué tamaños juntarse), pero el ranking debe premiar más a Grande que a Mediana, y dejar Pequeña/Micro más atrás aunque el sponsor también las haya aceptado. Tamaño sigue siendo la señal más importante del match. Adler pidió Pequeña y Micro más bajas que la primera propuesta (+40/+20).

Pesos cerrados en código:

| Tamaño declarado pedido | Puntos |
|---|---|
| Grande | +100 |
| Mediana | +70 |
| Pequeña | +20 |
| Micro | +10 |

## Qué cambió y por qué

- `PESOS.TAMANO_SOLICITADO` (empate +100) salió. Ahora `puntosPorTamanoDeclarado` usa Grande/Mediana/Pequeña/Micro.
- El filtro de Capa 1 no cambió: si el sponsor no pidió Micro, una Micro no entra (salvo bypass VIP/Speaker de tamaño).
- VIP/Speaker siguen sin puntos de tamaño si su categoría no está en la lista del sponsor.
- Legacy Exa sin tamaño declarado: Consolidado +80 / PyME +40. Eso deja Consolidado entre Grande y Mediana, y PyME por encima de Pequeña/Micro.

## Cómo operarlo

Redeploy del backend antes de la próxima corrida de `POST /matchmaking/sugerir-todos`. Las filas `Sugerido` viejas siguen siendo las que Adler borra a mano; no reejecutar one-shots de Notion de esta sesión.

## Pendientes

- Los de la bitácora anterior (borrar Sugerido, redeploy, pausar cron viejo) siguen abiertos.
- Si Laura quiere otra distancia Grande–Mediana (p. ej. Mediana +80), es solo cambiar `PESOS`.
