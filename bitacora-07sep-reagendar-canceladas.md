# Bitácora 07sep — reagendar citas canceladas sin revivirlas
Handoff. Código gana si esto contradice algo.
7 de septiembre de 2026. Continúa [bitacora-07sep-canceladas-y-mesas-libres.md].

## Pedido y decisión

Adler pidió que asistentes y Laura/Liz puedan reagendar una cita cancelada.
La cancelada se conserva como historial y la re-agenda crea otra fila con
mesa, horario y `.ics` propios.

Después precisó que una cancelada no puede reutilizarse para crear dos citas.
La protección quedó en dos niveles: el origen se consume una sola vez y el
mismo par asistente–sponsor no puede tener dos citas activas aunque alguien
omita el campo de origen.

## Qué cambió

- Citas tiene la relación `Cita Origen Cancelada`.
- `POST /citas/reservar` acepta `cita_origen_cancelada_id`; dentro del mutex
  valida que exista, esté `Cancelada`, corresponda al mismo par y no se haya
  usado antes.
- Idempotencia de re-agenda:
  `wa:reagenda:<citaIdCancelada>:<inicio>`. No se reutiliza el request id de
  la cancelada.
- `consultar_sugeridas_para_asistente` devuelve `citasCanceladas` y
  `canceladas_para_ofrecer` (máximo 3). Si una cancelada ya originó otra cita,
  deja de aparecer; si la hija se cancela, la hija puede reagendarse, pero no
  vuelve a habilitarse el origen anterior.
- Error de reutilización: `CITA_CANCELADA_YA_REAGENDADA`. Duplicado activo
  del mismo par: `CITA_PARA_YA_ACTIVA`.
- La API tool `api_reservar_cita` quedó en versión 8 con el campo opcional de
  origen. El subagente de Laura/Liz recibió
  `consultar_disponibilidad_cita`.

## Agentes vivos

- Agente 2 asistentes: prompt `DZ6rKadZGLtSrTDElCY3`.
- Orquestador Laura/Liz: prompt `8i7SgeHWOHZahXZLRIIG`.
- Subagente Citas Laura/Liz: prompt `vCLD77cn5QqYLoxdyNrv`.

Los tres exigen confirmación explícita del sponsor, día y hora. Sus snapshots
completos quedaron actualizados en `prompts-agentes-platica/`.

## Evidencia

- Notion producción Citas:
  `3b162dda-199a-8053-8098-000b00916893`.
- La cancelada existente `3d162dda-199a-8124-a828-fd1d957ede2b` se lee como
  `Cancelada`, Carlos Gil × Reevolution, 7-oct 10:30, Mesa 3, sin hija.
- Pruebas manuales pasan: asignación/re-agenda, modificar/cancelar, correo,
  controller y MCP.
- No se creó, modificó ni reactivó una cita real. No se enviaron correos,
  WhatsApp ni campañas.

## Recordatorio de 15 minutos — resuelto el mismo día

Se aplazó primero (Adler quería consultarlo con Luis, que escribió esa parte) y
se implementó horas después con su ok: el aviso pasó de programado en Plática a
un cron que lee Notion. Cierra el pendiente de que un mensaje programado
sobreviviera a una cancelación o re-agenda. Ver
[bitacora-07sep-recordatorio-15min-cron.md].

Los tres campos que quedaron sueltos en el schema durante la planeación
(`Estado Recordatorio 15min`, `Fecha Recordatorio 15min`,
`Notas Recordatorio 15min`) ya tienen código detrás.
