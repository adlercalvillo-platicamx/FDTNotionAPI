# Bitácora 07oct — WhatsApp sponsor al agendar/modificar/cancelar

Handoff. Código gana si esto contradice algo.  
Fecha del trabajo: 7 oct 2026. Plantillas Meta aprobadas; env Coolify ya cargadas por Adler.

## Pedido

Avisar al **sponsor** por WhatsApp (solo él) cuando se confirma, modifica o cancela una cita real, con copy “no respondas” y línea **Modalidad** (Presencial vs Virtual según boleto del asistente).

## Qué cambió

- Nuevo `src/services/notificacion-sponsor-whatsapp.service.js`: arma parámetros y llama `enviarPlantilla` con `skipHidratar` (el teléfono del sponsor no es asistente).
- `booking.service.js`: tras cita confirmada en Notion, envía plantilla en reserva, modificación y cancelación (aunque falle el correo o no haya email). Respuesta HTTP puede incluir `whatsapp_sponsor: { enviado | omitido | error }`.
- `resolverNotificacionCita` expone `whatsappSponsor` y `ticketTipoAsistente`.
- Flow legado: ya no manda WhatsApp al sponsor (evita duplicado con `reservarCita`).
- Env: `PLATICA_TEMPLATE_SPONSOR_CITA_AGENDADA|MODIFICADA|CANCELADA` en `.env.example`.

## Operación

- Coolify: las tres env con nombres `notificacion_sponsor_cita_*` (ya configuradas).
- **Redeploy** del backend Node con este commit.
- Prueba: una reserva real hacia un sponsor de prueba con `WhatsApp` en Notion producción; revisar log `[NotifSponsorWA]` si falla.
- Sin WhatsApp en Contactos → `omitido: SIN_WHATSAPP_SPONSOR`. Env vacía → `SIN_PLANTILLA`.
- `POST …/reenviar-notificacion` **no** reenvía WhatsApp sponsor (solo correo/.ics).

## Evidencia / test local

`node tests/notificacion-sponsor-whatsapp.manual-test.js`

## Pendientes

- Prueba en vivo post-deploy con número de prueba nombrado.
- Si el sponsor contesta, sigue entrando al Agente 2 (`PLATICA_RESPONDER_AGENT_ID`); mitigación futura: agente distinto o reglas Plática.
