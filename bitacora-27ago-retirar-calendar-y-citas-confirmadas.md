# Bitácora 27-ago — Retiro de Google Calendar propio + citas confirmadas en sugerencias-asistente

Dos prompts del mismo día. El de Calendar cierra la deuda que dejó
`bitacora-27ago-modificar-cancelar-cita.md`; el de sugerencias le da al
agente de Carlos el panorama completo de un asistente en una sola llamada.

## 1. Google Calendar propio, fuera

Adler confirmó que nadie del equipo consulta los 8 calendarios de Google:
Notion ya es adonde van, y el `.ics` por correo es lo que ve el sponsor
en su calendario personal. La sync con `platica-google-docs-api` estaba
rota (`cancelar-evento` 404, no existe `actualizar-evento`).

**Quién lo usaba (búsqueda en el repo, no se asumió):** solo
`booking.service.js` — `createEvent` al reservar, `cancelEvent` en el
rollback si Notion no confirmaba, y `cancelEvent` best-effort al
cancelar una cita. Nada más importaba `calendar-client.service.js`.

**Qué se quitó**
- El archivo `src/services/calendar-client.service.js`.
- Las llamadas a Calendar en `reservarCita` / `cancelarCita`. El flujo
  de reserva quedó: mutex → Notion (Pendiente) → confirmar Notion →
  correo/.ics. Sin rollback hacia un evento que ya no se crea.
- `nota_calendario` y `advertencias` de las respuestas HTTP de
  modificar/cancelar. Esa advertencia era del Calendar propio. La nota
  de “si tu calendario no se actualiza solo” **sigue en el cuerpo del
  correo** (los clientes de Gmail/Outlook/Apple y el `.ics` no se
  tocan).
- `GOOGLE_API_*` de `.env.example` (comentadas, legado). El código ya
  no las lee. Se pueden borrar de Coolify cuando limpien el entorno.

**Qué se dejó a propósito**
- Campos de Notion `Google Event ID` (Citas) y `Calendario Google ID`
  (Contactos): históricos, el código nuevo no los escribe ni los exige.
- `sponsor_calendario_id` en el body de `POST /citas/reservar`: se
  ignora si llega, para no romper el Flow / la API tool de Plática.
- El nombre de Estatus `Pendiente Calendar`: es un valor del select de
  Notion, no se renombra sin pedido explícito.
- El `.ics` (`email.service.js`) — única forma en que sponsor/asistente
  reciben el evento.

El Flow ya no filtra sponsors sin `Calendario Google ID` ni exige ese
campo para encolar la reserva.

## 2. `citasConfirmadas` en GET `/matchmaking/sugerencias-asistente`

Sin endpoint nuevo. El array `sugerencias` sigue siendo solo `Aprobado`,
mismo schema. Se agregó `citasConfirmadas` con las filas `Confirmada` /
`Confirmada sin notificar` del mismo asistente, ordenadas por
`fechaHora` ascendente:

```json
{
  "sponsorNombre": "...",
  "fechaHora": "2026-10-07T12:00:00-06:00",
  "mesa": "Mesa 3",
  "citaId": "...",
  "checkInRealizado": false
}
```

`Cancelada`, `Sugerido` y `Rechazado` no entran. Lista vacía si no hay
ninguna — no es error. Reusa `listarCitasRealesPorAsistente` (el mismo
criterio que modificar/cancelar).

## Tests

- `modificar-cancelar-cita.manual-test.js`: se cayó el caso “Calendar
  404” (ya no hay intento que falle). El resto sigue.
- `email-notificacion.manual-test.js` y `asignacion-mesa.manual-test.js`:
  sin mock de Calendar; misma aserción de Notion + correo.
- `sugerencias-asistente.manual-test.js`: los casos viejos siguen
  pasando (`sugerencias` igual) y se agregaron: 2 Aprobado + 1
  Confirmada sin mezclarse, vacío → `[]`, Confirmada + Confirmada sin
  notificar juntas, orden cronológico de 3+ citas.

## Pendiente

- Borrar `GOOGLE_API_*` de Coolify cuando limpien variables muertas.
- Los 8 calendarios en la cuenta de Google de Adler son limpieza de
  cuenta personal, fuera de este repo.
