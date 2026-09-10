# Bitácora 10sep — Meet virtual 15 min (rp@fashiondigitaltalks.com)

Handoff. Código gana si esto contradice algo.
Fecha del trabajo: 10 sep 2026. Continúa [bitacora-07sep-recordatorio-15min-cron.md].

## Pedido y decisión

Luis + Adler: las 1a1 Virtual necesitan Google Meet. Organizador
`rp@fashiondigitaltalks.com`. Se dispara en el **cron de 15 min**, no al
reservar y no por el Agente 2. Ambos (asistente y sponsor) reciben
invitación; el equipo FDT no entra a la llamada. La plantilla aprobada
`recordatorio_15min_antes_virtual` incluye el link de Meet en `{{3}}`;
Google también manda la invitación por correo.

Adler aprobó Calendar **solo** para esta excepción. No se restaura
`calendar-client.service.js` ni `googleapis`. La App Password de Gmail
sigue siendo SMTP; Calendar usa OAuth del Apps Script.

Si Meet falla o Calendar no devuelve URL: **no** se manda la plantilla virtual.
Máximo 3 intentos, luego `Omitido` terminal.

## Qué cambió y por qué

- `apps-script/meet-citas-virtuales/`: Web App idempotente (`eventId` =
  UUID de Notion sin guiones, `sendUpdates: all`, conflicto → evento
  existente).
- `src/services/google-meet-virtual.service.js`: HTTP al script. Flag
  `MEET_VIRTUAL_HABILITADO` (solo el string `true`).
- Cron 15 min: si flag on y `Ticket / Tipo Asistencia = Virtual` en
  Contactos, crea/reusa Meet y luego manda la plantilla virtual. Flag
  off = camino presencial para todos (Virtual no recibe un copy de Meet
  que no existe).
- Citas: campos nuevos `Google Meet Event ID` / URL / intentos / notas.
  No se reusa el `Google Event ID` histórico del Calendar retirado.
- Schema Citas Laura: `scripts/one-shots/schema-meet-virtual-laura-10sep.js --confirmar`
  corrido 10-sep tras ok de Adler. PATCH ok: Google Meet Event ID / URL /
  Intentos / Notas. No reejecutar.

## Cómo operarlo

Orden: 1) desplegar Apps Script como `rp@…` 2) crear campos en Citas
Laura 3) backend con flag **false** 4) aprobar plantilla Meta 5) prueba
con asistentes **nombrados** 6) `MEET_VIRTUAL_HABILITADO=true`.

Coolify:

- `MEET_VIRTUAL_HABILITADO=false`
- `MEET_VIRTUAL_APPS_SCRIPT_URL=` (URL `/exec`)
- `MEET_VIRTUAL_SECRET=` (mismo valor en Script Properties)
- `PLATICA_TEMPLATE_CITA_15MIN_VIRTUAL=recordatorio_15min_antes_virtual`

No reejecutar el one-shot de schema sin revisar. No encender el flag
hasta que el script y los campos existan.

## Evidencia

- Ticket Virtual vive en Contactos (`Ticket / Tipo Asistencia`), no en
  Citas. Join por `Contacto Principal`.
- Plantilla real en Plática: `recordatorio_15min_antes_virtual` APPROVED con
  `{{3}}` = link Meet. El cron manda nombre, empresa y URL.

## Pendientes

- Apps Script en `rp@fashiondigitaltalks.com`: **Luis ya lo desplegó** (10-sep).
- Schema Citas Laura: **hecho** 10-sep (`--confirmar`, PATCH ok).
- Pedido a Adler: [para-adler-meet-virtual-aprobacion.md](para-adler-meet-virtual-aprobacion.md).
- No encender `MEET_VIRTUAL_HABILITADO` hasta envs en Coolify + prueba nombrada.
