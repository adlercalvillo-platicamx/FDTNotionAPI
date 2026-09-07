# Bitácora 07sep — perfil de Plática hidratado desde Notion
Handoff. Código gana si esto contradice algo.
7 de septiembre de 2026. Sin commit. Continúa
[bitacora-03sep-cola-laura-cupo-asistente.md].

## Pedido y decisión

Adler pidió alinear los campos personalizados de Plática con lo acordado
en el standup del 4-sep, hidratarlos al mandar una plantilla o cuando un
contacto escriba sin plantilla previa, y mantener sus citas agendadas al
reservar, modificar o cancelar.

Se decidió que Notion de Laura es la fuente de verdad. Las citas se
presentan como una lista de empresa + fecha/hora, acompañada por un conteo
que incluye `Confirmada`, `Confirmada sin notificar` y `Completada`; excluye
`Sugerido`, `Aprobado` y `Cancelada`.

## Cambios en vivo

Plática, workspace Fashion Digital Talks (`yay7N6Iejg62P9h0nJaU`):

- Nuevos campos manuales y sobrescribibles por sincronización:
  `giro_industria`, `redes_sociales`, `citas_confirmadas` (`textList`) y
  `numero_de_citas_confirmadas` (`number`).
  `bio_antecedentes` se creó y **se borró el mismo día**: `Bio` en Notion
  es la reseña de speaker, no un antecedente de asistente. Plática
  `delete_custom_field` → `clientsUpdated: 0`.
- `quiere_cita_1_a_1` también se **borró** el mismo día: el agente de
  citas no debe leer un Sí/No de ficha (VIP/Speaker entran por boleto;
  el filtro real sigue en Notion). Plática `delete_custom_field` →
  `clientsUpdated: 0`.
- `area`, `tipo_de_asistencia`, `tamano_de_negocio`, `role_puesto` y
  `soluciones_buscadas` quedaron `automatic=false`, sobrescribibles.
- `Interes detectado` y `Tipo de contacto` no se cambiaron: pertenecen al
  flujo de Marketing/Luis.

Notion de producción:

- `Citas FDT2026.Confirmada asistente (1/0)`.
- `Contactos FDT.Citas Confirmadas Asistente (rollup)`.
- `Contactos FDT.Citas Confirmadas Asistente (Count)`.

El campo anterior `Citas Confirmadas (Count)` no se reutilizó porque sigue
la relación `Citas (relacional)`, donde el contacto es sponsor. El nuevo
conteo sigue `Citas como asistente`.

El one-shot usado fue
`scripts/one-shots/citas-confirmadas-asistente-schema-07sep.js`. Ya fue
ejecutado en producción; no volver a correr salvo auditoría idempotente.

## Código

- `perfil-platica.service.js` construye y escribe el perfil completo en
  `PATCH /v1/clients/{telefono}` de Plática.
- Sincroniza nombre completo, primer nombre, apellido (Title Case contra
  Ticketópolis en mayúsculas), correo, empresa, área, asistencia, tamaño,
  puesto, soluciones, giro, redes y citas confirmadas.
  No sincroniza `Bio` ni `Quiere Citas 1a1`. Puesto va en Title Case;
  redes en minúsculas; empresa solo se Title Case si Ticketópolis la
  mandó toda en mayúsculas.
- `POST /contactos/hidratar-perfil-platica`, con `X-API-Key`, permite
  reintento por `whatsapp` o `asistente_notion_id`.
- Toda plantilla enviada por `platica-client.service.js` intenta hidratar
  primero. Si la hidratación falla, la plantilla no se bloquea.
- El webhook `message.created` hidrata un incoming sin campaña previa y
  también plantillas programadas/campañas originadas fuera del backend
  (`scheduler.scheduled_event.created` / `campaign.message.received`).
- `booking.service.js` intenta sincronizar después de confirmar, mover o
  cancelar. Un fallo de CRM no revierte la cita ni cambia su estatus.

## Evidencia

- Plática devolvió 14 custom fields totales después de la creación; los
  cinco nuevos quedaron `automatic=no`, `overwritable=sí`.
- Fórmula de producción verificada: Liz 1, Luis 2, Adler 4 citas como
  asistente. El contacto ficticio de bloqueos muestra 10 porque sus filas
  confirmadas usan esa relación; nunca se hidrata como asistente activo.
- PASS:
  - `node tests/perfil-platica.manual-test.js`
  - `node tests/platica-respuestas-webhook.manual-test.js`
  - `node tests/modificar-cancelar-cita.manual-test.js`
  - `node tests/campanas-matchmaking.manual-test.js`
  - `node --check` sobre los archivos modificados.

No se mandó ninguna plantilla, WhatsApp ni correo real durante esta
sesión. No se actualizaron perfiles individuales; los campos comenzarán
a poblarse al desplegar y activar los disparadores.

## Operación y pendientes

1. Desplegar el código en Coolify con las variables actuales de producción.
2. Verificar con un número interno que una llamada manual a
   `POST /contactos/hidratar-perfil-platica` muestra las citas como lista.
3. No hace falta crear otro campo/fórmula de conteo.
4. Si se desea poblar todos los perfiles históricos sin esperar mensajes,
   construir primero un backfill con dry-run nominal; no reutilizar el
   one-shot de schema para eso.
