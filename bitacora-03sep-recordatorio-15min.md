# Bitácora 03sep — recordatorio WhatsApp 15 min antes

Handoff. Código gana si esto contradice algo.
Fecha del trabajo: 3 sep 2026. Continúa el flujo de reserva conversacional (27-ago).

## Pedido

Al agendar una cita, programar en Plática la plantilla `notificacion_cita_15min_antes` 15 minutos antes. Solo el asistente; `{{2}}` = empresa del sponsor. No tocar `reservarCita` ni `enviarPlantilla`: duplicar el POST de plantilla.

## Qué cambió y por qué

Archivos nuevos: `src/services/recordatorio-cita-15min.service.js` (copia de `/v1/messages/template` + `scheduleTime`), controller, `POST /citas/programar-recordatorio-15min`. Una ruta agregada en `citas.routes.js`. Tests en `tests/recordatorio-cita-15min.manual-test.js` y `tests/reservar-recordatorio-15min.manual-test.js`.

El camino feliz lo dispara `citas.controller.js` `reservar()` **después** de `reservarCita` (solo alta nueva `Confirmada` / `Confirmada sin notificar`; no `ya_existia`). Fire-and-forget: un fallo de Plática no cambia el 201 ni Notion. El endpoint suelto queda para reintento manual. `booking.service.js` no se tocó. Modificar/cancelar no anulan el programado.

## Cómo operarlo

- Coolify: `PLATICA_TEMPLATE_CITA_15MIN=notificacion_cita_15min_antes` (mismas `PLATICA_API_KEY` / `PLATICA_CHANNEL_ID`).
- Si falta la env → `{ omitido: true, motivo: "SIN_PLANTILLA" }`, no 500.
- Body: `asistente_notion_id`, `sponsor_notion_id`, `inicio` (ISO). `X-API-Key`.
- Plática cae → 502. Notion de la cita no se toca.

## Pendientes

- Coolify: `PLATICA_TEMPLATE_CITA_15MIN=notificacion_cita_15min_antes`.
- No hace falta segunda API tool en Plática para el camino feliz.
- Cuando exista cancelar/reprogramar plantilla, enganchar modificar/cancelar.
