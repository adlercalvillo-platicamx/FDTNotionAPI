# Bitácora 07sep — recordatorio de 15 min: de programado a cron

Handoff. Código gana si esto contradice algo.
Fecha del trabajo: 7 sep 2026. Continúa [bitacora-03sep-recordatorio-15min.md] y
[bitacora-07sep-reagendar-canceladas.md].
Para Luis: esto reemplaza el mecanismo que dejaste el 3-sep. El **qué** (plantilla,
params, destinatario, 15 min antes) no cambió; cambió **quién decide cuándo**.

## Pedido y decisión

Adler: al implementar la re-agenda de citas canceladas quedó a la vista que un
recordatorio ya programado no se puede retirar. Se propuso rediseñarlo, Adler lo
paró para consultarlo contigo, y con tu ok (7-sep) se implementó el cron.

## Por qué se cambió

Tres cosas que el programado no podía cubrir, en orden de gravedad:

1. **Cancelar no anula el aviso.** Plática no expone cancelar un mensaje con
   `scheduleTime` (revisado en la API y en el catálogo de tools MCP). El asistente
   recibía el recordatorio de una cita que ya no existía. Esto ya estaba anotado
   como límite conocido en la cabecera del service del 3-sep.
2. **Reprogramar avisaba a la hora vieja y nunca a la nueva.** `modificarCita` no
   programa nada, y el programado original seguía en pie con el horario anterior.
3. **La re-agenda de canceladas (7-sep) juntaba las dos.** La cancelada tenía su
   aviso y la cita nueva otro: dos mensajes, uno con hora equivocada.

De paso cierra tu pendiente del 3-sep sobre el límite de **720 h** de Meta: ya no
hay que esperar ventana ni cubrir las citas agendadas antes del 7-sep, porque
nada se programa a futuro. Se manda en el momento.

## Qué cambió

Dirección invertida: antes reservar empujaba el aviso a Plática; ahora Notion es
la fuente y un cron pregunta. Notion ya sabe si la cita está cancelada, movida o
viva, así que no hay estado duplicado que reconciliar.

- `src/services/recordatorio-cita-15min.service.js`: `programarRecordatorioCita15min`
  → `enviarRecordatorios15minPendientes({ ahora, minutos })`. Se fue `scheduleTime`
  y con él `scheduleTimeDesdeInicio` / `formatearIsoConOffset`. `platicaFetch`,
  `primerNombreParaSaludo` y `limpiarParametroPlantilla` quedaron igual.
- `src/services/citas.service.js`: `buscarCitasParaRecordatorio15min({ desde, hasta, ahora })`
  y `marcarEstadoRecordatorio15min(...)`. `datosDeCita` ahora también expone
  `estadoRecordatorio15min` y `fechaRecordatorio15min`.
- `src/controllers/recordatorio-cita-15min.controller.js`: `enviarRecordatorios15min`
  para el cron; `programarRecordatorio15min` quedó como **410** con el motivo, en
  vez de borrar la ruta, para que un cron viejo o una prueba no falle en silencio.
- `src/controllers/citas.controller.js`: se retiró `encolarRecordatorio15minTrasReserva`.
  Reservar ya no dispara nada; el 201 y su body no cambiaron.
- `src/routes/citas.routes.js`: `POST /citas/enviar-recordatorios-15min`.
- `booking.service.js` **no se tocó**.

### Idempotencia y fallos

El estado vive en la fila de Citas, no en memoria:

| Estado | Significa | ¿Reintenta? |
|---|---|---|
| (vacío) | nunca se intentó | sí |
| `En curso` | reclamada, se está mandando | solo si el reclamo tiene > 10 min |
| `Enviado` | plantilla aceptada por Plática | no |
| `Falló` | error de Plática o de Contactos, con motivo en `Notas` | sí, mientras siga en ventana |
| `Omitido` | asistente sin WhatsApp | no, es terminal |

`En curso` se escribe **antes** de llamar a Plática: si dos corridas se traslapan,
la segunda ve la fila tomada y no manda. Si el proceso muere entre el reclamo y el
envío la fila quedaría trabada, así que un reclamo de más de 10 minutos se vuelve
a tomar. Si no se puede escribir el reclamo, no se manda (mejor un aviso perdido
que uno duplicado). Un fallo de una cita no aborta el lote.

## Cómo operarlo

- **Cron nuevo en Coolify** (Adler; mismo patrón que `Recordatorio evento matchmaking`):
  - Name: `Recordatorio cita 15 min`
  - Command:
    ```
    curl -X POST http://localhost:3001/citas/enviar-recordatorios-15min -H "X-API-Key: <mismo secret que los otros crons>" -H "Content-Type: application/json"
    ```
    Sin body. Pega a `localhost:3001` del mismo contenedor, como el de sugerencias.
  - Frequency: `*/5 * * * *` (cada 5 minutos). Con eso el aviso sale entre 15 y ~10 min antes.
  - Timeout: 300 segundos (igual que el de sugerencias).
  - Container name: vacío.
  - Solo hace falta activo el 7 y 8 de oct; fuera de esos días cada corrida responde `revisadas: 0` y no manda WhatsApp.
- Env: `PLATICA_TEMPLATE_CITA_15MIN=notificacion_cita_15min_antes` (ya estaba).
  Sin ella la corrida responde `{ omitido: true, motivo: "SIN_PLANTILLA" }` y no
  toca Notion. Mismas `PLATICA_API_KEY`, `PLATICA_CHANNEL_ID`,
  `PLATICA_RESPONDER_AGENT_ID`.
- La cadencia define la puntualidad: con 5 min el aviso sale entre 15 y ~10 min
  antes. Bajar el cron a 1 min lo acerca a los 15 exactos; no cambia nada más.
- Prueba manual sin esperar el evento: `{"ahora":"2026-10-07T10:15:00-06:00"}`.
  **Manda WhatsApp de verdad** a los asistentes de esas citas — usar solo con
  números de prueba y revisando antes a quién le toca.
- Para reintentar una fila a mano: vaciar `Estado Recordatorio 15min` en Notion.
- Schema de Citas (Laura, producción): se agregó la opción `Omitido` al select
  `Estado Recordatorio 15min` con
  `scripts/one-shots/opcion-omitido-recordatorio-laura-07sep.js --confirmar`. Los
  tres campos (`Estado` / `Fecha` / `Notas Recordatorio 15min`) ya existían desde
  la planeación del 7-sep y ahora sí tienen código detrás. `Estatus Recordatorio`
  (Confirmada / Reagendada / Cancelada) es otro campo y **no** se tocó.

## Evidencia

- 37/37 manual-tests pasan, incluidos los dos reescritos:
  `tests/recordatorio-cita-15min.manual-test.js` (cron: cancelada no avisa,
  reprogramada avisa a su hora nueva, doble corrida no duplica, reclamo trabado,
  Plática 500 → `Falló` y reintento, sin WhatsApp → `Omitido`) y
  `tests/reservar-recordatorio-15min.manual-test.js` (reservar no toca
  recordatorios, ruta vieja 410, validación del body del cron).
- Filtro contra Citas de Laura (solo lectura, 7-sep): la ventana 6–9 oct devuelve
  **10 citas** `Confirmada`, todas con `Estado Recordatorio 15min` vacío. Notion
  acepta el filtro (2 niveles de anidamiento) y los bloqueos de conferencia
  quedan fuera por el post-filtro en JS.
- Opciones del select tras el one-shot: `En curso | Enviado | Falló | Omitido`.

## Pendientes

- Dar de alta el cron en Coolify (Adler). Sin eso **no sale ningún recordatorio**.
- Auditar la cola de programados que quedó en Plática de las pruebas del 3-sep:
  si alguna cita del 7–8 oct alcanzó a programarse y luego se canceló o se movió,
  ese mensaje va a salir igual y no se puede retirar por API. El límite de 720 h
  hace probable que casi nada se haya programado, pero conviene confirmarlo.
- Prueba en vivo con un número de prueba antes del evento, usando `ahora`.
- El Agente 2 no manda este aviso desde el 3-sep y no se tocó su prompt: para el
  agente nada cambió, sigue siendo cosa del backend.
