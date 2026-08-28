# fdt-notion-api

Backend de citas 1a1, matchmaking y checklist para **Fashion Digital Talks 2026** — Plática.mx.

Repo independiente de `platica-google-docs-api`. Este servicio **no llama** a Google Calendar: la fuente de verdad de citas es Notion + el `.ics` por correo (retiro del 27-ago). Ver razones en la sección "Por qué un repo separado" abajo.

## Stack
- Node.js + Express
- Deploy: Coolify — **YA DESPLEGADO** (6 de agosto 2026), tipo de recurso "Application" (no Docker Compose/Swarm) — este tipo no tiene opción de configurar réplicas, corre 1 sola instancia por diseño, que es justo lo que requiere el mutex de `booking.service.js` (ver advertencia ahí)
- Fuente de verdad: Notion (API REST directa para las rutas REST; también expuesto como servidor MCP — ver sección "MCP" abajo)

## Estructura
```
src/
├── index.js                          # Bootstrap Express
├── middleware/
│   └── auth.middleware.js            # Valida X-API-Key (propio de este repo)
├── routes/
│   ├── citas.routes.js
│   ├── matchmaking.routes.js
│   └── checklist.routes.js
├── controllers/
│   ├── citas.controller.js
│   ├── matchmaking.controller.js
│   └── checklist.controller.js
├── jobs/
│   └── reintentar-notificaciones.job.js  # Barrido a demanda de "Confirmada sin notificar" (no es cron)
├── services/
│   ├── citas.service.js              # Queries/escrituras sobre `Citas` — ciclo Sugerido→Aprobado→Confirmada / Confirmada sin notificar (9–18 ago); mesa; caché de pares activos (10-ago)
│   ├── contactos.service.js          # Queries/escrituras sobre `Contactos` — Giro/Industria + Quiere Citas 1a1 (select) + calendarioGoogleId (12-ago)
│   ├── booking.service.js            # Reserva: mutex + mesa 1–11 + correo/.ics (1 sola réplica Coolify)
│   ├── email.service.js              # ICS + SMTP (nodemailer); 3 reintentos inmediatos por envío
│   ├── matchmaking.service.js        # Capa 1 + Capa 2; guardarSugerenciaIndividual (19-ago); global con explicación
│   ├── campanas-matchmaking.service.js # Oferta inicial única: hasta 4 sponsors, sin horarios; simulación por default
│   └── checklist.service.js          # Evaluación de completitud Sponsor/Speaker
├── mcp/
│   ├── server.js                     # 12 herramientas MCP — capa delgada sobre services/
│   └── mount.js                      # Monta POST /mcp en modo stateless (Streamable HTTP)
└── utils/
    └── notion-client.js              # Cliente REST de Notion (nunca MCP para escrituras)

tests/
├── matchmaking.manual-test.js
├── matchmaking-global.manual-test.js
├── guardar-sugerencia-individual.manual-test.js  # Una fila Sugerido, explicación del backend (19-ago)
├── checklist.manual-test.js
├── aprobar-match.manual-test.js
├── global-cache-citas.manual-test.js
├── disponibilidad.local-smoke.js
├── asignacion-mesa.manual-test.js    # Orden de llegada, tope 11, mutex (18-ago)
├── bloqueo-conferencias.manual-test.js # Bloqueo de sponsor sin restar mesas + exclusión Comite/Team (26-ago)
├── email-notificacion.manual-test.js # Confirmada vs Confirmada sin notificar + reenvío (18-ago)
├── mcp-modificar-cancelar.manual-test.js # Tools MCP modificar/cancelar + citasConfirmadas (27-ago)
├── titulos-empresa.manual-test.js     # Empresa×Empresa + texto multipart sin truncar (19-ago)
├── sugeridas-empresas.manual-test.js  # Empresas hidratadas + solo Sugerido/Aprobado (19-ago)
└── mocks/

scripts/one-shots/                    # Ya ejecutados — no volver a correr sin revisar
├── cargar-29-asistentes-faltantes.js
├── verificar-casos-quiere-citas-giro.js
├── marcar-cola-sin-enviar.js         # Transición: marca cola Aprobado sin WhatsApp (una vez, --confirmar)
└── crear-bloqueos-conferencias.js    # 7 bloqueos de conferencia en Citas (nueva); --confirmar
```

## Endpoints

Todos requieren header `X-API-Key`, excepto `/health` y los endpoints `/webhooks/*`, que usan su autenticación propia. Body en JSON. Los GET con query params son de solo lectura: `/checklist/consultar` y `/citas/disponibilidad`.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/health` | Sin auth. Para monitoreo de Coolify. |
| POST | `/citas/reservar` | Reserva una cita 1a1 (mutex + Notion como árbitro). Asigna mesa 1–11 por orden de confirmación en el bloque; genera el título `Cita — Empresa asistente - Empresa sponsor`; envía correo + `.ics` al sponsor (con datos del asistente) y al asistente (solo nombre de empresa del sponsor). Si el correo falla tras 3 SMTP inmediatos, la cita **sí queda creada** con Estatus `Confirmada sin notificar`. `sponsor_calendario_id` en el body es legado e ignorado. Rechaza `ASISTENTE_YA_OCUPADO` si esa persona ya tiene cita en el mismo bloque. |
| POST | `/citas/modificar-cita` | **Nueva (27 de agosto).** Mueve una cita real a otro bloque. Identificación por `telefono` (el servidor valida que la cita sea de esa persona) o por `citaId` directo (Laura/Liz). Valida el horario nuevo con el mismo criterio que `reservar` (grilla, 11 mesas, sponsor ocupado, bloqueos de conferencia) **antes** de tocar Notion; reasigna mesa y manda el `.ics` actualizado (mismo UID, `SEQUENCE` mayor). El correo de cambio es texto propio (horario nuevo/anterior); el sponsor recibe datos del asistente y el asistente solo la empresa del sponsor. Si el correo falla, el horario nuevo **se conserva** y la cita queda `Confirmada sin notificar`. |
| POST | `/citas/cancelar-cita` | **Nueva (27 de agosto).** Mismos dos caminos de identificación. Pasa el `Estatus` a `Cancelada` (con eso el bloque queda libre) y manda el `.ics` de baja (`METHOD:CANCEL`). El aviso nombra con quién se canceló: sponsor con datos del asistente, asistente solo con la empresa del sponsor. Si el correo falla, la cita sigue cancelada y queda marcada para reintento. Llamarla dos veces es idempotente. |
| GET | `/citas/sugeridas?whatsapp=...` | Solo lectura. Identifica al asistente por teléfono (alias `telefono=`). `asistente_notion_id=` queda como fallback. Filas `Sugerido`/`Aprobado` hidratadas **y** `citasConfirmadas`. **Ningún cliente HTTP activo en Plática** (27-ago: el catálogo solo tiene `api_reservar_cita`; el agente usa MCP; el WhatsApp Flow de reserva no pega esta ruta). Sin match → `404 CONTACTO_NO_RESUELTO`. |
| GET | `/matchmaking/sugerencias-asistente?telefono=...` | **Nueva (26 de agosto).** Solo lectura para el agente de Carlos: filas `Aprobado` del asistente (alias `whatsapp=` / `contactoId=`). No filtra por `Campaña Enviada`; ese checkbox viaja en cada ítem. Desde el 27-ago también trae `citasConfirmadas` (`Confirmada` / `Confirmada sin notificar`, orden cronológico). `sugerencias` no cambió de schema. Lista vacía si no hay aprobadas. `X-API-Key`. |
| GET | `/citas/disponibilidad?sponsor_notion_id=...&fecha=YYYY-MM-DD` | **Nueva (14 de agosto).** Solo lectura — lista de bloques de 30 min del día con `disponible` / `motivo` (`SPONSOR_YA_OCUPADO` \| `ASISTENTE_YA_OCUPADO` \| `CAPACIDAD_MESAS_LLENA` \| `null`). Query opcional `asistente_notion_id` para marcar bloques donde esa persona ya tiene cita. **No reemplaza** `POST /citas/reservar`. `Confirmada` / `Confirmada sin notificar` ocupan al sponsor y al asistente; las filas de bloqueo de conferencia no restan de las 11 mesas. Sin horario en env → `503`. |
| POST | `/webhooks/whatsapp-flows` | **Legado/rollback desde 27-ago.** Data API del Flow anterior. Sigue desplegado con HMAC, pero el Agente 2 ya no lo usa. |
| POST | `/webhooks/notion/enviar-campanas-aprobadas` | Disparo manual de la oferta inicial para filas `Aprobado`, agrupadas por asistente. Hasta 4 sponsors por score, **sin horarios** (los ofrece el agente en la conversación). **Sin** `X-API-Key`; exige `X-Notion-Campanas-Secret`. Simulación por default. |
| POST | `/citas/reintentar-notificaciones-pendientes` | **Nueva (18 de agosto).** A demanda (no cron): reenvía correo/.ics de **todas** las citas `Confirmada sin notificar` y (desde 27-ago) de las `Cancelada` cuyo aviso de baja nunca salió. Sin tope de llamadas. 200 si hay éxitos (aunque mixto); 502 si todas fallan. El detalle trae categoría SMTP + mensaje. |
| POST | `/citas/:id/reenviar-notificacion` | Reenvía el par de correos de **una** cita. Misma semántica que el barrido. La ruta estática de arriba va **antes** de `/:id` a propósito. |
| POST | `/matchmaking/sponsors/:sponsorId/sugerir-matches` | Corre Capa 1 + Capa 2 para un sponsor. REST escribe el bloque (`escribirEnNotion` explícito `true`). MCP es dry-run por default; para **una** sugerencia usar la tool `guardar_sugerencia_individual` (no hay ruta REST equivalente). Ya NO escribe en `Match Sugerido` (desuso desde el 9 de agosto). |
| POST | `/matchmaking/sugerir-todos` | Corre matchmaking para todos los sponsors activos, detecta solapamientos y (desde 19-ago) devuelve ranking por sponsor con `explicacion`/`detalle` en cada match. |
| POST | `/matchmaking/enviar-recordatorio-evento` | Recordatorio-reactivación. `X-API-Key`. Simulación por default. Seguro como **cron diario**: si faltan más de 14 días para el 7-oct (`CITAS_FECHAS_EVENTO`), responde `{ disparado: false, motivo: 'VENTANA_NO_CUMPLIDA' }` sin Notion ni Plática. No hay tool MCP. |
| GET | `/checklist/consultar?nombre=...` | Consulta bajo demanda — "cómo va fulano". |
| POST | `/checklist/revisar-pendientes` | Barrido completo, pensado para dispararse desde un Cron Job de Coolify. |

**Reserva — mesa y correo (18 ago):** `CAPACIDAD_MAXIMA_MESAS = 11`. Mesa = citas ya ocupando ese bloque + 1. Cancelar/fallar no reordena mesas de las demás. Correos: apertura por **empresa** (`DINUS agendó un espacio con Infracommerce`). Destinatarios se resuelven desde Contactos. El UID del `.ics` es el page_id de Notion; `SEQUENCE` en reenvíos es un timestamp para que el calendario actualice, no duplique.

**Generación automática de sugerencias:** no hay scheduler dentro de Node. Configurar un cron HTTP externo cada 6 horas hacia `POST /matchmaking/sugerir-todos`, incluyendo `X-API-Key` desde un secret (nunca hardcodeado). Este cron solo crea `Sugerido`; no dispara WhatsApp.

**Títulos y presentación por empresa (19 ago):** las sugerencias se guardan como `Sugerido: Empresa asistente × Empresa sponsor`; una reserva confirmada usa `Cita — Empresa asistente - Empresa sponsor` en Notion y correo. Si `Empresa` está vacía, el nombre de la persona es únicamente el fallback. El parser concatena todos los fragmentos `title`/`rich_text` de Notion para no truncar nombres o empresas multipart.

**Nota sobre los GET de solo lectura:** el resto del repo de Google usa solo POST/PATCH/DELETE por convención (no por limitación técnica). Aquí se dejaron como GET porque son consultas de solo lectura y son más simples de probar/cachear — si quieres uniformidad total con el otro repo, se pueden cambiar a POST sin problema.

**Horario de `GET /citas/disponibilidad` (confirmado Laura, 14-ago):** miércoles 7-oct `10:30–19:00`, jueves 8-oct `09:00–18:00`, bloques de 30 min, offset `-06:00`. Se configura **por fecha** vía env (no hardcodeado) — ver Variables de entorno. Pendiente con Laura: si el último bloque del miércoles (`18:30–19:00`, que topa el cierre) está bien o hay que cortar antes; mismo análisis jueves (`17:30–18:00`).

## MCP

Además de los endpoints REST de arriba, este servicio expone un servidor **MCP** (Model Context Protocol) en `POST /mcp` — mismo `X-API-Key` que el resto de rutas, mismo `authMiddleware`. Transporte Streamable HTTP, modo stateless (`sessionIdGenerator: undefined`).

Las herramientas MCP no reimplementan lógica: llaman a los mismos `services/` que usan las rutas REST. Es una capa de presentación delgada (`src/mcp/server.js`), pensada para que un agente conversacional (el agente de Plática) invoque esta lógica en lenguaje natural sin tener que reimplementar reglas de negocio en su prompt. Hoy son **12** tools MCP, incluyendo disponibilidad conversacional, + `reservar_cita` como API REST en Plática, no en este servidor MCP.

| Herramienta | Tipo | Qué hace |
|---|---|---|
| `consultar_checklist` | Lectura | Qué le falta a un sponsor/speaker por nombre aproximado. Desde el 13-ago el `contacto` del return incluye `calendarioGoogleId` (multi-calendario) — vacío/`null` si el sponsor aún no tiene calendario |
| `consultar_sugeridas_para_asistente` | Lectura | Campo **`sugeridas`**: solo filas `Aprobado`. Primer lote: **`sugeridas_para_ofrecer` hasta 4**; `hay_mas_sugeridas` si hay más. Aparte, `citasConfirmadas` (`citas_para_ofrecer` tope 3). Identificador: `whatsapp`. El WhatsApp Flow de reserva usa el mismo criterio en proceso, no este HTTP. `GET /citas/sugeridas` sigue Sugerido+Aprobado y nadie lo llama hoy. `GET /matchmaking/sugerencias-asistente` no cambió (`sugerencias`, solo Aprobado). |
| `consultar_disponibilidad_cita` | Lectura | Recibe el `sponsorPageId` y `whatsapp` (o `asistentePageId`). Devuelve como máximo 3 bloques libres en `opciones_para_ofrecer`. Omite bloques donde el asistente ya tiene cita confirmada. Sin `fecha`: casillas Día 1 Mañana / Día 1 Tarde / Día 2. Con `fecha`, solo ese día. Si el usuario pide una hora concreta, pasar `hora=HH:MM`: esa hora entra en las 3 si está libre (`horario_solicitado`). Las casillas solas eligen el *primer* bloque de tarde (14:00), no las 15:00. Omite bloques que ya superaron el margen temporal de modificación. Si `hay_mas`, otra llamada con `excluirInicios`. Foto; `reservar_cita` / `modificar_cita` revalidan dentro del mutex (sponsor y asistente). |
| `revisar_checklists_pendientes` | Lectura + escribe estado | Barrido completo de checklist de todos los activos |
| `sugerir_matches_para_sponsor` | Escritura acotada | Matchmaking para un sponsor específico. `escribirEnNotion` default `false` (dry-run) — con `true`, crea una fila `Sugerido` en `Citas` por candidato. Capa 1: Giro/Industria (Marca de moda, Retailer, Manufactura), `Quiere Citas 1a1` excluye solo `'No'`, Tamaño de Negocio / Madurez Exa. **No** filtra por `Etapa de Negocio` (28-ago). El objeto `sponsor` del return incluye `calendarioGoogleId` desde el 13-ago |
| `guardar_sugerencia_individual` | Escritura acotada | **Nueva (19 de agosto).** Guarda únicamente el par sponsor-asistente elegido de un dry-run individual o global. Recalcula elegibilidad, score y explicación en backend; crea una sola fila `Sugerido`. Si el usuario pide varias, una llamada por par — no volver a correr `sugerir_matches_*` con `escribirEnNotion: true` (eso guarda el bloque completo). |
| `sugerir_matches_global` | Escritura acotada, masiva | Matchmaking para todos los sponsors activos, detecta solapamientos y devuelve el ranking por sponsor con `explicacion`/`detalle` en cada match (19-ago: antes los solapamientos perdían la explicación). Mismo patrón dry-run. **Corregido el 10-ago** — timeout por ~130 llamadas Notion; ahora carga pares activos una sola vez (ver Bugs) |
| `aprobar_match` | Escritura acotada | **Nueva (9 de agosto).** Marca como `Aprobado` una fila de `Citas` ya en estado `Sugerido`, dado un par (sponsorPageId, asistentePageId). Verifica que la fila exista antes de aprobar — nunca aprueba a ciegas ni crea una fila nueva. No crea ninguna cita real ni toca Calendar (eso sigue siendo exclusivo de `reservar_cita`) |
| `reintentar_notificaciones_pendientes` | Escritura acotada, masiva | Reenvía a demanda correo/ICS para todas las citas `Confirmada sin notificar`; sin parámetros y sin tope de llamadas |
| `disparar_campanas_aprobadas` | Escritura acotada, masiva | Procesa manualmente `Aprobado` sin campaña previa y envía una sola oferta por asistente. Simulación por default; el agente no puede habilitar envío real por parámetros. |
| `modificar_cita` | Escritura sensible | **Nueva (27 de agosto).** Llama a `modificarCita` (mismo service que REST). Exige confirmación explícita de cuál cita y a qué horario. Si hay varias citas activas, devuelve la lista; el agente no elige. Si el correo falla, `exito_parcial` + `aviso` (el horario sí quedó). |
| `cancelar_cita` | Escritura sensible | **Nueva (27 de agosto).** Llama a `cancelarCita`. Misma identificación y misma regla de ambigüedad. Si el correo falla, lo dice; la cita sigue cancelada. |

**Rediseño del 12 de agosto — `Quiere Citas 1a1` y filtro de Giro:** el campo `Quiere Citas 1a1` pasó de checkbox a `select` (`Sí` / `No` / vacío) porque un checkbox no puede distinguir "nunca contestó" de "contestó que no". Decisión de Laura (demo 11-ago): se excluye solo `'No'` explícito; vacío histórico entra. Además, `buscarAsistentesCandidatos` filtra por Giro/Industria — solo Marca de moda, Retailer/tienda multimarca y Manufactura (aplica también a VIP). Mismo día se agregó `Calendario Google ID` por sponsor (multi-calendario) y se cargaron 29 asistentes reales que faltaban de la importación original de Ticketópolis.

**Rediseño del 9 de agosto — de dónde salió `aprobar_match`:** el campo `Match Aprobado` (checkbox único por sponsor) no distinguía CUÁL de varios candidatos sugeridos había sido aprobado — un hueco de diseño que se volvió real en cuanto `Citas Minimas Prometidas` se confirmó como variable por sponsor (un sponsor con cuota de 4+ tiene 4+ candidatos sugeridos, no 1). La tabla `Citas` ya tenía la forma correcta (una fila por par sponsor-asistente), así que se extendió su `Estatus` con `Sugerido` y `Aprobado` como los dos primeros pasos del ciclo de vida, antes de `Pendiente Calendar`. `Match Sugerido` (relation en el sponsor) queda en desuso a partir de este cambio — se conserva en el schema por historial, pero ningún código nuevo lo escribe.

**`modificar_cita` y `cancelar_cita` se exponen como MCP (27-ago)** para Laura/Liz y el agente de Carlos, llamando al mismo `booking.service.js` que REST. Las descripciones exigen confirmación explícita de cuál cita y qué cambio — más estricto que `aprobar_match`. Si hay ambigüedad, la tool responde `VARIAS_CITAS_ACTIVAS` con la lista; el agente pregunta, no elige. **`reservar_cita` sigue fuera del MCP.**

**Google Calendar propio se retiró el 27-ago (Adler).** Nadie del equipo lo consultaba; Notion ya era adonde todos iban, y el `.ics` cubre el calendario personal del sponsor. `calendar-client.service.js` ya no existe. Los campos `Google Event ID` (Citas) y `Calendario Google ID` (Contactos) quedan en el schema por historial; el código nuevo no los escribe ni los exige. `sponsor_calendario_id` en `POST /citas/reservar` se ignora si llega, para no romper clientes viejos.

**Citas conversacionales (Laura, 27-ago; sponsors 28-ago):** el asistente agenda, reagenda y cancela hablando, sin botones ni WhatsApp Flow. Al ofrecer sponsors el agente nombra **como máximo 4**; horarios y citas a elegir, **como máximo 3**. Reserva: `consultar_sugeridas_para_asistente` → `consultar_disponibilidad_cita` → confirmación → API tool `reservar_cita`. Reagendar: mismas 3 horas + `modificar_cita`. Cancelar: desambiguar si hay varias + `cancelar_cita`. `reservar_cita` sigue fuera del MCP. Ver [`contrato-citas-conversacionales.md`](contrato-citas-conversacionales.md).

## Variables de entorno
Ver `.env.example`. Resumen:
- `API_SECRET_KEY` — clave para llamar a ESTE servicio.
- `NOTION_API_KEY`, `NOTION_CONTACTOS_DATA_SOURCE_ID`, `NOTION_CITAS_DATA_SOURCE_ID`.
- `NOTION_CONTACTO_BLOQUEO_AGENDA_ID` — contacto ficticio de los bloqueos de conferencia (26-ago). Default = el de `Contactos (nueva)`. **Al apuntar a producción** (data sources con prefijo `3b162dda`) hay que ponerle el page_id del contacto ficticio del workspace de Laura: si falta, va vacía o quedó el default de pruebas, el servicio **no arranca** (error 503 explícito). Es a propósito — con el default equivocado la exclusión de mesas se apagaría en silencio y las conferencias volverían a restar de las 11.
- **Horario de citas 1a1** (para `GET /citas/disponibilidad`, 14-ago) — cargar en Coolify Application → Environment Variables (`.env.example` solo documenta el formato):
  - `CITAS_FECHAS_EVENTO=2026-10-07,2026-10-08`
  - `CITAS_HORA_INICIO_2026_10_07` / `CITAS_HORA_FIN_2026_10_07` (mié: `10:30` / `19:00`)
  - `CITAS_HORA_INICIO_2026_10_08` / `CITAS_HORA_FIN_2026_10_08` (jue: `09:00` / `18:00`)
  - `CITAS_DURACION_BLOQUE_MINUTOS=30`
  - `CITAS_ZONA_HORARIA_OFFSET=-06:00`
  - ⚠️ Underscores en la fecha del Name (`2026_10_07`), no guiones. Coolify no inyecta env vars cuyo Name lleva `-` (confirmado 14-ago: la UI las mostraba pero el proceso respondía 503). El query param `fecha` del API sigue con guiones (`2026-10-07`).
- **SMTP / correo de confirmación** (18-ago) — mismos valores en local y Coolify:
  - `EMAIL_SMTP_HOST` / `EMAIL_SMTP_PORT` (Gmail: `smtp.gmail.com` / `587`)
  - `EMAIL_SMTP_USER`, `EMAIL_SMTP_APP_PASSWORD` (App Password; se puede pegar con espacios cada 4 letras)
  - `EMAIL_FROM_NAME` (default `Fashion Digital Talks`)
  - No hay `EMAIL_MAX_INTENTOS`: 3 SMTP inmediatos por envío (no cuentan en Notion); el reenvío a demanda no tiene tope.
- **Campañas de matchmaking**:
  - `NOTION_CAMPANAS_WEBHOOK_SECRET` — secret propio del botón/webhook de Notion.
  - Defaults seguros: `CAMPANAS_MATCHMAKING_MODO_SIMULACION=true` y `CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO=false`.
  - El envío real exige `PLATICA_TEMPLATE_OFERTA_INICIAL` aprobada en Meta. **Contrato cerrado el 28-ago: 2 variables.** `{{1}}` = nombre del asistente; `{{2}}` = hasta 4 sponsors con su solución, en **un solo renglón** con separador ` · ` y el nombre en negritas (`*Empresa* (solución)`). WhatsApp rechaza el envío si el valor de una variable trae saltos de línea, tabs o más de 4 espacios seguidos, así que `payloadPara` sanea nombre y lista antes de mandarlos.
  - La plantilla **ya no lleva horarios**: los ofrece el agente en la conversación con `consultar_disponibilidad_cita`, que revalida contra Notion en ese momento. El disparo tampoco consulta disponibilidad ni carga el índice de citas confirmadas.
  - Solo se envía a un contacto sin `Última Campaña Enviada`. No hay B, C1, C2 ni reactivación automática en el flujo activo; los campos/valores históricos de Notion permanecen por trazabilidad.
  - Tener al menos un sponsor sugerido basta para enviar. **Hasta el 28-ago** se saltaba con `SIN_HORARIOS_SUGERIDOS` a quien no tuviera ningún bloque libre en ese instante; ese filtro se quitó (decisión de Adler) porque dejaba sin oferta a gente con buenos matches.
  - Envío real marca `Estado Envío Campaña=En curso` **antes** de WhatsApp; éxito → `Enviada` + checkbox `Campaña Enviada`; fallo de plantilla → `Falló`. Un `En curso` de más de 10 minutos se reintenta. `soloMarcar` pasa directo a `Enviada`. Simulación no escribe Notion.
  - **Recordatorio del evento** (`POST /matchmaking/enviar-recordatorio-evento`, `X-API-Key`): pensado para cron diario en Coolify. Hasta 14 días antes del primer día de `CITAS_FECHAS_EVENTO` (7-oct-2026) responde `VENTANA_NO_CUMPLIDA` y no toca nada. Después procesa una vez por contacto (`Recordatorio Evento Enviado`). Quien nunca interactuó (filas en `Sugerido`/`Aprobado`/`Rechazado`) recibe `PLATICA_TEMPLATE_RECORDATORIO_EVENTO`. Quien ya tiene `Confirmada` / `Confirmada sin notificar` / `Pendiente Calendar` / `Completada` no recibe WhatsApp; en envío real se marca el checkbox. Sin filas en `Citas` queda fuera. Simulación no escribe. No hay tool MCP.
  - **Antes del primer envío real** (una vez por ambiente): revisar la vista Notion `Solo Aprobados`. Lo que sí deba recibir WhatsApp en ese primer disparo no debe estar `Aprobado`. Luego `node scripts/one-shots/marcar-cola-sin-enviar.js --confirmar`. El script muestra los títulos reales de Citas/Contactos del `.env` activo y el tamaño de la cola; hay que escribir el nombre de Citas tal cual para seguir. Marca toda la cola como oferta inicial procesada, **no** llama a Plática. No es REST ni MCP. No es una prueba repetible.

## Por qué un repo separado (no una app más sobre `platica-google-docs-api`)
1. **Separación de responsabilidades** — ese repo es la capa genérica de Google para todos los clientes de Plática. Las reglas de negocio de un evento específico (pesos de matchmaking, requisitos de checklist) no son su lugar natural.
2. **Concurrencia** — `booking.service.js` depende de un mutex en memoria de un solo proceso. Compartir servidor con otro servicio cuya política de réplicas no controlas directamente es un riesgo real de que la protección se rompa en silencio.
3. Google Calendar propio se retiró el 27-ago: ya no hay llamada HTTP a ese repo desde aquí.

## Cómo correr las pruebas manuales
No hay suite automatizada con Jest todavía — son scripts que se corren a mano y muestran resultado en consola, usando datos reales de los contactos de ejemplo en Notion con las llamadas de escritura simuladas:

```bash
node tests/matchmaking.manual-test.js
node tests/tamano-negocio.manual-test.js
node tests/matchmaking-2026.manual-test.js
node tests/matchmaking-global.manual-test.js
node tests/guardar-sugerencia-individual.manual-test.js
node tests/checklist.manual-test.js
node tests/aprobar-match.manual-test.js
node tests/global-cache-citas.manual-test.js
node tests/disponibilidad.local-smoke.js   # Casos 4/4b/4c sin Notion; el resto de tests-disponibilidad.md va post-Coolify
node tests/asignacion-mesa.manual-test.js
node tests/email-notificacion.manual-test.js
node tests/sugeridas.manual-test.js
node tests/sugeridas-whatsapp.manual-test.js
node tests/sugeridas-empresas.manual-test.js
node tests/flow-reserva.manual-test.js
node tests/titulos-empresa.manual-test.js
node tests/rechazado-pares-activos.manual-test.js
node tests/campanas-matchmaking.manual-test.js
node tests/horarios-oferta.manual-test.js
node tests/recordatorio-evento.manual-test.js
node tests/sugerencias-asistente.manual-test.js
node tests/modificar-cancelar-cita.manual-test.js
node tests/mcp-modificar-cancelar.manual-test.js
node tests/campanas-webhook.manual-test.js
node tests/marcar-cola-sin-enviar.manual-test.js
# Verificación contra Notion real de los 5 casos Quiere Citas 1a1 + Giro (12-ago):
node scripts/one-shots/verificar-casos-quiere-citas-giro.js
```

Pruebas SMTP reales contra Coolify: destinatarios **solo** en allowlist de prueba (`adler.calvillo@platica.mx`, `0257691@up.edu.mx`, `adlerero666@gmail.com`). Si `obtenerContacto` trae un correo externo → abortar. Nunca sponsor × sponsor para demos de cita 1a1.

## Pendientes conocidos (no bloquean el primer deploy, sí producción estable)
- Cron de reconciliación para citas que quedan en "Pendiente Calendar" por un crash a media ejecución.
- ~~Confirmar con Laura: lista final de `Nivel de Patrocinio` y tabla de equivalencia de `Etapa de Negocio` ↔ `Etapa Cliente Buscada`.~~ **28-ago:** etapa ya no es filtro de matchmaking (Adler). El campo sigue en Notion; no hace falta homologar catálogos para el pool.
- ~~El shape exacto de la respuesta de `/calendar/crear-evento`~~ — verificado el 22 de julio; **irrelevante desde el 27-ago** (Calendar propio retirado).
- Envío de alertas por WhatsApp (checklist y prospección) — no construido, es integración aparte.
- Confirmar con Laura: ¿última cita del miércoles puede ser `18:30–19:00` (toca el cierre del horario de citas) o hay que cortar antes? Mismo análisis jueves (`17:30–18:00`). Ver Caso 4c de `tests-disponibilidad`.
- Restaurar emails reales de sponsors/asistentes en Notion (backups en `tests/_emails-*-backup-*.json`) cuando terminen las pruebas de SMTP.
- Allowlist de destinatarios SMTP como regla en `.cursor/rules/architecture.mdc` (aún no escrita; la práctica ya es abortar si hay correo externo).

## Bugs reales encontrados y corregidos

Documentados aquí porque afectaban tanto a rutas REST como a las herramientas MCP correspondientes — no eran exclusivos de una capa:

- **`Match Aprobado` no distinguía candidato individual** (9 de agosto): era un checkbox único por sponsor; con un sponsor teniendo varios candidatos sugeridos a la vez (confirmado con datos reales: 7 sponsors de prueba con Match Sugerido de 2+ candidatos cada uno), no había forma de decir "el match con Ana está aprobado pero el de Carlos no". Resuelto extendiendo `Citas` con estados `Sugerido`/`Aprobado` en vez de parchar el checkbox — ver sección MCP arriba.
- **`sugerir_matches_global` fallaba por timeout con datos reales** (10 de agosto): la función original llamaba a `existeCitaActivaEntre` (una petición HTTP a Notion) **una vez por cada candidato evaluado**, dentro de un loop por cada sponsor. Con 8 sponsors reales y ~15-20 candidatos elegibles cada uno, eran ~130-150 llamadas HTTP secuenciales en una sola invocación — más de 40-100 segundos incluso en el mejor caso, muy por encima de cualquier timeout razonable de un tool call MCP. Por eso `sugerir_matches_para_sponsor` (1 sponsor, ~15-20 llamadas) siempre funcionó bien mientras la versión global fallaba consistentemente. Corregido trayendo, una sola vez al inicio de `sugerirMatchesGlobal`, la lista completa de pares (sponsor, asistente) con cita activa — con paginación real, no asumida — y consultándola en memoria en vez de volver a golpear Notion por cada candidato. Esto bajó el número de llamadas HTTP de ~130-150 a un puñado. `sugerir_matches_para_sponsor` individual no cambió su comportamiento — el volumen ahí nunca fue el problema.
- **`Quiere Citas 1a1` excluía en silencio a históricos vacíos** (12 de agosto): el post-filtro exigía `quiereCitas1a1 === true` cuando el campo aún era checkbox. En Notion un checkbox no distingue "nunca contestó" de "contestó que no" (ambos = `false`), así que ~28 de 55 asistentes del CSV real de Ticketópolis quedaban fuera del matchmaking sin error visible. Laura (demo 11-ago): *"yo descartaría a los que expresamente te pusieron no"*. Corregido: el campo pasó a `select` (`Sí`/`No`/vacío) y el código excluye solo `'No'` explícito.
- **Filtro de Giro/Industria faltante en Capa 1** (12 de agosto): Laura confirmó en la demo del 11-ago que sponsors (proveedores de servicios) solo deben verse con Marca de moda, Retailer/tienda multimarca y Manufactura — "todo lo demás, no me interesa que tengan citas". Se agregó el filtro en `buscarAsistentesCandidatos` (aplica también a VIP). Verificado con 5 casos contra Notion real, incluyendo contactos FICTICIO para vacío+giro no elegible.
- **`calendarioGoogleId` no salía en los returns de las tools** (13 de agosto): el campo ya se leía de Notion en `parseContacto` (multi-calendario del 12-ago) pero `consultarChecklist` y `sugerirMatchesParaSponsor` no lo exponían — el agente pedía `sponsor_calendario_id` al usuario al reservar (Caso 5, `bitacora-verificacion-12ago.md`). Corregido agregándolo a ambos returns; no hizo falta ajustar prompt. `sugerirMatchesGlobal` no se tocó (su reporte de solapamientos no es el camino de `reservar_cita`).
- **Anidamiento de filtros de Notion en `buscarAsistentesCandidatos`** (`contactos.service.js`): el filtro tenía 3 niveles de anidamiento (`and`→`or`→`and`); Notion solo soporta 2. Bloqueaba matchmaking para *cualquier* sponsor, no un caso aislado. Corregido moviendo una condición a post-filtrado en JavaScript.
- **`escribirEnNotion` con default divergente/ausente** entre `sugerirMatchesParaSponsor` (default `true` en el service vs. `false` ya usado en MCP) y `sugerirMatchesGlobal` (hardcodeado en `true`, sin opción de dry-run en absoluto). Ambos homologados a default `false`; los endpoints REST correspondientes se ajustaron para pasar `true` explícito y preservar su comportamiento ya probado.
- **Guardar sugerencias era todo-o-nada** (19 de agosto): `escribirEnNotion=true` escribe el topN completo; el agente no tenía forma de persistir un par. Además `sugerirMatchesGlobal` armaba solapamientos sin `explicacion`/`detalle` y no devolvía el ranking por sponsor, así que el “por qué” del match aparecía a veces sí y a veces no. Corregido con `guardarSugerenciaIndividual` (recalcula y valida el par; una fila `Sugerido`) y haciendo viajar explicación/detalle en ranking + solapamientos. Verificado en conversación real post-redeploy.
