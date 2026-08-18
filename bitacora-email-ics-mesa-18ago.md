# Bitácora — mesa automática + correo/ICS (17–18 ago 2026)

Reporte de handoff para otro agente (Claude / Cursor). Alcance: FDTNotionAPI, repo `adlercalvillo-platicamx/FDTNotionAPI`, rama `main`.

**Estado actual de `origin/main`:** `67b9391`  
**Deploy:** Coolify (`https://f8wwwgc0g88wccscww4cccco.appsplatica.site`). Adler redeploya a mano.

---

## 1. Qué se entregó (orden cronológico)

### A. Asignación automática de mesa (`42411e6`)
- Al confirmar una reserva, se escribe `Mesa / Ubicacion` = `"Mesa N"` donde `N = contarCitasEnBloque(inicio) + 1`.
- Capacidad máxima: **11 mesas por bloque de 30 min** (`CAPACIDAD_MAXIMA_MESAS`). La 12ª reserva responde HTTP 409 `CAPACIDAD_MESAS_LLENA` y **no** crea fila en Notion.
- El mutex en memoria de `booking.service.js` es lo que hace segura la numeración. **1 sola réplica en Coolify** — no quitar el mutex.
- Cancelar una mesa no “libera el hueco” para reusar el número: la siguiente reserva toma `conteoActual + 1`.

Archivos clave:
- `src/services/citas.service.js` — `crearCitaPendiente` acepta `mesa`
- `src/services/booking.service.js` — calcula `numeroMesa` y lo pasa

### B. Correo de confirmación + ICS + reenvío a demanda (`fda53bd` … 18-ago noche)
- `email.service.js`: `.ics` (UID = notionPageId) + SMTP.
- Si falla el correo tras Calendar+Notion OK → **`Confirmada sin notificar`** (cita no se revierte) + motivo en `Notas Envio Email`.
- **Al reservar:** hasta **3 intentos SMTP inmediatos** por correo (timeouts).
- **Reenvío a demanda (NO cron, SIN tope):** `POST /citas/:id/reenviar-notificacion`, `POST /citas/reintentar-notificaciones-pendientes`, tool MCP `reintentar_notificaciones_pendientes`. Si falla → respuesta con categoria + mensaje.
- Ya no hay `EMAIL_MAX_INTENTOS` ni `LIMITE_INTENTOS_ALCANZADO` en el flujo activo.
- Env SMTP: `EMAIL_SMTP_HOST/PORT/USER/APP_PASSWORD`, `EMAIL_FROM_NAME`.

### C. Dos correos distintos (`a7f68c9`)
Antes: **un solo correo** con sponsor + asistente en el mismo `To:` (mismo texto con datos del asistente).

Ahora:
| Destinatario | Contenido |
|---|---|
| **Sponsor** (`email` de Contactos del sponsor) | Texto cálido + **datos de contacto del asistente** (nombre, empresa, puesto, correo, teléfono) + `.ics` |
| **Asistente** (`email` de Contactos del asistente) | Aviso corto + **empresa del sponsor** + `.ics`. **Sin** datos de contacto del sponsor |

Implementación: `resolverNotificacionCita()` + `enviarCorreosConfirmacion()` en `booking.service.js`. Dos llamadas a `enviarConfirmacionCita`. Calendar sigue usando la descripción del sponsor (datos del asistente).

`emailsExtra` / `asistentes_email` del body se suman al correo del **asistente** (tono corto), no al del sponsor.

### D. Apertura por empresa, no por persona (`67b9391`)
- Sponsor: `{empresaAsistente} agendó un espacio con {empresaSponsor}.`
- Asistente: `Agendaste un espacio con {empresaSponsor}.`
- Fuente: campo Notion `Empresa`. Si vacío → fallback al `Nombre` de la persona.
- Los datos de contacto debajo (solo en correo del sponsor) no cambian.

Ejemplo verificado en producción (18-ago):
- Sponsor: `BRAVO ADVANCE agendó un espacio con Blip.`
- Asistente: `Agendaste un espacio con Blip.`
- Abajo (solo sponsor): Nombre / Empresa / Puesto / Correo / Teléfono del asistente.

---

## 2. Commits relevantes (más reciente primero)

| Commit | Qué |
|---|---|
| `67b9391` | Apertura del correo con nombre de empresa |
| `a7f68c9` | Separación correo sponsor vs asistente |
| `f7a3e75` | Personalización del mensaje (tono cálido + instrucciones ICS) |
| `fda53bd` | Correo + ICS + reintentos + estado `Confirmada sin notificar` |
| `42411e6` | Mesa automática |

---

## 3. Incidente — correos enviados a contacto externo (importante)

**Qué pasó:** La prueba E2E `scripts/one-shots/prueba-email-ics-real.js` (18-ago ~09:24 CST) usó como asistente a **MIRANDA AYALA (BASTIAAN)** con correo real `comunidad@slesgroup.com`. En esa versión aún se mandaba **un solo correo a sponsor + asistente juntos**, así que ella recibió **5 correos** de prueba (`TEST EMAIL ICS` caso9a×2, caso10-ok×2, caso10-limite×1) con `.ics` del 7 de octubre.

**Qué NO pasó:**
- La prueba de 11 mesas (17-ago) **no** envió correos (esa versión aún no tenía el paso SMTP desplegado, o las citas quedaron Confirmada sin pasar por email según el momento del deploy).
- Las pruebas posteriores del 18-ago (tras cambiar correos a buzones de Adler) solo tocaron `adler.calvillo@platica.mx`, `0257691@up.edu.mx`, `adlerero666@gmail.com`.

**Mitigación hecha:**
- Texto de disculpa redactado para Miranda (Adler lo envía).
- Pendiente opcional: cancelaciones ICS (`METHOD:CANCEL`, mismo UID) para borrar los eventos del 7-oct de su calendario.
- Pendiente: dejar regla escrita en `.cursor/rules/architecture.mdc` — **ninguna prueba con envío real de correo puede usar contactos con correo externo**; verificar destinatarios **antes** de disparar `POST /citas/reservar`.

Miranda tiene **dos** page_ids duplicados en Contactos con el mismo email original:
- `3bb90fe2-7345-8140-89c8-f169f1948ff4` (el usado en la prueba)
- `3bf90fe2-7345-8108-8d30-d5b8c2d330cd`

---

## 4. Estado actual de Notion (pruebas)

Adler cambió **todos** los emails de sponsors y asistentes a sus correos personales de prueba:
- `adlerero666@gmail.com`
- `adler.calvillo@platica.mx`
- `0257691@up.edu.mx`

Hay backups en el repo (no commitados necesariamente):
- `tests/_emails-pruebas-backup-1787091414316.json`
- `tests/_sponsor-emails-backup-1787002087795.json`

**Hay que restaurar los correos reales** cuando terminen las pruebas. Miranda hoy tiene un correo de prueba de Adler, no `comunidad@slesgroup.com`.

Citas de prueba del 18-ago dejadas en Notion/Calendar (varias `TEST …`); conviene archivarlas y cancelar eventos cuando se cierre el ciclo.

---

## 5. Arquitectura que no se negocia (recordatorio)

Ver `.cursor/rules/architecture.mdc` y `README.md`:
- Mutex de `booking.service.js` → **1 réplica** Coolify.
- **Nunca** duplicar `google.service.js` aquí; Calendar vía `calendar-client.service.js` → `platica-google-docs-api`.
- Notion por REST directo (`notion-client.js`), no MCP para escrituras determinísticas.
- Bronce no participa en citas 1a1.
- Prioridad sponsor: Cristal > Diamante > Oro.
- `topN` = `Citas Minimas Prometidas` + `MARGEN_CANDIDATOS`.
- “Principal” no es un nivel de patrocinio.

---

## 6. Flujo actual de notificación (resumen técnico)

```
reservarCita (dentro del mutex)
  → crearCitaPendiente (Pendiente Calendar, con Mesa N)
  → resolverNotificacionCita (emails + 2 textos desde Contactos)
  → calendarClient.createEvent (descripcion = texto sponsor)
  → confirmarCita (Confirmada)
  → enviarCorreosConfirmacion
       → email sponsor (texto largo + datos asistente + ICS)
       → email asistente (texto corto + empresa sponsor + ICS)
  → si falla cualquiera: marcarCitaConfirmadaSinNotificar
```

Reintento contado: `reintentarNotificacion` / endpoint batch MCP → misma separación de textos, hasta 3 SMTP inmediatos por correo, `SEQUENCE = intentosPrevios + 1`. Éxito → `confirmarNotificacionEnviada` (resetea intentos a 0). Fallo → Intentos +1.

---

## 7. Tests

- `tests/email-notificacion.manual-test.js` — mocks, cubre 2 correos, fallos SMTP, reintentos, SIN_DESTINATARIOS, CONTACTO_NO_RESUELTO, apertura por empresa.
- `tests/asignacion-mesa.manual-test.js` — mesas + capacidad + mutex.
- Scripts one-shot (no re-correr a ciegas): `scripts/one-shots/prueba-email-ics-real.js`, `prueba-limite-11-mesas.js`.

Correr local:
```bash
node tests/email-notificacion.manual-test.js
node tests/asignacion-mesa.manual-test.js
```

---

## 8. Pendientes abiertos (Adler / siguiente agente)

1. **Restaurar emails reales** de sponsors y asistentes en Notion (usar backups).
2. **Disculpa a Miranda** — texto ya redactado; envío manual de Adler.
3. **Opcional:** cancelaciones ICS de las 3 citas TEST EMAIL ICS que le llegaron.
4. **Regla en** `.cursor/rules/architecture.mdc` — guardrail de pruebas SMTP (destinatarios solo correos de prueba, verificar antes de disparar).
5. **Limpiar** citas/eventos de prueba del 18-ago en Notion + Calendar.
6. Confirmar con Adler que el agente MCP ya ve la tool `reintentar_notificaciones_pendientes` tras redeploy (no hay cron de Coolify — es a demanda).

---

## 9. Archivos tocados (núcleo)

```
src/services/booking.service.js   # orquestación, textos, 2 envíos
src/services/email.service.js     # ICS + Nodemailer
src/services/citas.service.js     # mesa, estados notificación, queries
src/controllers/citas.controller.js
src/routes/citas.routes.js
src/jobs/reintentar-notificaciones.job.js
package.json                      # nodemailer, ics
.env.example                      # vars EMAIL_*
tests/email-notificacion.manual-test.js
tests/asignacion-mesa.manual-test.js
```

---

## 10. Regla operativa para el siguiente agente

Antes de cualquier `POST /citas/reservar` contra Coolify/producción:
1. Resolver `obtenerContacto` de sponsor y asistente.
2. Verificar que **todos** los emails resultantes estén en la allowlist de prueba acordada con Adler.
3. Si aparece cualquier correo externo → **ABORTAR**, no enviar.
4. Preferir pares sponsor × **Asistente** (Categoría = Asistente), nunca sponsor × sponsor para demos realistas.
5. No hacer commit/push a `main` ni mutar Contactos/emails sin autorización explícita de Adler.
