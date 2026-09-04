# Bitácora 04sep — follow-up automático 72h
Handoff. Código gana si esto contradice algo.
Trabajo del 4-sep-2026. Sin commit todavía. Continúa [bitacora-04sep-oferta-inicial-representante.md](bitacora-04sep-oferta-inicial-representante.md).

## Pedido y decisión

Adler pidió enviar la plantilla aprobada `followup_72hrs` 72 horas después de la oferta inicial solo cuando el asistente no hubiera respondido. Se decidió usar `message.created` de Plática como señal principal, volver a consultar el historial justo antes del envío y mantener un estado idempotente en Notion.

## Qué cambió

- Webhook público firmado `POST /webhooks/platica/mensajes`. Valida HMAC-SHA256, workspace, canal, evento y `direction=incoming`; solo marca respuestas posteriores a `Fecha Última Campaña`.
- Endpoint autenticado `POST /matchmaking/enviar-followups-72h`, diseñado para cron cada 15 minutos. Las 72 horas son naturales, pero solo envía lun–vie 09:00–18:00 `America/Mexico_City`.
- Antes de enviar consulta todas las conversaciones del cliente en el canal configurado. Una respuesta perdida por webhook se repara en Notion y omite el follow-up.
- Omite asistentes con cita `Confirmada`, `Confirmada sin notificar`, `Pendiente Calendar` o `Completada`.
- Idempotencia: `En curso` antes de Plática; `Enviado` + incremento de `Reactivaciones Enviadas` al éxito; `Falló` al error. Un `En curso` de más de 10 minutos busca primero el follow-up saliente en Plática y lo reconcilia sin duplicar.
- Mutex en memoria para serializar dos ejecuciones simultáneas del cron. Hereda la condición operativa del servicio: una sola réplica.
- No cambió el prompt del agente de Plática ni se tocó la redacción aprobada de la plantilla.

## Schema de Contactos

One-shot preparado: `scripts/one-shots/followup-72h-schema-laura-04sep.js`.

- `Respondió Oferta Inicial` — checkbox.
- `Fecha Respuesta Oferta Inicial` — date.
- `Estado Follow-up 72h` — select: `En curso`, `Enviado`, `Falló`.
- `Fecha Follow-up 72h` — date de inicio/resultado.

**Escrito en Laura el 4-sep** (`--confirmar`): los cuatro existen. Vista `Raw — todos los campos` (`3d162dda-199a-818b-b1df-000cb04490b2`) quedó con 85 columnas visibles, las cuatro de follow-up incluidas. No hay campos nuevos en Citas; no se tocó Default view.

## Configuración y operación

Variables nuevas:

- `PLATICA_WORKSPACE_ID=yay7N6Iejg62P9h0nJaU`
- `PLATICA_WEBHOOK_SECRET`
- `PLATICA_TEMPLATE_FOLLOWUP_72H=followup_72hrs`
- `FOLLOWUP_72H_MODO_SIMULACION=true`
- `FOLLOWUP_72H_ENVIO_REAL_HABILITADO=false`

Usa además `PLATICA_API_KEY`, `PLATICA_CHANNEL_ID`, `API_SECRET_KEY` y los data sources de Notion.

Orden seguro de activación:

1. ~~Ejecutar el one-shot con `--confirmar`~~ — hecho 4-sep.
2. Desplegar el backend con las variables nuevas, manteniendo simulación `true` y envío real `false`.
3. Registrar en Plática el webhook `message.created` hacia `/webhooks/platica/mensajes` con el mismo secret.
4. Verificar una respuesta de prueba y su checkbox/fecha en Notion.
5. Llamar `/matchmaking/enviar-followups-72h` en simulación y revisar nominalmente `detalle`: nombres, teléfonos, fecha de oferta y payload.
6. Solo con aprobación explícita: `FOLLOWUP_72H_MODO_SIMULACION=false` y `FOLLOWUP_72H_ENVIO_REAL_HABILITADO=true`.
7. Crear cron Coolify cada 15 minutos con `X-API-Key`.

No disparar el endpoint real antes de listar a quién le llega. El endpoint no acepta banderas por body: solo el env de Coolify puede abrir el envío.

Al 4-sep Plática reporta **cero webhooks** en Fashion Digital Talks. Hay dos canales WhatsApp conectados (`wb-1167456423128610`, agente default de Citas `c1IYnFsr0Jzfqq4NeLAs`; y `wb-1351140128072472`, agente `4HoKf6mkEekTKA3jXFK3`). El `.env` local no define `PLATICA_CHANNEL_ID`.

**Canal — confirmado por Adler el 4-sep-2026:** `wb-1167456423128610` (Agente 2, `+52 1 33 3236 1963`). No es `wb-1351140128072472` (Marketing) ni el de Clarita (`wb-1241661695688819`). El webhook de respuestas se filtra por ese canal. **No se registró todavía:** el paso 3 pide endpoint ya desplegado; el código aún no está en Coolify.

## Confirmaciones de seguridad (4-sep, prompt de revisión)

1. **HMAC:** ya era `crypto.timingSafeEqual`. Función `verificarFirmaWebhook` en `src/controllers/platica-webhook.controller.js`. Compara los hex después de `sha256=`; si el largo en bytes no coincide, `false` (no tira el proceso).
2. **Flood / body:** tope en memoria **60 req/min por IP** (429) y **100 kb** de body (413), **antes** del HMAC. `app.set('trust proxy', 1)`. **Pendiente en vivo:** confirmar que Coolify pone un solo hop de proxy; si son dos, el rate limit vería IPs internas. No bloquea schema/deploy/simulación.
3. **Canal:** cerrado. Adler confirmó `wb-1167456423128610`.
4. **Plantilla MARKETING:** pendiente de Adler con Sam. **Bloquea el paso 6** (envío real). No es código. Simulación (pasos 1–5) puede seguir sin esa respuesta.

## `responderAgentId` (pedido de Plática, 4-sep)

`POST /v1/messages/template` (oferta, follow-up, recordatorio 15 min) y `POST /v1/messages` (texto de sesión) ahora mandan `responderAgentId` desde `PLATICA_RESPONDER_AGENT_ID`. Valor FDT: `c1IYnFsr0Jzfqq4NeLAs`. Hoy Plática lo ignora; en la próxima release, sin ese campo la conversación queda sin agente y el bot no contesta. Falta cargarlo en Coolify. Si el env está vacío, se envía igual y se loguea un warning.

## Evidencia

- `node tests/platica-respuestas-webhook.manual-test.js` — pasa: firma inválida, outgoing, mensaje previo, incoming posterior y duplicado.
- `node tests/platica-client-conversations.manual-test.js` — pasa: listado por teléfono/canal y carga del historial completo de cada hilo.
- `node tests/followup-72h.manual-test.js` — pasa: 71:59/72:00, horario/fin de semana, polling, cita confirmada, primer nombre, simulación, estados y reconciliación.
- `node tests/campanas-matchmaking.manual-test.js` — pasa completo; no se rompió la oferta inicial.
- `node scripts/one-shots/followup-72h-schema-laura-04sep.js --confirmar` — cuatro campos creados; Raw Contactos con 85 columnas visibles.
- Plantilla consultada en Plática: `followup_72hrs`, workspace `yay7N6Iejg62P9h0nJaU`, `APPROVED`, categoría `MARKETING`, idioma `es`, un parámetro.

No se envió ningún WhatsApp, no se configuró webhook vivo, no se creó cron y no se modificó Coolify.

## Pendientes operativos

- [x] Schema Contactos Laura + columnas en Raw.
- [ ] Deploy con secrets/variables, incluyendo `PLATICA_RESPONDER_AGENT_ID=c1IYnFsr0Jzfqq4NeLAs`.
- [ ] Tras deploy: crear webhook `message.created` filtrado al canal `wb-1167456423128610`.
- [ ] Simulación nominal y aprobación de destinatarios.
- [ ] En vivo: comprobar hops de proxy de Coolify vs `trust proxy: 1`.
- [ ] Adler + Sam: ¿`followup_72hrs` MARKETING cumple políticas de Meta para recontacto a 72h? Bloqueante del envío real.
- [ ] Habilitar envío real y crear cron cada 15 minutos.
