# Bitácora 03sep — recordatorio WhatsApp 15 min antes

Handoff. Código gana si esto contradice algo.
Fecha del trabajo: 3 sep 2026. Continúa el flujo de reserva conversacional (27-ago).

## Pedido

Al agendar una cita, programar en Plática la plantilla `notificacion_cita_15min_antes` 15 minutos antes. Solo el asistente; `{{2}}` = empresa del sponsor. No tocar `reservarCita` ni `enviarPlantilla`: duplicar el POST de plantilla.

## Qué cambió y por qué

Archivos nuevos: `src/services/recordatorio-cita-15min.service.js` (copia de `/v1/messages/template` + `scheduleTime`), controller, `POST /citas/programar-recordatorio-15min`. Una ruta agregada en `citas.routes.js`. Tests en `tests/recordatorio-cita-15min.manual-test.js` y `tests/reservar-recordatorio-15min.manual-test.js`.

El camino feliz lo dispara `citas.controller.js` `reservar()` **después** de `reservarCita` (solo alta nueva `Confirmada` / `Confirmada sin notificar`; no `ya_existia`). Fire-and-forget: un fallo de Plática no cambia el 201 ni Notion. El endpoint suelto queda para reintento manual. `booking.service.js` no se tocó. Modificar/cancelar no anulan el programado.

El prompt vivo del Agente 2 todavía programaba el mismo aviso con
`mcp_send_template_message_mexx2b`, lo que habría creado dos mensajes por
alta al desplegar este backend. El 3-sep se retiró únicamente ese flujo:
prompt activo `wegNBgyUlzqog43WZ0mA` (54 versiones). El agente ahora deja
el aviso de 15 minutos al backend. Su recordatorio de 2 horas por
confirmación de asistencia permanece intacto y conserva las tools de
plantillas activas. Snapshot sincronizado en
`prompts-agentes-platica/Prompt y detalles - Citas 1-1 - Gestión de Citas Fashion Digital Talks.md`.

## Cómo operarlo

- Coolify: `PLATICA_TEMPLATE_CITA_15MIN=notificacion_cita_15min_antes` (mismas `PLATICA_API_KEY` / `PLATICA_CHANNEL_ID`).
- Si falta la env → `{ omitido: true, motivo: "SIN_PLANTILLA" }`, no 500.
- Body: `asistente_notion_id`, `sponsor_notion_id`, `inicio` (ISO). `X-API-Key`.
- Plática cae → 502. Notion de la cita no se toca.

## Límite de 720 h de Plática (bloquea el evento por ahora)

Plática/Meta rechaza `scheduleTime` a más de **720 h (30 días)**. Probado
en vivo el 2-sep 23:11 UTC con `notificacion_cita_15min_antes` para una
cita del 7 oct:

```
Template send failed: 3 INVALID_ARGUMENT: The Task.scheduleTime,
2026-10-07T09:45:00-07:00, is too far in the future.
Schedule time must be no more than 720h in the future.
```

El backend pega al mismo `/v1/messages/template`, así que hoy recibe el
mismo 500 → 502. **Ninguna cita del 7–8 oct se puede programar antes del
7–8 sep.** Decisión (Luis, 3-sep): no se implementa barrido diferido; se
espera a que abra la ventana y se revisa después del 7 de septiembre.

Para verlo en Coolify, el service ahora escribe
`[Recordatorio15min] Programado {…}` en éxito y el controller
`Recordatorio 15 min omitido` / `falló` con ids, `inicio` y el error.
Antes el éxito era silencioso y no se distinguía de "no corrió".

## Pendientes

- Coolify: `PLATICA_TEMPLATE_CITA_15MIN=notificacion_cita_15min_antes`.
- No hace falta segunda API tool en Plática para el camino feliz.
- Cuando exista cancelar/reprogramar plantilla, enganchar modificar/cancelar.
- Después del 7-sep: reprobar el recordatorio ya dentro de la ventana de
  720 h y decidir cómo cubrir las citas agendadas antes de esa fecha.
- El Agente 2 todavía consulta `mcp_get_template_mexx2b` de la plantilla
  de 15 min tras reservar (3-sep 20:07); ya no la envía, pero es una
  llamada de más.

## Evidencia del prompt vivo

- Agente: `c1IYnFsr0Jzfqq4NeLAs`.
- Se eliminaron por reemplazo exacto la sección
  `RECORDATORIO AL CREAR UNA CITA` y las instrucciones de enviar
  `notificacion_cita_15min_antes`.
- `notificacion_citas_2horas_antes` sigue en el prompt.
- 16 tools conectadas / 12 activas; no se modificaron conexiones.
- No se envió ninguna plantilla ni mensaje durante el cambio.
