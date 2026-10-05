# Bitácora 05oct — recordatorio de 24 h, solo el día siguiente
Handoff. Código gana si esto contradice algo.
5 oct 2026. Rama `feat/recordatorio-24h-por-dia`, desde `origin/main` `7a4e30f`. Continúa [bitacora-05oct-recordatorio-cita-24h.md](bitacora-05oct-recordatorio-cita-24h.md).

## Pedido

Luis: el mensaje no debe juntar el 7 y el 8. Cada envío lleva solo las reuniones del día que entra en la ventana. Quien tiene los dos días recibe dos WhatsApp. Quien solo tiene el 7, solo el del 6.

## Qué cambió

`POST /citas/enviar-recordatorios-24h` arma un lote por asistente y por día. Manda cuando la primera cita de ese día entra en las próximas 24 h, e incluye las demás de ese mismo día aunque sean más tarde. El otro día no entra en `{{2}}`.

El día enviado se anota en `Notas Recordatorio 24h` (`2026-10-07`). `Enviado` ya no bloquea el día siguiente. `Omitido` sigue siendo terminal. Un `Falló` no borra los días ya anotados.

## Cómo operarlo

Mismo cron y misma plantilla. No hace falta campo nuevo. Hay que desplegar esta rama antes del 6: lo que está en `main` todavía junta los dos días.

Prueba: `node tests/recordatorio-cita-24h.manual-test.js`.

## Pendiente

- PR y deploy antes de que corra el cron del 6.
- El agente, al "sí" de cada mensaje, llama `api_actualizar_recordatorio` con el día de ese mensaje. Un mensaje del 7 no marca el 8.
