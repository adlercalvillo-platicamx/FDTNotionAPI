# AGENTS.md — fdt-notion-api

Backend Node/Express de citas 1a1, matchmaking y checklist para **Fashion Digital Talks 2026** (Plática.mx). Fuente de verdad: Notion + `.ics` por correo. Google Calendar propio se retiró el 27-ago.

Lee [`README.md`](README.md) y [`.cursor/rules/architecture.mdc`](.cursor/rules/architecture.mdc) antes de cambiar código. Las bitácoras (`bitacora-*.md`) son handoff, no spec: si contradicen el código, gana el código.

## Comandos

```bash
cp .env.example .env   # llenar secretos; nunca commitear .env
npm install
npm run dev            # nodemon → src/index.js, puerto 3001
npm start
```

Pruebas: scripts a mano (`node tests/….js`), no Jest. Ver [`.cursor/rules/testing.mdc`](.cursor/rules/testing.mdc).

Health sin auth: `GET /health`. `POST /webhooks/whatsapp-flows` usa HMAC (`FLOW_WEBHOOK_SECRET`), no `X-API-Key`. El resto exige `X-API-Key` = `API_SECRET_KEY`.

Contrato activo de reserva: [`contrato-citas-conversacionales.md`](contrato-citas-conversacionales.md). El contrato y JSON del WhatsApp Flow quedan solo como rollback legado; el Agente 2 no debe mandar botones ni Flows.

## Layout

```
src/index.js                 # Express: health → webhook Flow → auth → rutas → MCP
src/middleware/              # X-API-Key
src/routes/ + controllers/   # HTTP delgado
src/services/                # Única lógica de negocio
src/mcp/                     # Capa delgada: tools llaman services/, no reimplementan
src/utils/notion-client.js   # REST Notion (nunca MCP hacia Notion)
src/jobs/                    # Reintento a demanda de correos, no cron
tests/                       # Manuales; mocks vía require.cache
scripts/one-shots/           # Ya corridos — no reejecutar sin revisar
```

Convención: **nueva capacidad = service primero**, luego REST y (si aplica) tool MCP con los mismos defaults.

## REST vs MCP

| Capacidad | REST | MCP (`POST /mcp`, Streamable HTTP, stateless) |
|---|---|---|
| Checklist consultar / barrido | GET `/checklist/consultar`, POST `/checklist/revisar-pendientes` | `consultar_checklist`, `revisar_checklists_pendientes` |
| Matchmaking 1 sponsor / global | POST `/matchmaking/…` | `sugerir_matches_para_sponsor`, `sugerir_matches_global` (dry-run: `escribirEnNotion` default **false**; REST pasa `true` explícito) |
| Aprobar par sugerido | (vía service; tool MCP) | `aprobar_match` — exige fila `Sugerido` existente; nunca crea cita |
| Reservar cita real | **POST `/citas/reservar`** | API tool de Plática `reservar_cita`; solo tras confirmación conversacional explícita. **No exponerla como MCP** |
| Modificar / cancelar cita real | **POST `/citas/modificar-cita`**, **POST `/citas/cancelar-cita`** | `modificar_cita`, `cancelar_cita` (misma lógica; confirmación explícita en la descripción; ambigüedad → lista, no elegir) |
| Sugeridas del asistente | GET `/citas/sugeridas?whatsapp=` (sin cliente HTTP activo; Sugerido+Aprobado). El WhatsApp Flow de reserva arma el dropdown en proceso, solo `Aprobado`. | `consultar_sugeridas_para_asistente` (`whatsapp`; campo **`sugeridas`** = solo `Aprobado`; + `citasConfirmadas`) |
| Sugerencias Aprobado (Carlos) | GET `/matchmaking/sugerencias-asistente?telefono=` (alias `whatsapp=`; `contactoId=` opcional). Incluye `citasConfirmadas` aparte | — |
| Disponibilidad (foto) | GET `/citas/disponibilidad` (opcional `asistente_notion_id`) | `consultar_disponibilidad_cita` (máx. 3; `hora=HH:MM` si pidió una hora concreta; exige `whatsapp` o `asistentePageId`; `hay_mas` + `excluirInicios`) |
| Data WhatsApp Flow (legado) | POST `/webhooks/whatsapp-flows` (HMAC) | — |
| Reenviar .ics | POST `/citas/:id/reenviar-notificacion`, POST `/citas/reintentar-notificaciones-pendientes` | `reintentar_notificaciones_pendientes` (a demanda, sin tope, no cron) |
| Disparar oferta inicial aprobada | POST `/webhooks/notion/enviar-campanas-aprobadas` (secret propio; simulación por default) | `disparar_campanas_aprobadas` (hasta 4 sponsors en 1 renglón; sin horarios) |
| Recordatorio del evento | POST `/matchmaking/enviar-recordatorio-evento` (`X-API-Key`; simulación por default; cron diario seguro) | — |

`GET /citas/disponibilidad` y `consultar_disponibilidad_cita` usan una query de citas confirmadas del día (misma regla 11 mesas / sponsor **y** ocupación del asistente). Sin env de horario → **503**. El MCP no lista toda la grilla: el agente ofrece **como máximo 4** sponsors (`sugeridas_para_ofrecer`) y **como máximo 3** horarios o citas a cancelar/mover. Sin fecha explícita: casillas Día 1 Mañana / Día 1 Tarde / Día 2 (relativos al momento de la consulta; si solo queda un día, colapsa a Mañana/Tarde). Con fecha, se limita a ese día. Si el usuario pide una hora concreta, `hora=HH:MM` (si no, las casillas eligen el primer bloque de tarde y las 15:00 no salen aunque estén libres). No ofrece bloques que ya superaron `CITAS_MARGEN_MODIFICACION_MINUTOS` ni bloques donde el asistente ya tiene `Confirmada` / `Confirmada sin notificar`. No sustituyen a `reservar`/`modificar_cita`: el agente repite sponsor/fecha/hora, pide confirmación explícita y solo entonces escribe. El Flow ya no está en el camino activo.

La generación periódica de sugerencias es externa al proceso: cron HTTP cada 6h a `POST /matchmaking/sugerir-todos` con `X-API-Key`. Nunca usar ese cron para enviar WhatsApp. La oferta inicial única requiere disparo humano y permanece en simulación hasta aprobar `PLATICA_TEMPLATE_OFERTA_INICIAL` en Meta. **Contrato cerrado el 28-ago: 2 variables** — `{{1}}` nombre, `{{2}}` hasta 4 sponsors con su solución en un solo renglón (`*Empresa* (solución)` separados por ` · `). Los valores de variable no pueden traer saltos de línea, tabs ni más de 4 espacios seguidos: WhatsApp rechaza el envío, por eso `payloadPara` los sanea. **Sin horarios**: los ofrece el agente en la conversación, y ya no se salta a quien no tenga un bloque libre en ese instante (`SIN_HORARIOS_SUGERIDOS` se retiró). Solo se envía a quien no tenga `Última Campaña Enviada`; A/B/C1/C2 y reactivaciones son legado no usado. El recordatorio-reactivación del evento es `POST /matchmaking/enviar-recordatorio-evento` (cron diario en Coolify; el endpoint no hace nada hasta 14 días antes del primer día de `CITAS_FECHAS_EVENTO`). Limpiar la cola acumulada antes del primer envío real es `scripts/one-shots/marcar-cola-sin-enviar.js` (`soloMarcar`); pide `--confirmar` y después escribir el título real de Citas. No hay endpoint ni tool MCP para eso.

## Ciclo de vida en tabla `Citas`

`Sugerido` → `Aprobado` → `Pendiente Calendar` → `Confirmada` → (`Cancelada`)

Si SMTP falla tras Notion OK: **`Confirmada sin notificar`** (no revertir la cita). Motivo en `Notas Envio Email`. Si lo que falló fue el aviso de una **cancelación**, la fila se queda en `Cancelada` con `[CANCELACION_PENDIENTE]` en ese mismo campo.

**`Match Sugerido` / checkbox `Match Aprobado` están en desuso.** Escrituras nuevas van a filas en `Citas` por par sponsor–asistente. No revivir esos campos.

Toda escritura a `Confirmada` / `Confirmada sin notificar` de una cita real debe pasar por `booking.service.js`. Excepción: filas de **bloqueo de conferencia** (Contacto Principal = `Bloqueo de Agenda (Programa del Evento)`), que se cargan a mano / one-shot. Editar Estatus a mano en una cita real rompe capacidad y “sponsor ocupado”.

## Reserva (`booking.service.js`)

- Mutex **en memoria, un proceso**. Coolify: **1 réplica**. No quitar ni “simplificar” el mutex.
- Notion es el árbitro del slot. El sponsor ve la cita en su calendario personal vía `.ics` por correo. Google Calendar propio se retiró el 27-ago (`calendar-client.service.js` ya no existe).
- Duración y grilla de bloques: mismas env que disponibilidad (`CITAS_*`). Reusar `generarBloquesParaFecha`; no duplicar la lista de slots.
- Capacidad: **11 mesas por bloque** (`CAPACIDAD_MAXIMA_MESAS`). Mesa = `contarCitasEnBloque(inicio) + 1`. Cancelar no reutiliza el número. Las filas de bloqueo de conferencia **sí** marcan `SPONSOR_YA_OCUPADO` para ese sponsor y **no** restan mesa. El asistente no puede tener dos citas en el mismo bloque (`ASISTENTE_YA_OCUPADO`); no hay tope de cantidad de citas, solo de traslape.
- Correos: dos envíos distintos (sponsor con datos del asistente; asistente corto, **sin** contacto del sponsor). 3 reintentos SMTP inmediatos por envío. `emailsExtra` / `asistentes_email` van al correo del asistente.

## Modificar / cancelar (27-ago, mismo `booking.service.js`)

Identificación doble en ambos: `telefono` (el servidor valida que `Contacto Principal` sea ese contacto; `telefono` + `citaId` ajeno → **403 `CITA_NO_PERTENECE`**) o `citaId` directo (Laura/Liz, sin validación cruzada). Con teléfono y sin `citaId`: 1 cita activa se resuelve sola, varias devuelven **409 `VARIAS_CITAS_ACTIVAS`** con la lista; `sponsorEmpresa` desambigua.

- **Modificar**: valida el bloque nuevo (grilla + 11 mesas + sponsor ocupado + asistente ocupado, con `exceptPageId` para no chocar consigo misma) **antes** de escribir Notion, dentro del mismo mutex. Reasigna mesa, marca `Reprogramada` y guarda el horario de la primera reprogramación en `Reprogramada Horario Original`. Correo fallido → `Confirmada sin notificar` (el horario nuevo NO se revierte); el reenvío a demanda lee `Fecha y Hora` de Notion, así que manda el horario correcto. El correo de cambio es texto propio (no la confirmación pegada debajo): sponsor recibe datos del asistente; asistente solo ve la empresa del sponsor. Si la fila ya tiene `Reprogramada Horario Original`, el reintento también usa ese texto de cambio.
- **Cancelar**: `Estatus` → `Cancelada` libera el bloque solo (no está en `ESTATUS_ACTIVOS` ni en los conteos). Correo fallido → sigue `Cancelada` + marca `[CANCELACION_PENDIENTE]` al inicio de `Notas Envio Email`. **Nunca** degradar una cancelación a `Confirmada sin notificar`: volvería a ocupar mesa. El aviso nombra con quién se canceló: sponsor recibe los mismos datos de contacto del asistente que en la confirmación; asistente solo ve la empresa del sponsor.
- Dos reglas de tiempo, independientes entre sí: el horario **destino** no puede estar más de `CITAS_MARGEN_MODIFICACION_MINUTOS` (5) en el pasado; y una cita **original** ya pasada solo se puede mover si `Check-in Realizado` está en falso. No hay ventana mínima de anticipación sobre la cita original.
- ICS: mismo UID (`page_id@fashiondigitaltalks.com`), `SEQUENCE` de `siguienteSecuenciaIcs()` (timestamp con garantía de incremento en el mismo segundo), `CONFIRMED` al modificar y `METHOD:CANCEL` + `STATUS:CANCELLED` al cancelar. No hay campo de secuencia en Notion y no hace falta.
- El aviso de “si tu calendario no se actualiza solo” va en el **cuerpo del correo**, no en la respuesta HTTP (esa advertencia era del Google Calendar propio, retirado el 27-ago).
- MCP (`modificar_cita` / `cancelar_cita`): misma función que REST. Si hay varias citas, la tool devuelve la lista y el agente pregunta. Si el correo falla, `exito_parcial` + `aviso` — no reportar que el aviso ya se envió. `reservar_cita` sigue fuera del MCP.

## Matchmaking

- **Bronce** no participa (error explícito). Prioridad de desempate: Cristal > Diamante > Oro. **`Citas Minimas Prometidas` es por sponsor**, no derivar cuota del nivel. `topN` = cuota + `MARGEN_CANDIDATOS` (2).
- Capa 2: ranking en [`matchmaking.service.js`](src/services/matchmaking.service.js) (pesos `PESOS`). Exa en ranking: `Madurez Negocio` 40/15 (sin Tamaño declarado), `ICP Moda/Ecommerce` +30/−30 (Ambiguo/vacío = 0), `Estado Web` +10 si `Con web` (Sin web no resta). No son filtros duros.
- Giro elegible (también VIP): Marca de moda, Retailer/tienda multimarca, Manufactura. `Quiere Citas 1a1` es **select** `Sí`/`No`/vacío — excluir solo `'No'` explícito.
- Virtual es elegible por default (13-ago). `incluirVirtual` está **deprecado** (no-op, no usarlo en código nuevo).
- **Etapa de Negocio / Etapa Cliente Buscada no filtran** (28-ago, Adler). Ticketópolis ya no captura etapa en asistentes nuevos. `etapasValidas` en `buscarAsistentesCandidatos` es no-op (mismo patrón que `incluirVirtual`). Los campos siguen en Notion.
- Notion: **máximo 2 niveles** de anidamiento en filtros. Condiciones extra → post-filtro en JS (como `Quiere Citas 1a1`).
- Global: cargar pares con cita activa **una vez** (paginado) y consultar en memoria. No llamar Notion por candidato (timeout histórico ~130–150 HTTP).

## Notion y env

- Cliente: [`src/utils/notion-client.js`](src/utils/notion-client.js) contra data sources `NOTION_CONTACTOS_DATA_SOURCE_ID` / `NOTION_CITAS_DATA_SOURCE_ID`.
- Horario: `CITAS_FECHAS_EVENTO=2026-10-07,2026-10-08`. En Coolify, Names con **underscores** en la fecha (`CITAS_HORA_INICIO_2026_10_07`). Guiones en el Name no se inyectan. El query `fecha` del API sigue con guiones.
- `NOTION_CONTACTO_BLOQUEO_AGENDA_ID`: contacto ficticio de bloqueo de conferencias. Default = el de pruebas. Si los data sources son de producción (prefijo `3b162dda`) y la variable falta, está vacía o trae ese default → el servicio **no arranca** (503 en `requireContactoBloqueoAgenda`).
- `API_SECRET_KEY` es de **este** servicio. No hay `GOOGLE_API_*` en el flujo de citas (retirado 27-ago).

## Qué no hacer

- No duplicar lógica de negocio en `mcp/`, controllers o el prompt del agente de Plática.
- No hardcodear horarios del 7/8 oct; van en env.
- No `npm install` de paquetes nuevos ni borrar archivos fuera del repo sin preguntar.
- No reejecutar `scripts/one-shots/` (cargas reales a Notion) sin revisar. `marcar-cola-sin-enviar.js` es de un solo uso por ambiente, justo antes del primer envío real.
- **Ninguna prueba con SMTP real** puede usar contactos con correo externo. Verificar destinatarios **antes** de `POST /citas/reservar`.
- Si un comentario dice “sin confirmar” / “borrador” / “no verificado”, no construir encima sin señalarlo.
- No cambiar reglas de negocio confirmadas (Bronce, giros, select Quiere Citas, mutex, no-MCP de reservar) salvo pedido explícito.

## Tests nuevos

Inyectar mocks en `require.cache` **antes** de `require` del service real (ver `tests/matchmaking.manual-test.js`). No copiar `src/services/*.js` a tests.

Baselines en `.cursor/rules/testing.mdc`: si cambian sin un cambio de negocio intencional, es regresión — reportar, no “arreglar” el test para que pase.

Scripts locales útiles: `tests/disponibilidad.local-smoke.js` (sin Notion), `tests/email-notificacion.manual-test.js`, `tests/asignacion-mesa.manual-test.js`, `tests/modificar-cancelar-cita.manual-test.js`, `tests/mcp-modificar-cancelar.manual-test.js`.
