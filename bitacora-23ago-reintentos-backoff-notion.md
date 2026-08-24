# Bitácora 23-ago — Reintentos con backoff al confirmar Notion tras WhatsApp OK

Handoff corto. Código gana si esto contradice algo. Fecha: 23-ago-2026. **Sin commit.** Sigue de `bitacora-23ago-estado-intermedio-envio.md`.

## Por qué

Tras `enviarPlantilla` OK, un timeout de Notion dejaba la fila en `En curso` hasta el timeout de 10 min (riesgo residual de duplicar WhatsApp). Adler pidió bajar ese riesgo con reintentos, no con idempotencia de Plática.

## Patrón (no inventar otro)

El README habla de 3 reintentos SMTP en `email.service.js`; el loop real está en `booking.service.js`: `REINTENTOS_INMEDIATOS_SMTP = 3` y `await sleep(300 * intento)` entre fallos. La confirmación Notion post-Calendar usa lo mismo.

Helper nuevo: `src/utils/reintentar-con-backoff.js` (`INTENTOS_MAXIMOS = 3`, `MS_BASE_BACKOFF = 300`). Booking no se refactorizó en este cambio.

## Dónde aplica

Solo el bloque post-WhatsApp en `dispararCampanasAprobadas`: `actualizarEstadoCampana` + `incrementarReactivaciones` (si C1/C2) + `marcarCampanaEnviada`, como **una unidad** reintentada (las tres escrituras son idempotentes respecto al valor en memoria).

**No** se reintenta:

- marcar `En curso` (si falla, no hay Plática)
- `enviarPlantilla` (sigue yendo a `Falló`)
- `soloMarcar` (no hay WhatsApp previo)

Si los 3 intentos fallan: la fila queda `En curso`; `resumen.errores` dice `Fallo de escritura Notion POST-envío tras 3 intentos`.

## Tests

`node tests/campanas-matchmaking.manual-test.js` — 2 fallos + 3er OK → `Enviada`; 3 fallos → `En curso` + POST-envío; esperas `[300, 600]`; En curso y plantilla no usan backoff.

## Qué no hacer

No meter Redis/jobs. No cambiar la ventana de 10 min. No idempotencia Plática. No aplicar schema en el workspace de Laura.
