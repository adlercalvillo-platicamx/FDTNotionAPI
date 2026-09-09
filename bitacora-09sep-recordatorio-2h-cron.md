# Bitácora 09sep — recordatorio de 2 h por cron

Handoff. Código gana si esto contradice algo.
Fecha del trabajo: 9 sep 2026. Continúa [bitacora-07sep-recordatorio-15min-cron.md].

## Pedido y decisión

Adler: el de 2 horas se maneja igual que el de 15 min (cron Coolify, Notion
decide). Avisar a cualquier `Confirmada` / `Confirmada sin notificar`, no solo
la primera del día. Plantilla ya aprobada `notificacion_cita_2horas_antes`.

Luis no dejó service/ruta/campos en este backend: el aviso vivía en el Agente 2
con `scheduleTime` al confirmar asistencia (y el prompt nombraba mal la
plantilla: `notificacion_citas_2horas_antes`).

## Qué cambió y por qué

Mismo problema que el de 15 min: Plática no cancela un programado. Una cita
cancelada o movida seguía avisando.

- `src/services/recordatorio-cita-2h.service.js` +
  `POST /citas/enviar-recordatorios-2h`.
- Campos nuevos en Citas: `Estado Recordatorio 2h` (En curso / Enviado / Falló /
  Omitido), `Fecha Recordatorio 2h`, `Notas Recordatorio 2h`. Independientes
  del de 15 min: una cita puede recibir los dos.
- Params: `{{1}}` primer nombre; `{{2}}` hora `3:00 pm`; `{{3}}`
  `Marco Trujillo, de Plática.mx` (nombre + apellido paterno, empresa de Notion).
- Agente 2: deja de programar la plantilla. Prompt activo `jPnLZ9AcBDKV8JhViRtQ`.
  `api_actualizar_recordatorio` se queda para confirmar asistencia.

## Cómo operarlo

- Coolify env: `PLATICA_TEMPLATE_CITA_2H=notificacion_cita_2horas_antes`.
- Cron (Adler; clonar el de 15 min):
  - Name: `Recordatorio cita 2 h`
  - Command:
    ```
    curl -X POST http://localhost:3001/citas/enviar-recordatorios-2h -H "X-API-Key: <mismo secret>" -H "Content-Type: application/json"
    ```
  - Frequency: `*/5 * * * *`
  - Timeout: 300 s
- Schema: `node scripts/one-shots/schema-recordatorio-2h-laura-09sep.js --confirmar`
  (una vez, Citas de Laura). Sin esos campos el cron 502.
- Redeploy después del push. El cron no manda nada hasta que existan citas
  reales a 2 h.

## Evidencia

- Plantilla en Plática: `notificacion_cita_2horas_antes`, UTILITY, es, APPROVED.
- `node tests/recordatorio-cita-2h.manual-test.js`
- `node tests/recordatorio-cita-15min.manual-test.js` (regresión del query
  compartido)

## Pendientes

- [ ] One-shot `--confirmar` en Citas de Laura.
- [ ] Env + cron en Coolify + redeploy.
- [ ] No reejecutar el one-shot.
