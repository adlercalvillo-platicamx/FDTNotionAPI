# Bitácora 27-ago — Endpoints de modificar y cancelar cita

Pendiente de Adler, previo a "pedir más opciones" (agente de Carlos) y
"cita improvisada" (Laura/Liz): las dos piezas que faltaban del ciclo de
vida de una cita. Dos endpoints separados, como pidió Adler.

## Lo que se verificó ANTES de escribir código

El prompt pedía no asumir cuatro cosas. Esto es lo que resultó:

| Punto a verificar | Resultado real |
|---|---|
| Destinatarios del correo de confirmación hoy | Dos envíos: sponsor (`Email` en Contactos) y asistente (`Email` + `asistentes_email` del body). **Laura/Liz no reciben copia.** Modificar/cancelar replican exactamente esa lista. |
| Dónde vive la `secuencia` del ICS | **No existe campo en `Citas`** y no se agregó. `reintentarNotificacion` ya usaba `Math.floor(Date.now()/1000)`, siempre mayor que el `0` del envío original. Se centralizó en `siguienteSecuenciaIcs()`. |
| Valor exacto del select para "cancelada" | `Cancelada` (confirmado contra el schema real). No está en `ESTATUS_ACTIVOS` ni en los queries de confirmadas → **el bloque se libera solo con el cambio de estatus**, sin trabajo extra, tal como sospechaba el prompt. |
| `Check-in Realizado` | Existe como checkbox y hasta hoy nadie lo leía desde el backend. Se lee en `datosDeCita()`. Bonus del mismo schema: `Reprogramada` (checkbox) y `Reprogramada Horario Original` (date) ya existían y se aprovecharon. |

Un hueco del `SEQUENCE` por timestamp que sí hubo que tapar: dos cambios
de la misma cita dentro del mismo segundo (modificar y cancelar seguidos,
muy posible con un agente automatizado) daban el mismo número y el cliente
de calendario habría ignorado el segundo. `siguienteSecuenciaIcs()` fuerza
el incremento. Vive en memoria del proceso, igual que el mutex — este
servicio corre en 1 réplica.

## Lo que el prompt no cubría: Google Calendar

La reserva crea un evento real en el calendario del sponsor, pero
`calendar-client.service.js` solo tiene `createEvent` y `cancelEvent`, y
la bitácora del 14-ago documenta que `POST /calendar/cancelar-evento`
respondió **404 Endpoint no encontrado** en `platica-google-docs-api`
(deuda pendiente con Ernesto).

Decisión de Adler (27-ago): **Notion + el `.ics` del correo son la
verdad**. Cancelar intenta borrar el evento y tolera el fallo; modificar
no toca Calendar. Ambas respuestas traen `nota_calendario` (la advertencia
para el mensaje de WhatsApp, texto a afinar con Sam) y `advertencias` con
el estado real del calendario del sponsor. No se finge que quedó al día.

Descartado a propósito: modificar como `cancelEvent` + `createEvent`.
Mientras `cancelar-evento` siga en 404, eso dejaría al sponsor con el
evento viejo **y** el nuevo.

## Identificación y seguridad

Los dos endpoints aceptan `telefono` (agente de Carlos) o `citaId`
(Laura/Liz, acceso administrativo). La validación de pertenencia es del
servidor, nunca se confía en el agente:

- `telefono` + `citaId` de otra persona → **403 `CITA_NO_PERTENECE`**.
- `telefono` solo: si hay una sola cita real se resuelve sin llamada
  extra; si hay varias → **409 `VARIAS_CITAS_ACTIVAS`** con la lista
  (`citaId`, sponsor, horario) para que el agente elija. `sponsorEmpresa`
  desambigua "la de Platica" sin ese ida y vuelta (decisión de Adler
  sobre la pregunta abierta del prompt: se prefirió el atajo al flujo
  obligatorio de dos pasos).
- `citaId` solo → sin validación cruzada.

## Reglas de tiempo (dos, independientes)

1. El horario **destino** no puede estar más de
   `CITAS_MARGEN_MODIFICACION_MINUTOS` (5, configurable) en el pasado. A
   las 11:06 no se puede mover una cita a las 11:00; a las 11:04 sí. Hace
   falta explícito porque un bloque que ya pasó aparece "libre" en
   disponibilidad.
2. La cita **original** ya pasada sí es modificable si `Check-in
   Realizado` está en falso (recuperar una cita que no se aprovechó). Con
   check-in marcado → **409 `CITA_YA_OCURRIO`**.

No hay ventana mínima de anticipación sobre la cita original: se puede
modificar o cancelar 5 minutos antes sin problema.

## Estado para reintento de correo

- **Modificar**: mismo patrón que una reserva nueva → `Confirmada sin
  notificar`. El horario nuevo **no se revierte**. No hizo falta campo
  extra: el reenvío lee `Fecha y Hora` de Notion, que ya trae el horario
  nuevo, así que el correo de reintento avisa del cambio correcto.
- **Cancelar**: `Confirmada sin notificar` habría sido un bug —ese estatus
  vuelve a ocupar mesa y sponsor—. La fila se queda en `Cancelada` y el
  pendiente se marca con `[CANCELACION_PENDIENTE]` al inicio de `Notas
  Envio Email`. `POST /citas/reintentar-notificaciones-pendientes` ahora
  barre los dos casos y `reintentarNotificacion` decide por el estatus si
  manda el `.ics` de alta o el de baja.

## Pruebas

`node tests/modificar-cancelar-cita.manual-test.js` — 29 casos, todos en
verde. Notion, Contactos y Calendar son mocks en memoria; el correo NO: se
usa el `email.service` real con un transporter falso, para afirmar sobre
el `.ics` de verdad (UID estable, `SEQUENCE` creciente, `STATUS`,
`METHOD:CANCEL`, `DTSTART` del horario nuevo).

Cubre todos los casos que pedía el prompt más: grilla inválida, Calendar
en 404, cancelar dos veces (idempotente), estatus no tocables
(`Sugerido`), `citaId` inexistente, y que dos modificaciones seguidas
generen `SEQUENCE` estrictamente creciente.

Regresión: el resto de la suite manual sigue en verde.

## Encontrado de paso, NO tocado

`tests/guardar-sugerencia-individual.manual-test.js` falla desde antes de
esta sesión: sus dos candidatos de prueba no tienen `Tamaño de Negocio` ni
`Madurez Negocio (Exa)`, así que el filtro duro de tamaño del 26-ago
(`esCandidatoPorTamanoNegocio`, pedido por Laura el 25-ago) los deja
fuera. Es fixture viejo, no una regresión de negocio — se reporta en vez
de "arreglar" el test para que pase.

## Pendiente

- Texto final de `nota_calendario` con Sam.
- `actualizar-evento` en `platica-google-docs-api` con Ernesto. Cuando
  exista, modificar puede dejar el calendario del sponsor al día y se cae
  la advertencia `ADVERTENCIA_CALENDAR_SIN_ACTUALIZAR`.
