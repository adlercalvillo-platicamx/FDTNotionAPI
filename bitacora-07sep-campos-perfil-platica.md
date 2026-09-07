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
  `numero_de_citas_confirmadas` (`number`). `citas_confirmadas` **se borró
  el mismo día** y se reemplazó por `citas_confirmadas_del_asistente`
  (`text`); ver la sección de `textList` más abajo.
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

## El `textList` de Plática no se puede sincronizar

Adler vio en su ficha tres tarjetas con la misma lista de citas y tres con
las mismas soluciones: cada hidratación **agregaba** una entrada en vez de
reemplazar. La API lo dice sin decirlo: «`customFields` se fusiona con lo
existente». En un `textList` eso significa una entrada nueva por cada
`PATCH /v1/clients`, con todo el arreglo enviado dentro de `content`.

Probado sobre la ficha de Adler el 7-sep: `customFields.citas_confirmadas`
con `null`, con `[]` y con `""` responden éxito y **no vacían la lista**. No
hay forma de limpiar un `textList` desde la API. Conclusión operativa:
**ningún campo que el backend sincronice puede ser `textList`**.
`numero_de_citas_confirmadas` (`number`) sí reemplaza bien; quedó en 4, no
en 12.

`name` y `type` de un custom field son inmutables, así que cambiar el tipo
obliga a borrar y recrear. **Borrar quema el `id` para siempre**: tras
`delete_custom_field` de `citas_confirmadas` (`clientsUpdated: 2`), tres
intentos de recrearlo con el mismo nombre devolvieron
`409 — A custom field with id "citas_confirmadas" already exists`, aunque
`list_custom_fields` ya no lo mostraba. Es borrado lógico y el
identificador no se libera. No borrar un campo esperando recrearlo igual.

Decisiones de Adler ante eso:

- Las citas viven en **`Citas confirmadas del asistente`**
  (`citas_confirmadas_del_asistente`, `text`), una cita por línea con
  viñeta. El nombre distingue su rol de asistente del histórico de sponsor,
  igual que en Notion.
- `soluciones_buscadas` **no se borra**: es de Marketing y perdería su id.
  Se queda `textList` y el backend lo escribe **una sola vez**, cuando el
  perfil viene vacío. Para eso ahora se lee el cliente antes de escribir;
  si la lectura falla, se omite el campo en vez de arriesgar otra entrada.
- La empresa **ya se sincronizaba** en el campo por defecto `company`; no
  aparece en el panel de campos personalizados porque no es uno. No se
  duplica en un custom field.
- El casing de la empresa se queda conservador: Title Case solo si
  Ticketópolis la mandó toda en mayúsculas. Forzarlo siempre rompería
  `eCommerce MX`, `H&M` o `PLATICA.mx`.

## Código

- `perfil-platica.service.js` construye y escribe el perfil completo en
  `PATCH /v1/clients/{telefono}` de Plática.
- Sincroniza nombre completo, primer nombre, apellido (Title Case contra
  Ticketópolis en mayúsculas), correo, empresa, área, asistencia, tamaño,
  puesto, soluciones, giro, redes y citas confirmadas.
  No sincroniza `Bio` ni `Quiere Citas 1a1`. Puesto va en Title Case;
  redes en minúsculas; empresa solo se Title Case si Ticketópolis la
  mandó toda en mayúsculas.
- `platica-client.service.js` expone `obtenerCliente` (`GET /v1/clients/{id}`)
  para esa lectura previa; `platicaGet` ya devuelve `null` en 404. Ojo con la
  forma: la respuesta es `{ workspaces: [ { id, clients: [ … ] } ] }`, no el
  cliente pelón. La primera versión leía el sobre, no encontraba
  `customFields` y por eso volvió a escribir soluciones (visto en vivo con
  Adler). Si la forma no se reconoce, `obtenerCliente` **lanza** en vez de
  devolver `null`, para no confundir «no lo encontré» con «no tiene nada».
- `POST /contactos/hidratar-perfil-platica`, con `X-API-Key`, permite
  reintento por `whatsapp` o `asistente_notion_id`.
- Toda plantilla enviada por `platica-client.service.js` intenta hidratar
  primero. Si la hidratación falla, la plantilla no se bloquea.
- El webhook `message.created` hidrata **cualquier** incoming (decisión Adler
  7-sep; antes solo el de quien no tenía campaña, así que el perfil de quien
  ya recibió la oferta se quedaba viejo por más que escribiera). Un fallo de
  hidratación no impide marcar `Respondió Oferta Inicial`. También cubre las
  plantillas programadas y campañas originadas fuera del backend
  (`scheduler.scheduled_event.created` / `campaign.message.received`).
- **La simulación de campañas no hidrata nada**: `enviarPlantilla` solo se
  llama en envío real, así que un dry-run no sirve para probar los campos.
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
sesión.

Rehidratación manual de Adler Calvillo (`+52 4492867741`) contra Coolify,
7-sep ~18:33 UTC, tras el commit `204b593`. HTTP 200, 4 citas. En Plática
quedó `Adler Calvillo`, puesto `Director De Tecnologia`, redes en
minúsculas, empresa sin recasing (`Empresa Adler`). Esa misma corrida
destapó el apilado: tres entradas idénticas en los dos `textList`.

Después del redeploy con el campo de texto: dos hidrataciones seguidas de
Adler dejaron **un solo** valor en `citas_confirmadas_del_asistente`, con
las cuatro citas en viñetas. Ahí se vio que `solucionesEscritas` seguía en
`true` las dos veces, lo que destapó el bug de forma de respuesta.

## Cómo probar sin tocar asistentes reales

No usar `POST /webhooks/notion/enviar-campanas-aprobadas` como prueba: su
cola es `buscarCitasAprobadasSinCampana()`, o sea **todas** las filas
`Aprobado` sin campaña, e incluye asistentes reales. Y en simulación no
hidrata, así que tampoco sirve.

Estado de los contactos de prueba en Contactos de Laura (7-sep):

| Contacto | WhatsApp | Última Campaña | Respondió |
|---|---|---|---|
| ADLER CALVILLO | +52 4492867741 | Oferta inicial (4-sep) | sí |
| ERNESTO MAYAGOITIA | +52 4492124591 | — | no |

Con la hidratación en cualquier incoming, los dos sirven para probar el
webhook. Antes del cambio, un mensaje de Adler caía en
`RESPUESTA_YA_REGISTRADA` sin refrescar nada.

Para el camino de plantilla hace falta **envío real**; la forma segura es un
one-shot con la lista explícita de teléfonos de prueba, no el webhook de
campañas.

## Operación y pendientes

1. Desplegar el código en Coolify con las variables actuales de producción.
2. Verificar con un número interno que una llamada manual a
   `POST /contactos/hidratar-perfil-platica` deja **una** sola versión de
   las citas y que hidratar dos veces no agrega tarjetas.
3. `soluciones_buscadas` quedó con entradas apiladas en los perfiles que ya
   se hidrataron. No se pueden borrar por API; si estorban, hay que
   limpiarlas desde la interfaz de Plática. Con el arreglo de forma de
   respuesta, el backend ya no las reescribe cuando el campo trae algo.
4. Ningún snapshot de `prompts-agentes-platica/` nombra `citas_confirmadas`,
   así que el rename no pide editar prompts. Si algún agente empieza a
   citar el campo, usar el id nuevo.
5. No hace falta crear otro campo/fórmula de conteo.
6. Si se desea poblar todos los perfiles históricos sin esperar mensajes,
   construir primero un backfill con dry-run nominal; no reutilizar el
   one-shot de schema para eso.
