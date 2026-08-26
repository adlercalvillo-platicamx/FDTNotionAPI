# Bitácora — horarios del sponsor top + recordatorio del evento (26-ago-2026)

Sigue de `bitacora-26ago-rediseno-plantillas-laura.md`. Prompt:
`prompt-cursor-correccion-horarios-y-recordatorio`.

## 1. Horarios: ya no hay cruce entre sponsors

Los 3 horarios del mensaje salen **solo del sponsor de mayor score**. Los otros
(hasta 3) se siguen nombrando con su solución; su agenda se resuelve en
conversación si el asistente pide uno de ellos.

Se eliminó `bloquesDisponiblesParaTodosLosSponsors`. Queda
`bloquesDisponiblesParaSponsor` sobre el mismo índice de Confirmada /
Confirmada sin notificar (ocupación propia + 11 mesas).

### Pendiente Adler (no asumido)

Si el sponsor top no tiene ningún bloque y los demás sí: **hoy no se manda
nada** (`SIN_HORARIOS_SPONSOR_TOP`) y **no se recae** al siguiente por score.
Es distinto del caso “un solo sponsor sin bloques”, que ya estaba confirmado
como raro. Hay que decidir explícitamente si ese fallback existe.

## 2. Recordatorio-reactivación del evento

- Endpoint: `POST /matchmaking/enviar-recordatorio-evento` (`X-API-Key`).
- Sin cron y **sin tool MCP**.
- `DIAS_ANTES_RECORDATORIO_EVENTO = 14` es referencia de producto, no scheduler.
- Plantilla: `PLATICA_TEMPLATE_RECORDATORIO_EVENTO` / placeholder
  `PENDIENTE_PLANTILLA_RECORDATORIO_EVENTO`.
- Señal “ya interactuó” (propuesta de Adler): alguna fila en `Confirmada`,
  `Confirmada sin notificar`, `Pendiente Calendar` o `Completada`.
  - Sí interactuó → no WhatsApp; en envío real se marca
    `Recordatorio Evento Enviado` para no reevaluarlo.
  - No interactuó (`Sugerido` / `Aprobado` / `Rechazado`) → se manda el
    único mensaje de reactivación.
- Sin filas en `Citas` → fuera (nunca se le ofreció nada).
- Simulación: no escribe el checkbox ni llama a Plática, tampoco para
  quienes ya interactuaron.

### Schema Notion

Checkbox `Recordatorio Evento Enviado` aplicado **solo** en Contactos del
workspace de pruebas de Adler (`9f335308-da0e-4672-9744-c1dabcfb22aa`).
No se tocó el workspace de producción de Laura (`3b162dda…`).

### Caso que no encaja del todo

El prompt lista elegibles sin `Rechazado`, pero “nunca interactuó” sí lo
incluye. El código trata `Rechazado` como elegible y como no-interacción,
para no dejar fuera a quien solo tiene filas rechazadas. `Completada` se
consulta aunque puede no existir aún en el select de Citas.

## Verificación local

- `node tests/campanas-matchmaking.manual-test.js`
- `node tests/horarios-oferta.manual-test.js`
- `node tests/recordatorio-evento.manual-test.js`
- `node tests/marcar-cola-sin-enviar.manual-test.js`

No se enviaron WhatsApps reales. El único cambio de schema Notion fue el
checkbox en el workspace de pruebas.
