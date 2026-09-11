# fdt-notion-api

Backend de citas 1a1, matchmaking y checklist para **Fashion Digital Talks 2026** — Plática.mx.

Repo independiente de `platica-google-docs-api`. La fuente de verdad de citas es Notion + el `.ics` por correo (retiro del Calendar propio el 27-ago). **Excepción 10-sep:** un Apps Script en `rp@fashiondigitaltalks.com` puede crear un Google Meet 15 min antes, solo para boletos Virtual y con `MEET_VIRTUAL_HABILITADO=true`. Ver razones en la sección "Por qué un repo separado" abajo.

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
│   ├── perfil-platica.service.js      # Hidrata perfil/custom fields desde Contactos + citas confirmadas
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

Todos requieren header `X-API-Key`, excepto `/health` y los endpoints `/webhooks/*`, que usan su autenticación propia. Body en JSON. Los GET con query params son de solo lectura: `/checklist/consultar`, `/contactos/buscar` y `/citas/disponibilidad`.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/health` | Sin auth. Para monitoreo de Coolify. |
| POST | `/citas/enviar-recordatorios-15min` | **Nueva (7 sep), reemplaza el programado.** Cron cada 5 min los días del evento. Busca en Notion las citas `Confirmada` / `Confirmada sin notificar` que empiezan en los próximos 15 min y manda `notificacion_cita_15min_antes` al asistente (`{{1}}` primer nombre, `{{2}}` empresa del sponsor), sin `scheduleTime`. Con `MEET_VIRTUAL_HABILITADO=true` y boleto `Virtual`, primero crea el Meet (Apps Script, `rp@fashiondigitaltalks.com`) e invita ambos correos; WhatsApp usa `PLATICA_TEMPLATE_CITA_15MIN_VIRTUAL`. Si Meet falla, no manda esa plantilla (reintento hasta 3, luego `Omitido`). Flag en false = plantilla presencial para todos. `X-API-Key`. Idempotente por fila: `Estado Recordatorio 15min` (`En curso` → `Enviado` / `Falló` / `Omitido`) + fecha y notas. Una cancelada no entra; una reprogramada entra con su horario nuevo. Body opcional solo para pruebas: `ahora` (ISO) y `minutos` (1–120). Responde 200 con `{ revisadas, enviados, omitidos, fallidos, detalle }`; 502 si truena la corrida completa. |
| POST | `/citas/enviar-recordatorios-2h` | **Nueva (9 sep).** Mismo patrón que el de 15 min, ventana de 2 horas. Cada cita `Confirmada` / `Confirmada sin notificar` (no solo la primera del día). Plantilla `notificacion_cita_2horas_antes`: `{{1}}` primer nombre, `{{2}}` hora (`3:00 pm`), `{{3}}` `Marco Trujillo, de Plática.mx`. Estado propio: `Estado Recordatorio 2h`. Body opcional `ahora` / `minutos` (1–180). |
| POST | `/citas/programar-recordatorio-15min` | **Retirada el 7 sep → 410.** Programaba el aviso en Plática con `scheduleTime` al reservar. Plática no expone cancelar un programado, así que una cita cancelada seguía avisando a su hora vieja y una reprogramada nunca avisaba a la nueva. Lo sustituye el cron de arriba. |
| POST | `/citas/reservar` | Reserva una cita 1a1 (mutex + Notion como árbitro). Rechaza `HORARIO_EN_PASADO` si el bloque ya superó `CITAS_MARGEN_MODIFICACION_MINUTOS` (mismo umbral que disponibilidad). Un reintento con el mismo `request_id` de una Confirmada no se rechaza por eso. Asigna la primera mesa física libre entre 1–11 en el bloque; si una cita se canceló, reutiliza ese hueco sin duplicar una mesa todavía ocupada. Para reagendar una cancelada recibe `cita_origen_cancelada_id`: valida `Cancelada` + mismo par, crea una fila distinta enlazada y rechaza reutilizar ese origen otra vez. Genera el título `Cita — Empresa asistente - Empresa sponsor`; envía correo + `.ics` al sponsor (con datos del asistente) y al asistente (solo nombre de empresa del sponsor). El `.ics` lleva `LOCATION` = Club France (dirección completa + `GEO`); mesa y horario van en el cuerpo y en `DESCRIPTION`. Si el correo falla tras 3 SMTP inmediatos, la cita **sí queda creada** con Estatus `Confirmada sin notificar`. `sponsor_calendario_id` en el body es legado e ignorado. Rechaza `ASISTENTE_YA_OCUPADO` si esa persona ya tiene cita en el mismo bloque. |
| POST | `/citas/modificar-cita` | **Nueva (27 de agosto; no-show 11-sep).** Mueve una cita real a otro bloque. El destino no puede estar más de `CITAS_MARGEN_MODIFICACION_MINUTOS` (default 5) en el pasado — el mismo umbral que disponibilidad y `reservar`. Una cita ya pasada se puede recuperar si `Check-in Realizado=false`. Valida grilla, 11 mesas, sponsor/asistente ocupado y bloqueos **antes** de tocar Notion. Al mover, limpia siempre el recordatorio de 15 min y el Meet persistido para que Virtual genere otra sala. El de 2 h solo se limpia si el destino queda a más de 2 h. Reasigna mesa y manda `.ics` actualizado. Si el correo falla, conserva el cambio como `Confirmada sin notificar`. |
| POST | `/citas/cancelar-cita` | **Nueva (27 de agosto).** Mismos dos caminos de identificación. Pasa el `Estatus` a `Cancelada` (con eso el bloque queda libre) y manda el `.ics` de baja (`METHOD:CANCEL`, `LOCATION` Club France). El cuerpo solo trae el horario cancelado (sin mesa ni sede). El aviso nombra con quién se canceló: sponsor con datos del asistente, asistente solo con la empresa del sponsor. Si el correo falla, la cita sigue cancelada y queda marcada para reintento. Llamarla dos veces es idempotente. |
| GET | `/citas/sugeridas?whatsapp=...` | Solo lectura. Identifica al asistente por teléfono (alias `telefono=`). `asistente_notion_id=` queda como fallback. Filas `Sugerido`/`Aprobado` hidratadas **y** `citasConfirmadas`. **Ningún cliente HTTP activo en Plática** (27-ago: el catálogo solo tiene `api_reservar_cita`; el agente usa MCP; el WhatsApp Flow de reserva no pega esta ruta). Sin match → `404 CONTACTO_NO_RESUELTO`. |
| GET | `/matchmaking/sugerencias-asistente?telefono=...` | **Nueva (26 de agosto).** Solo lectura para el agente de Carlos: filas `Aprobado` del asistente (alias `whatsapp=` / `contactoId=`). No filtra por `Campaña Enviada`; ese checkbox viaja en cada ítem. Desde el 27-ago también trae `citasConfirmadas` (`Confirmada` / `Confirmada sin notificar`, orden cronológico). `sugerencias` no cambió de schema. Lista vacía si no hay aprobadas. `X-API-Key`. |
| GET | `/citas/disponibilidad?sponsor_notion_id=...&fecha=YYYY-MM-DD` | **Nueva (14 de agosto).** Solo lectura — lista de bloques de 30 min del día con `disponible` / `motivo` (`SPONSOR_YA_OCUPADO` \| `ASISTENTE_YA_OCUPADO` \| `CAPACIDAD_MESAS_LLENA` \| `null`). Query opcional `asistente_notion_id` para marcar bloques donde esa persona ya tiene cita. **No reemplaza** `POST /citas/reservar`. `Confirmada` / `Confirmada sin notificar` ocupan al sponsor y al asistente; las filas de bloqueo de conferencia no restan de las 11 mesas. Sin horario en env → `503`. Desde el 2-sep valida el sponsor antes de calcular: page_id que no existe → `404 SPONSOR_NO_ENCONTRADO`, contacto que no es Sponsor → `400 SPONSOR_CATEGORIA_INVALIDA` (antes devolvía el día entero libre para un id inventado). |
| POST | `/webhooks/whatsapp-flows` | **Legado/rollback desde 27-ago.** Data API del Flow anterior. Sigue desplegado con HMAC, pero el Agente 2 ya no lo usa. |
| POST | `/webhooks/notion/enviar-campanas-aprobadas` | Disparo manual de la oferta inicial para filas `Aprobado`, agrupadas por asistente. Hasta 4 sponsors por score, **sin horarios** (los ofrece el agente en la conversación). **Sin** `X-API-Key`; exige `X-Notion-Campanas-Secret`. Simulación por default. |
| POST | `/webhooks/platica/mensajes` | Recibe `message.created` de Plática. Sin `X-API-Key`; exige HMAC `X-Webhook-Signature` con `PLATICA_WEBHOOK_SECRET`. **Cualquier** `incoming` hidrata el perfil desde Notion (7-sep); si además es posterior a la oferta, marca `Respondió Oferta Inicial`. Un incoming sin `Última Campaña Enviada` aplica la etiqueta `Citas 1a1 - Escribió sin campaña` para que Liz/Laura filtren en Plática. Un fallo de hidratación no impide registrar la respuesta. Las plantillas de campaña/programadas fuera del backend también disparan hidratación. |
| POST | `/citas/reintentar-notificaciones-pendientes` | **Nueva (18 de agosto).** A demanda (no cron): reenvía correo/.ics de las citas `Confirmada sin notificar` y (desde 27-ago) de las `Cancelada` cuyo aviso de baja nunca salió. Omite filas de bloqueo de conferencia. Sin tope de llamadas. 200 si hay éxitos (aunque mixto); 502 si todas fallan. El detalle trae categoría SMTP + mensaje. |
| POST | `/citas/:id/reenviar-notificacion` | Reenvía el par de correos de **una** cita. Misma semántica que el barrido. La ruta estática de arriba va **antes** de `/:id` a propósito. |
| POST | `/matchmaking/sponsors/:sponsorId/sugerir-matches` | Corre Capa 1 + Capa 2 para un sponsor. REST escribe el bloque (`escribirEnNotion` explícito `true`). MCP es dry-run por default; para **una** sugerencia usar la tool `guardar_sugerencia_individual` (no hay ruta REST equivalente). Ya NO escribe en `Match Sugerido` (desuso desde el 9 de agosto). |
| POST | `/matchmaking/sugerir-todos` | Corre matchmaking para todos los sponsors activos, detecta solapamientos y (desde 19-ago) devuelve ranking por sponsor con `explicacion`/`detalle` en cada match. |
| POST | `/matchmaking/enviar-recordatorio-evento` | Recordatorio-reactivación. `X-API-Key`. Simulación por default. Seguro como **cron diario**: si faltan más de 14 días para el 7-oct (`CITAS_FECHAS_EVENTO`), responde `{ disparado: false, motivo: 'VENTANA_NO_CUMPLIDA' }` sin Notion ni Plática. No hay tool MCP. |
| POST | `/matchmaking/enviar-followups-72h` | Follow-up para oferta inicial sin respuesta. `X-API-Key`; cron cada 15 min. **Desde 9-sep** no espera 72 h: abre el 5-oct-2026 a las 09:30 `America/Mexico_City` (`FOLLOWUP_72H_DESDE`) y sigue enviando solo lun–vie 09:00–18:00. Reconsulta el historial de Plática antes de enviar `followup_72hrs`; omite si respondió o ya tiene cita. Simulación por default; sin overrides en body. |
| POST | `/matchmaking/enviar-lastcall` | Last call a quien ya recibió oferta inicial y **no tiene cita activa**. `X-API-Key`; cron **nuevo** cada 15 min (no reutilizar el del follow-up). Abre el 6-oct-2026 a las 09:30 CDMX (`LASTCALL_DESDE`). Plantilla `lastcall_cita1a1` (`{{1}}` = primer nombre). Haber respondido no excluye; `Cancelada` tampoco. Simulación por default; sin overrides en body. |
| GET | `/contactos/buscar?categoria=Asistente\|Sponsor&telefono=\|nombre=\|empresa=` | **Nueva (31 ago).** Solo lectura. Resuelve `page_id` de un Asistente o Sponsor para Liz/Laura antes de `reservar_cita`. `categoria` obligatorio. Orden: teléfono → nombre → empresa (para en el primero que traiga resultados). Array vacío = no encontrado (200). |
| POST | `/contactos/hidratar-perfil-platica` | Sincroniza un asistente de Notion hacia su perfil de Plática por `whatsapp` o `asistente_notion_id`: nombre completo, primer nombre, correo, empresa (`company`), datos de matchmaking y citas confirmadas (`citas_confirmadas_del_asistente`, texto con una cita por línea, + conteo). Lee el perfil antes de escribir para no volver a llenar `soluciones_buscadas`, que es `textList` y solo acumula. También se ejecuta automáticamente antes de plantillas y al reservar, modificar o cancelar. |
| GET | `/checklist/consultar?nombre=...` | Consulta bajo demanda — "cómo va fulano". |
| POST | `/checklist/revisar-pendientes` | Barrido completo, pensado para dispararse desde un Cron Job de Coolify. |

**Reserva — mesa y correo (18 ago; huecos corregidos 7 sep):** `CAPACIDAD_MAXIMA_MESAS = 11`. Reserva y modificación leen las mesas de las citas `Confirmada` / `Confirmada sin notificar` del bloque y asignan el menor número libre. Una cancelada conserva fecha y mesa como historial, pero no ocupa capacidad y su número puede reutilizarse; las vistas operativas por mesa la ocultan. No se reordenan las demás citas. Correos: apertura por **empresa** (`DINUS agendó un espacio con Infracommerce`). Destinatarios se resuelven desde Contactos. El UID del `.ics` es el page_id de Notion; `SEQUENCE` en reenvíos es un timestamp para que el calendario actualice, no duplique.

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
| `consultar_sugeridas_para_asistente` | Lectura | Campo **`sugeridas`**: solo filas `Aprobado`. Primer lote: **`sugeridas_para_ofrecer` hasta 4**. Aparte, `citasConfirmadas` (`citas_para_ofrecer` tope 3) y `citasCanceladas` (`canceladas_para_ofrecer` tope 3). Una cancelada que ya originó otra cita no vuelve a ofrecerse. Identificador: `whatsapp`. |
| `consultar_disponibilidad_cita` | Lectura | Recibe el `sponsorPageId` y `whatsapp` (o `asistentePageId`). Devuelve como máximo 3 bloques libres en `opciones_para_ofrecer`. Omite bloques donde el asistente ya tiene cita confirmada y cualquier bloque que ya superó `CITAS_MARGEN_MODIFICACION_MINUTOS` (default 5). Sin `fecha`: casillas Día 1 Mañana / Día 1 Tarde / Día 2. Con `fecha`, solo ese día. Si el usuario pide una hora concreta, pasar `hora=HH:MM`: esa hora entra en las 3 si está libre (`horario_solicitado`). Las casillas solas eligen el *primer* bloque de tarde (14:00), no las 15:00. Si `hay_mas`, otra llamada con `excluirInicios`. Foto; `reservar_cita` / `modificar_cita` revalidan dentro del mutex. |
| `revisar_checklists_pendientes` | Lectura + escribe estado | Barrido completo de checklist de todos los activos |
| `sugerir_matches_para_sponsor` | Escritura acotada | Matchmaking para un sponsor específico. `escribirEnNotion` default `false` (dry-run) — con `true`, crea una fila `Sugerido` en `Citas` por candidato. Capa 1: Giro/Industria (Marca de moda, Retailer, Manufactura; sin excepción para VIP/Speaker), `Quiere Citas 1a1` excluye solo `'No'`; `Tamaño de Negocio` nuevo debe estar entre los tamaños elegidos por el sponsor en `Etapa Cliente Buscada`, mientras el registro legacy conserva el fallback Exa Consolidado/PyME. **Presencial VIP y Speaker saltan tamaño**, pero no el nuevo filtro de Área: si el sponsor llenó `Puestos Buscados`, un Área conocida distinta sale; vacía/`Otro` entra como desconocida. `Etapa de Negocio` no filtra (28-ago). El objeto `sponsor` del return incluye `calendarioGoogleId` desde el 13-ago |
| `guardar_sugerencia_individual` | Escritura acotada | **Nueva (19 de agosto).** Guarda únicamente el par sponsor-asistente elegido de un dry-run individual o global. Recalcula elegibilidad, score y explicación en backend; crea una sola fila `Sugerido`. Si el usuario pide varias, una llamada por par — no volver a correr `sugerir_matches_*` con `escribirEnNotion: true` (eso guarda el bloque completo). |
| `sugerir_matches_global` | Escritura acotada, masiva | Matchmaking para todos los sponsors activos, detecta solapamientos y devuelve el ranking por sponsor con `explicacion`/`detalle` en cada match (19-ago: antes los solapamientos perdían la explicación). Mismo patrón dry-run. **Corregido el 10-ago** — timeout por ~130 llamadas Notion; ahora carga pares activos una sola vez (ver Bugs) |
| `aprobar_match` | Escritura acotada | **Nueva (9 de agosto).** Marca como `Aprobado` una fila de `Citas` ya en estado `Sugerido`, dado un par (sponsorPageId, asistentePageId). Verifica que la fila exista antes de aprobar — nunca aprueba a ciegas ni crea una fila nueva. No crea ninguna cita real ni toca Calendar (eso sigue siendo exclusivo de `reservar_cita`) |
| `reintentar_notificaciones_pendientes` | Escritura acotada, masiva | Reenvía a demanda correo/ICS para citas `Confirmada sin notificar` (omite bloqueos de conferencia); sin parámetros y sin tope de llamadas |
| `disparar_campanas_aprobadas` | Escritura acotada, masiva | Procesa manualmente `Aprobado` sin campaña previa y envía una sola oferta por asistente. Simulación por default; el agente no puede habilitar envío real por parámetros. El `detalle` de cada envío/simulación incluye `destinatario` (nombre + empresa) y `sugerenciasInformadas` (el `{{2}}` exacto que recibió o recibiría), para que Laura/Liz tengan reporte nominal además de conteos. |
| `modificar_cita` | Escritura sensible | **Nueva (27 de agosto).** Llama a `modificarCita` (mismo service que REST). Exige confirmación explícita de cuál cita y a qué horario. Si hay varias citas activas, devuelve la lista; el agente no elige. Si el correo falla, `exito_parcial` + `aviso` (el horario sí quedó). |
| `cancelar_cita` | Escritura sensible | **Nueva (27 de agosto).** Llama a `cancelarCita`. Misma identificación y misma regla de ambigüedad. Si el correo falla, lo dice; la cita sigue cancelada. |

**Rediseño del 12 de agosto — `Quiere Citas 1a1` y filtro de Giro:** el campo `Quiere Citas 1a1` pasó de checkbox a `select` (`Sí` / `No` / vacío) porque un checkbox no puede distinguir "nunca contestó" de "contestó que no". Decisión de Laura (demo 11-ago): se excluye solo `'No'` explícito; vacío histórico entra. Además, `buscarAsistentesCandidatos` filtra por Giro/Industria — solo Marca de moda, Retailer/tienda multimarca y Manufactura (aplica también a VIP). Mismo día se agregó `Calendario Google ID` por sponsor (multi-calendario) y se cargaron 29 asistentes reales que faltaban de la importación original de Ticketópolis.

**Tamaño, Área, Soluciones y Speaker (8-sep):** `Tamaño de Negocio` es `rich_text`; el parser conserva lectura dual de `rich_text`/`select` durante la transición y clasifica por prefijo Grande/Mediana/Pequeña/Micro sin distinguir acentos. Un tamaño declarado entra solo si el sponsor lo eligió en `Etapa Cliente Buscada`. El ranking premia Grande **+100**, Mediana **+70**, Pequeña **+50**, Micro **+30**. Consolidado Exa +80 y PyME +40 se acumulan aunque ya haya tamaño declarado; sin tamaño nuevo, Exa sigue siendo el filtro de Capa 1. `Speaker` y `Presencial VIP` saltan únicamente este filtro de tamaño. Área es filtro duro si el sponsor llenó `Puestos Buscados`: coincidencia exacta entra y suma +40; vacía/`Otro` entra como dato desconocido sin puntos; una conocida distinta queda fuera, también para VIP/Speaker. Soluciones: filtro duro de ≥1 coincidencia real (`Otro` no cuenta). Sponsor vacío o solo `Otro` deja el pool en 0 salvo oro molido; el asistente vacío también queda fuera. Oro molido (+1000, no se multiplica) salta tamaño, área y soluciones. Las `Notas` abren con la vía de entrada de tamaño y ya no incluyen la cuota cambiante.

**Rediseño del 9 de agosto — de dónde salió `aprobar_match`:** el campo `Match Aprobado` (checkbox único por sponsor) no distinguía CUÁL de varios candidatos sugeridos había sido aprobado — un hueco de diseño que se volvió real en cuanto `Citas Minimas Prometidas` se confirmó como variable por sponsor (un sponsor con cuota de 4+ tiene 4+ candidatos sugeridos, no 1). La tabla `Citas` ya tenía la forma correcta (una fila por par sponsor-asistente), así que se extendió su `Estatus` con `Sugerido` y `Aprobado` como los dos primeros pasos del ciclo de vida, antes de `Pendiente Calendar`. `Match Sugerido` (relation en el sponsor) queda en desuso a partir de este cambio — se conserva en el schema por historial, pero ningún código nuevo lo escribe.

**`modificar_cita` y `cancelar_cita` se exponen como MCP (27-ago)** para Laura/Liz y el agente de Carlos, llamando al mismo `booking.service.js` que REST. Las descripciones exigen confirmación explícita de cuál cita y qué cambio — más estricto que `aprobar_match`. Si hay ambigüedad, la tool responde `VARIAS_CITAS_ACTIVAS` con la lista; el agente pregunta, no elige. **`reservar_cita` sigue fuera del MCP.**

**Google Calendar propio se retiró el 27-ago (Adler).** Nadie del equipo lo consultaba; Notion ya era adonde todos iban, y el `.ics` cubre el calendario personal del sponsor. `calendar-client.service.js` ya no existe. Los campos `Google Event ID` (Citas) y `Calendario Google ID` (Contactos) quedan en el schema por historial; el código nuevo no los escribe ni los exige. `sponsor_calendario_id` en `POST /citas/reservar` se ignora si llega, para no romper clientes viejos.

**Excepción Meet virtual (10-sep, Adler; reagenda 11-sep):** Calendar no vuelve a arbitrar citas. Un Apps Script en `rp@fashiondigitaltalks.com` genera **solo** la sala Meet 15 min antes para asistentes Virtual. El id de Calendar combina la fila de Notion y el horario de inicio: reintentar el mismo horario reusa la sala, pero reagendar limpia los campos de Meet y genera una sala nueva para la nueva ocurrencia. El evento anterior no se reutiliza. Campos en Citas: `Google Meet Event ID` / URL / intentos. Despliegue: [apps-script/meet-citas-virtuales/README.md](apps-script/meet-citas-virtuales/README.md).

**Citas conversacionales (Laura, 27-ago; canceladas 7-sep):** el asistente agenda, reagenda y cancela hablando, sin botones ni WhatsApp Flow. Al ofrecer sponsors el agente nombra **como máximo 4**; horarios y citas a elegir, **como máximo 3**. Reagendar una confirmada usa `modificar_cita`; reagendar una cancelada crea una cita nueva con `reservar_cita`, `cita_origen_cancelada_id` e idempotencia `wa:reagenda:<citaId>:<inicio>`. La cancelada se conserva y solo puede consumirse una vez; además el backend rechaza un segundo compromiso activo del mismo par aunque se omita el origen. `reservar_cita` sigue fuera del MCP. Ver [`contrato-citas-conversacionales.md`](contrato-citas-conversacionales.md).

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
  - `CITAS_MARGEN_MODIFICACION_MINUTOS=5` — mismo umbral al **ofrecer** (disponibilidad, MCP, Flow, casillas) y al **escribir** (`/citas/reservar` y `/citas/modificar-cita`). A las 11:04 las 11:00 siguen válidas; a las 11:06 no.
  - ⚠️ Underscores en la fecha del Name (`2026_10_07`), no guiones. Coolify no inyecta env vars cuyo Name lleva `-` (confirmado 14-ago: la UI las mostraba pero el proceso respondía 503). El query param `fecha` del API sigue con guiones (`2026-10-07`).
- **SMTP / correo de confirmación** (18-ago) — mismos valores en local y Coolify:
  - `EMAIL_SMTP_HOST` / `EMAIL_SMTP_PORT` (Gmail: `smtp.gmail.com` / `587`)
  - `EMAIL_SMTP_USER`, `EMAIL_SMTP_APP_PASSWORD` (App Password; se puede pegar con espacios cada 4 letras)
  - `EMAIL_FROM_NAME` (default `Fashion Digital Talks`)
  - No hay `EMAIL_MAX_INTENTOS`: 3 SMTP inmediatos por envío (no cuentan en Notion); el reenvío a demanda no tiene tope.
- **Meet virtual (10-sep):** `MEET_VIRTUAL_HABILITADO=false` (string exacto `true` para encender). `MEET_VIRTUAL_APPS_SCRIPT_URL` (Web App `/exec`), `MEET_VIRTUAL_SECRET` (mismo valor en Script Properties). `PLATICA_TEMPLATE_CITA_15MIN_VIRTUAL=recordatorio_15min_antes_virtual` (`{{1}}` nombre, `{{2}}` empresa, `{{3}}` link Meet). La App Password de Gmail **no** sirve para Calendar. El Meet lo dispara el **mismo** cron de 15 min; no hay cron extra.
- **Campañas de matchmaking**:
  - `NOTION_CAMPANAS_WEBHOOK_SECRET` — secret propio del botón/webhook de Notion.
  - Defaults seguros: `CAMPANAS_MATCHMAKING_MODO_SIMULACION=true` y `CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO=false`.
  - El envío real exige cuatro envs: `PLATICA_TEMPLATE_OFERTA_INICIAL_1`…`_4`, configuradas como `agendar_cita_inicial_aprobado_1`…`_4` (aprobadas 9-sep). El backend elige la plantilla según haya 1, 2, 3 o 4 sponsors. `{{1}}` = **primer nombre** capitalizado (`primerNombreParaSaludo`); cada variable siguiente contiene un sponsor en formato `1. Marco Trujillo de la empresa Platica.mx, expertos en Omnichannel · CRM / Automatización`. Los saltos entre sponsors están en el cuerpo fijo aprobado, nunca dentro del parámetro. El representante sigue siendo nombre + apellido paterno; las soluciones son **todas** las coincidencias de `Solucion` con `Soluciones Buscadas`, sin `Otro`. Si no hay intersección por registro legacy se usan las ofrecidas; sin soluciones queda solo persona/empresa. `payloadPara` elimina saltos, tabs y espacios repetidos de cada variable. El cuerpo conserva el tope de **1024 caracteres**: primero todas las coincidencias y, si no caben, baja el tope por sponsor de una en una hasta dejar solo nombres; como último recurso suelta al sponsor de menor score y cambia a la plantilla de menor cantidad.
  - La plantilla **ya no lleva horarios**: los ofrece el agente en la conversación con `consultar_disponibilidad_cita`, que revalida contra Notion en ese momento. El disparo tampoco consulta disponibilidad ni carga el índice de citas confirmadas.
  - La oferta inicial solo se envía a un contacto sin `Última Campaña Enviada`. B, C1 y C2 siguen fuera del flujo activo; las reactivaciones automáticas son el follow-up 72h y el last call descritos abajo.
  - Tener al menos un sponsor sugerido basta para enviar. **Hasta el 28-ago** se saltaba con `SIN_HORARIOS_SUGERIDOS` a quien no tuviera ningún bloque libre en ese instante; ese filtro se quitó (decisión de Adler) porque dejaba sin oferta a gente con buenos matches.
  - Envío real marca `Estado Envío Campaña=En curso` **antes** de WhatsApp; éxito → `Enviada` + checkbox `Campaña Enviada`; fallo de plantilla → `Falló`. Un `En curso` de más de 10 minutos se reintenta. `soloMarcar` pasa directo a `Enviada`. Simulación no escribe Notion.
  - **Follow-up 72h:** `PLATICA_TEMPLATE_FOLLOWUP_72H=followup_72hrs`, `FOLLOWUP_72H_MODO_SIMULACION=true`, `FOLLOWUP_72H_ENVIO_REAL_HABILITADO=false`, `FOLLOWUP_72H_DESDE=2026-10-05T09:30` (hora de México; si no trae zona se asume `-06:00`). El cron cada 15 min no toca Notion ni Plática hasta esa hora (`VENTANA_NO_CUMPLIDA`); después manda a quien ya recibió `Oferta inicial`, no contestó y no tiene cita, solo lun–vie 09:00–18:00. Ya no hay espera de 72 horas naturales. `PLATICA_WORKSPACE_ID`, `PLATICA_CHANNEL_ID=wb-1167456423128610` (Adler, 4-sep) y `PLATICA_WEBHOOK_SECRET` fijan y autentican el webhook `message.created`. `PLATICA_RESPONDER_AGENT_ID=c1IYnFsr0Jzfqq4NeLAs` viaja en cada plantilla para que el Agente 2 reciba las respuestas cuando Plática desacople canal y agente. Cualquier `incoming` posterior a `Fecha Última Campaña` marca `Respondió Oferta Inicial`; el cron vuelve a leer todas las conversaciones del teléfono/canal para cubrir webhooks perdidos. Omite `Confirmada`, `Confirmada sin notificar`, `Pendiente Calendar` y `Completada`. Estado en Contactos: `Estado Follow-up 72h` (`En curso`/`Enviado`/`Falló`) + `Fecha Follow-up 72h`; un `En curso` vencido se reconcilia contra el mensaje saliente antes de reintentar.
  - **Last call:** `PLATICA_TEMPLATE_LASTCALL=lastcall_cita1a1`, `LASTCALL_MODO_SIMULACION=true`, `LASTCALL_ENVIO_REAL_HABILITADO=false`, `LASTCALL_DESDE=2026-10-06T09:30`. Cron **nuevo** cada 15 min a `POST /matchmaking/enviar-lastcall` (`X-API-Key`). Hasta las 09:30 del 6-oct (`America/Mexico_City`) responde `VENTANA_NO_CUMPLIDA`. Después, lun–vie 09:00–18:00, manda a quien ya tenga `Oferta inicial` y no tenga cita activa. Haber respondido no excluye. `Cancelada` no cuenta como activa. `{{1}}` es el primer nombre; no hay lista de sponsors. Estado: `Estado Lastcall` + `Fecha Lastcall`; mismo reclamo `En curso` (10 min) y reconciliación contra el outgoing de Plática. `Reactivaciones Enviadas` también incrementa al éxito. Sin overrides en el body.
  - **Recordatorio del evento** (`POST /matchmaking/enviar-recordatorio-evento`, `X-API-Key`): pensado para cron diario en Coolify. Hasta 14 días antes del primer día de `CITAS_FECHAS_EVENTO` (7-oct-2026) responde `VENTANA_NO_CUMPLIDA` y no toca nada. Después procesa una vez por contacto (`Recordatorio Evento Enviado`). Quien nunca interactuó (filas en `Sugerido`/`Aprobado`/`Rechazado`) recibe `PLATICA_TEMPLATE_RECORDATORIO_EVENTO`. Quien ya tiene `Confirmada` / `Confirmada sin notificar` / `Pendiente Calendar` / `Completada` no recibe WhatsApp; en envío real se marca el checkbox. Sin filas en `Citas` queda fuera. Simulación no escribe. No hay tool MCP.
  - **Antes del primer envío real** (una vez por ambiente): revisar la vista Notion `Solo Aprobados`. Lo que sí deba recibir WhatsApp en ese primer disparo no debe estar `Aprobado`. Luego `node scripts/one-shots/marcar-cola-sin-enviar.js --confirmar`. El script muestra los títulos reales de Citas/Contactos del `.env` activo y el tamaño de la cola; hay que escribir el nombre de Citas tal cual para seguir. Marca toda la cola como oferta inicial procesada, **no** llama a Plática. No es REST ni MCP. No es una prueba repetible.

## Por qué un repo separado (no una app más sobre `platica-google-docs-api`)
1. **Separación de responsabilidades** — ese repo es la capa genérica de Google para todos los clientes de Plática. Las reglas de negocio de un evento específico (pesos de matchmaking, requisitos de checklist) no son su lugar natural.
2. **Concurrencia** — `booking.service.js` depende de un mutex en memoria de un solo proceso. Compartir servidor con otro servicio cuya política de réplicas no controlas directamente es un riesgo real de que la protección se rompa en silencio.
3. Google Calendar propio se retiró el 27-ago: ya no hay llamada HTTP a ese repo desde aquí. Meet virtual (10-sep) usa Apps Script en `rp@fashiondigitaltalks.com`, no `googleapis` ni `calendar-client.service.js`.

## Cómo correr las pruebas manuales
No hay suite automatizada con Jest todavía — son scripts que se corren a mano y muestran resultado en consola, usando datos reales de los contactos de ejemplo en Notion con las llamadas de escritura simuladas:

```bash
node tests/matchmaking.manual-test.js
node tests/tamano-negocio.manual-test.js
node tests/area-puestos.manual-test.js
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
node tests/perfil-platica.manual-test.js
node tests/horarios-oferta.manual-test.js
node tests/recordatorio-evento.manual-test.js
node tests/recordatorio-cita-15min.manual-test.js
node tests/google-meet-virtual.manual-test.js
node tests/recordatorio-cita-2h.manual-test.js
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
- ~~Confirmar con Laura: lista final de `Nivel de Patrocinio` y tabla de equivalencia de `Etapa de Negocio` ↔ `Etapa Cliente Buscada`.~~ **28-ago:** Etapa de Negocio dejó de filtrar. **2-sep:** `Etapa Cliente Buscada` pasó a guardar tamaños buscados (`Grande`, `Mediana`, `Pequeña`, `Micro`). **4-sep:** el backend ya cruza esa selección contra candidatos con `Tamaño de Negocio` nuevo; registros legacy siguen por Madurez Exa.
- ~~El shape exacto de la respuesta de `/calendar/crear-evento`~~ — verificado el 22 de julio; **irrelevante desde el 27-ago** (Calendar propio retirado).
- Envío de alertas por WhatsApp (checklist y prospección) — no construido, es integración aparte.
- Confirmar con Laura: ¿última cita del miércoles puede ser `18:30–19:00` (toca el cierre del horario de citas) o hay que cortar antes? Mismo análisis jueves (`17:30–18:00`). Ver Caso 4c de `tests-disponibilidad`.
- Restaurar emails reales de sponsors/asistentes en Notion (backups en `tests/_emails-*-backup-*.json`) cuando terminen las pruebas de SMTP.
- Allowlist de destinatarios SMTP como regla en `.cursor/rules/architecture.mdc` (aún no escrita; la práctica ya es abortar si hay correo externo).

## Bugs reales encontrados y corregidos

Documentados aquí porque afectaban tanto a rutas REST como a las herramientas MCP correspondientes — no eran exclusivos de una capa:

- **`Match Aprobado` no distinguía candidato individual** (9 de agosto): era un checkbox único por sponsor; con un sponsor teniendo varios candidatos sugeridos a la vez (confirmado con datos reales: 7 sponsors de prueba con Match Sugerido de 2+ candidatos cada uno), no había forma de decir "el match con Ana está aprobado pero el de Carlos no". Resuelto extendiendo `Citas` con estados `Sugerido`/`Aprobado` en vez de parchar el checkbox — ver sección MCP arriba.
- **`sugerir_matches_global` fallaba por timeout con datos reales** (10 de agosto): la función original llamaba a `existeCitaActivaEntre` (una petición HTTP a Notion) **una vez por cada candidato evaluado**, dentro de un loop por cada sponsor. Con 8 sponsors reales y ~15-20 candidatos elegibles cada uno, eran ~130-150 llamadas HTTP secuenciales en una sola invocación — más de 40-100 segundos incluso en el mejor caso, muy por encima de cualquier timeout razonable de un tool call MCP. Corregido trayendo, una sola vez al inicio de `sugerirMatchesGlobal`, la lista completa de pares (sponsor, asistente) con cita activa — con paginación real, no asumida — y consultándola en memoria. El 10-sep el pool de asistentes también se pagina (antes cortaba en 100) y se carga una vez en el global; el camino de un solo sponsor dejó de preguntar cita activa por candidato. `notionFetch` reintenta HTTP 429.
- **`Quiere Citas 1a1` excluía en silencio a históricos vacíos** (12 de agosto): el post-filtro exigía `quiereCitas1a1 === true` cuando el campo aún era checkbox. En Notion un checkbox no distingue "nunca contestó" de "contestó que no" (ambos = `false`), así que ~28 de 55 asistentes del CSV real de Ticketópolis quedaban fuera del matchmaking sin error visible. Laura (demo 11-ago): *"yo descartaría a los que expresamente te pusieron no"*. Corregido: el campo pasó a `select` (`Sí`/`No`/vacío) y el código excluye solo `'No'` explícito.
- **Filtro de Giro/Industria faltante en Capa 1** (12 de agosto): Laura confirmó en la demo del 11-ago que sponsors (proveedores de servicios) solo deben verse con Marca de moda, Retailer/tienda multimarca y Manufactura — "todo lo demás, no me interesa que tengan citas". Se agregó el filtro en `buscarAsistentesCandidatos` (aplica también a VIP). Verificado con 5 casos contra Notion real, incluyendo contactos FICTICIO para vacío+giro no elegible.
- **`calendarioGoogleId` no salía en los returns de las tools** (13 de agosto): el campo ya se leía de Notion en `parseContacto` (multi-calendario del 12-ago) pero `consultarChecklist` y `sugerirMatchesParaSponsor` no lo exponían — el agente pedía `sponsor_calendario_id` al usuario al reservar (Caso 5, `bitacora-verificacion-12ago.md`). Corregido agregándolo a ambos returns; no hizo falta ajustar prompt. `sugerirMatchesGlobal` no se tocó (su reporte de solapamientos no es el camino de `reservar_cita`).
- **Anidamiento de filtros de Notion en `buscarAsistentesCandidatos`** (`contactos.service.js`): el filtro tenía 3 niveles de anidamiento (`and`→`or`→`and`); Notion solo soporta 2. Bloqueaba matchmaking para *cualquier* sponsor, no un caso aislado. Corregido moviendo una condición a post-filtrado en JavaScript.
- **`escribirEnNotion` con default divergente/ausente** entre `sugerirMatchesParaSponsor` (default `true` en el service vs. `false` ya usado en MCP) y `sugerirMatchesGlobal` (hardcodeado en `true`, sin opción de dry-run en absoluto). Ambos homologados a default `false`; los endpoints REST correspondientes se ajustaron para pasar `true` explícito y preservar su comportamiento ya probado.
- **Guardar sugerencias era todo-o-nada** (19 de agosto): `escribirEnNotion=true` escribe el topN completo; el agente no tenía forma de persistir un par. Además `sugerirMatchesGlobal` armaba solapamientos sin `explicacion`/`detalle` y no devolvía el ranking por sponsor, así que el “por qué” del match aparecía a veces sí y a veces no. Corregido con `guardarSugerenciaIndividual` (recalcula y valida el par; una fila `Sugerido`) y haciendo viajar explicación/detalle en ranking + solapamientos. Verificado en conversación real post-redeploy.
