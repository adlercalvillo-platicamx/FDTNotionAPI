# Bitácora — fallback de horarios al siguiente sponsor (26-ago-2026)

Sigue de `bitacora-26ago-horarios-top-y-recordatorio.md`.
Cierra el pendiente de Adler: si el sponsor top no tiene bloques, sí se recorre
el resto de las sugerencias por score.

## Decisión

Los horarios salen del primer sponsor ofrecido (máx. 4, ordenados por score)
que tenga **al menos 1 bloque libre**. El mensaje sigue nombrando a todos los
sugeridos con su solución. Solo si los 4 están llenos no se envía
(`SIN_HORARIOS_SUGERIDOS`).

La alternancia Mañana/Tarde y el corte 14:00 no cambian. El recordatorio del
evento y el tratamiento de `Rechazado` como elegible tampoco.

## Verificación

- `node tests/campanas-matchmaking.manual-test.js`

No se tocó producción de Laura ni se enviaron WhatsApps reales.
