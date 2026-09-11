# Bitácora 11sep — bloquear Expo y alinear Agente 1
Handoff. Código gana si esto contradice algo.
Fecha del trabajo: 11 sep 2026. Continúa [bitacora-11sep-agente2-meet-expo.md](bitacora-11sep-agente2-meet-expo.md).

## Pedido y decisión

Adler confirmó que la cita efectiva dura 20 minutos y el bloque de 30
minutos es el margen operativo correcto. También decidió bloquear en backend
las reservas de asistentes con boleto Expo y actualizar el Agente 1 con las
reglas vigentes de duración, Expo y Meet virtual.

## Qué cambió

- `reservar_cita` lee el contacto asistente antes del mutex y antes de
  cualquier escritura. `Ticket / Tipo Asistencia = Expo` responde HTTP 400
  `BOLETO_EXPO_NO_PERMITE_CITAS`: Expo solo incluye piso de exhibición, no
  citas 1a1. No crea ni reutiliza una fila, no asigna mesa y no envía correo.
- El Flow legado tiene copy específico para el mismo error.
- La grilla no cambió: reunión efectiva de 20 min dentro de un bloque
  operativo de 30 min.
- Agente 1 orquestador activo: `tPBNfcNVPrFvY4VBKLRU` (18 versiones).
- Subagente de Citas de Agente 1 activo: `9EkiawZbr49rLvTDN6zB` (55
  versiones). Comunica 20 min, usa `fin` de 30 min solo como contrato técnico,
  no reintenta Expo y explica que el `.ics` de Virtual no es la liga de Meet.
- Snapshots actualizados en `prompts-agentes-platica/`.

No se tocaron tools, knowledge ni guardrails de Plática. No se hizo ninguna
reserva ni envío real.

## Operación

Requiere desplegar el backend nuevo en Coolify. El cambio de prompts ya está
activo en Plática. No requiere env nueva ni cambio de schema.

Tras el deploy, una reserva directa, una reserva desde Agente 1/2 o una
reagenda de cancelada para un Expo devuelve:

```json
{
  "error": "BOLETO_EXPO_NO_PERMITE_CITAS",
  "message": "El boleto Expo solo incluye acceso al piso de exhibición y no permite agendar citas 1a1. La cita no se creó."
}
```

## Evidencia

- `node tests/asignacion-mesa.manual-test.js`: Expo rechazado y cero filas
  nuevas; mesas, mutex, reagendas y margen de 5 min siguen pasando.
- `node tests/modificar-cancelar-cita.manual-test.js`: regresión completa
  pasó.
- `node tests/email-notificacion.manual-test.js`: correos y compensación de
  fila pendiente pasaron.
- `node --check` en service, controller y job: sin errores.

## Pendientes

- Commit/push y redeploy de Coolify.
- Después del redeploy, prueba HTTP con un contacto Expo de prueba en Laura;
  debe ser 400 y no crear fila en Citas. No usar un contacto real sin
  autorización.
