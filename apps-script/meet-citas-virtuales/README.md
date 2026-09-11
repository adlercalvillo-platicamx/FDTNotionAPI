# Meet para citas virtuales (Apps Script)

Adaptador tonto: recibe una cita, crea **un** evento en el Calendar de
`rp@fashiondigitaltalks.com` con Google Meet e invita asistente + sponsor.
Notion sigue siendo la fuente de verdad. Este script no cancela ni mueve.

## Despliegue (cuenta `rp@fashiondigitaltalks.com`)

1. [script.google.com](https://script.google.com) → proyecto nuevo, pegar `Code.gs`.
2. Servicios → agregar **Google Calendar API** (servicio avanzado).
3. Project Settings → Script properties:
   - `MEET_VIRTUAL_SECRET` = el mismo valor que `MEET_VIRTUAL_SECRET` en Coolify.
4. Deploy → New deployment → Type **Web app**:
   - Execute as: **Me** (`rp@fashiondigitaltalks.com`)
   - Who has access: **Anyone** (el secret autentica; Apps Script no lee bien headers custom)
5. Copiar la URL `/exec` a Coolify: `MEET_VIRTUAL_APPS_SCRIPT_URL`.

No uses la App Password de Gmail aquí. Esa es SMTP. Calendar pide OAuth de la cuenta al autorizar el script.

## Contrato

POST JSON:

```json
{
  "secret": "…",
  "citaId": "clave-hex-de-fila-y-horario",
  "inicio": "2026-10-07T12:30:00-06:00",
  "fin": "2026-10-07T13:00:00-06:00",
  "titulo": "Cita 1a1 virtual — Empresa A - Empresa B",
  "asistente": { "nombre": "Ana", "empresa": "Marca", "email": "ana@…" },
  "sponsor": { "nombre": "Marco", "empresa": "Plática.mx", "email": "marco@…" }
}
```

Respuesta ok:

```json
{
  "ok": true,
  "eventId": "3d162dda199a812f9265ef6b3a1ee913",
  "meetUrl": "https://meet.google.com/…",
  "htmlLink": "https://calendar.google.com/…",
  "existing": false
}
```

`citaId` ya llega como una clave hexadecimal de 32 caracteres calculada por
el backend con la fila de Notion + hora de inicio. Si el evento ya existe,
`existing: true` y se reutiliza el mismo Meet. Al reagendar, la clave cambia:
el cron crea otra sala y no reutiliza la del horario anterior.
