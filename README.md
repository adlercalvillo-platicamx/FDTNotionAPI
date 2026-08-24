# fdt-notion-api

Backend de citas 1a1, matchmaking y checklist para **Fashion Digital Talks 2026** — Plática.mx.

Repo independiente de `platica-google-docs-api` (el de Ernesto/Adler para Google Docs/Sheets/Calendar). Este servicio **no duplica** ese código — le llama por HTTP cuando necesita Calendar. Ver razones en la sección "Por qué un repo separado" abajo.

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
│   ├── booking.service.js            # Reserva: mutex + mesa 1–11 + Calendar + correo/.ics (1 sola réplica Coolify)
│   ├── email.service.js              # ICS + SMTP (nodemailer); 3 reintentos inmediatos por envío
│   ├── matchmaking.service.js        # Capa 1 + Capa 2; guardarSugerenciaIndividual (19-ago); global con explicación
│   ├── campanas-matchmaking.service.js # Campañas A/B/C agrupadas por asistente; simulación por default
│   ├── checklist.service.js          # Evaluación de completitud Sponsor/Speaker
│   └── calendar-client.service.js    # Llama por HTTP a platica-google-docs-api — NUNCA duplicar google.service.js aquí
├── mcp/
│   ├── server.js                     # 9 herramientas MCP — capa delgada sobre services/
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
├── email-notificacion.manual-test.js # Confirmada vs Confirmada sin notificar + reenvío (18-ago)
├── titulos-empresa.manual-test.js     # Empresa×Empresa + texto multipart sin truncar (19-ago)
├── sugeridas-empresas.manual-test.js  # Empresas hidratadas + solo Sugerido/Aprobado (19-ago)
└── mocks/

scripts/one-shots/                    # Ya ejecutados — no volver a correr sin revisar
├── cargar-29-asistentes-faltantes.js
├── verificar-casos-quiere-citas-giro.js
└── marcar-cola-sin-enviar.js         # Transición: marca cola Aprobado sin WhatsApp (una vez, --confirmar)
```

## Endpoints

Todos requieren header `X-API-Key`, excepto `/health` y los endpoints `/webhooks/*`, que usan su autenticación propia. Body en JSON. Los GET con query params son de solo lectura: `/checklist/consultar` y `/citas/disponibilidad`.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/health` | Sin auth. Para monitoreo de Coolify. |
| POST | `/citas/reservar` | Reserva una cita 1a1 (mutex + Notion como árbitro). Asigna mesa 1–11 por orden de confirmación en el bloque; genera el título `Cita — Empresa asistente - Empresa sponsor`; crea el evento en Calendar; envía correo + `.ics` al sponsor (con datos del asistente) y al asistente (solo nombre de empresa del sponsor). Si el correo falla tras 3 SMTP inmediatos, la cita **sí queda creada** con Estatus `Confirmada sin notificar`. |
| GET | `/citas/sugeridas?whatsapp=...` | Solo lectura — identifica al asistente por teléfono (alias `telefono=`). `asistente_notion_id=` queda como fallback. Filas `Sugerido`/`Aprobado` hidratadas. Sin match → `404 CONTACTO_NO_RESUELTO`. |
| GET | `/citas/disponibilidad?sponsor_notion_id=...&fecha=YYYY-MM-DD` | **Nueva (14 de agosto).** Solo lectura — lista de bloques de 30 min del día con `disponible` / `motivo` (`SPONSOR_YA_OCUPADO` \| `CAPACIDAD_MESAS_LLENA` \| `null`). Para el formulario de horarios (WhatsApp Flow / botones / mini web app). Reusa `sponsorOcupadoEnBloque` y `contarCitasEnBloque` — no reimplementa reglas. **No reemplaza** `POST /citas/reservar` (es una foto del momento; la reserva sigue siendo la fuente de verdad). `Confirmada sin notificar` cuenta como ocupación. Sin variables de horario en el ambiente → `503` a propósito, nunca inventa bloques. |
| POST | `/webhooks/whatsapp-flows` | Data API del Flow de reserva del asistente. **Sin** `X-API-Key`; firma HMAC. Registrado en Plática (`whatsapp.flows.exchanges`). |
| POST | `/webhooks/notion/enviar-campanas-aprobadas` | Disparo manual de campañas para filas `Aprobado`, agrupadas por asistente. **Sin** `X-API-Key`; exige `X-Notion-Campanas-Secret`. Simulación por default. |
| POST | `/citas/reintentar-notificaciones-pendientes` | **Nueva (18 de agosto).** A demanda (no cron): reenvía correo/.ics de **todas** las citas `Confirmada sin notificar`. Sin tope de llamadas. 200 si hay éxitos (aunque mixto); 502 si todas fallan. El detalle trae categoría SMTP + mensaje. |
| POST | `/citas/:id/reenviar-notificacion` | Reenvía el par de correos de **una** cita. Misma semántica que el barrido. La ruta estática de arriba va **antes** de `/:id` a propósito. |
| POST | `/matchmaking/sponsors/:sponsorId/sugerir-matches` | Corre Capa 1 + Capa 2 para un sponsor. REST escribe el bloque (`escribirEnNotion` explícito `true`). MCP es dry-run por default; para **una** sugerencia usar la tool `guardar_sugerencia_individual` (no hay ruta REST equivalente). Ya NO escribe en `Match Sugerido` (desuso desde el 9 de agosto). |
| POST | `/matchmaking/sugerir-todos` | Corre matchmaking para todos los sponsors activos, detecta solapamientos y (desde 19-ago) devuelve ranking por sponsor con `explicacion`/`detalle` en cada match. |
| GET | `/checklist/consultar?nombre=...` | Consulta bajo demanda — "cómo va fulano". |
| POST | `/checklist/revisar-pendientes` | Barrido completo, pensado para dispararse desde un Cron Job de Coolify. |

**Reserva — mesa y correo (18 ago):** `CAPACIDAD_MAXIMA_MESAS = 11`. Mesa = citas ya ocupando ese bloque + 1. Cancelar/fallar no reordena mesas de las demás. Correos: apertura por **empresa** (`DINUS agendó un espacio con Infracommerce`). Destinatarios se resuelven desde Contactos. El UID del `.ics` es el page_id de Notion; `SEQUENCE` en reenvíos es un timestamp para que el calendario actualice, no duplique.

**Generación automática de sugerencias:** no hay scheduler dentro de Node. Configurar un cron HTTP externo cada 6 horas hacia `POST /matchmaking/sugerir-todos`, incluyendo `X-API-Key` desde un secret (nunca hardcodeado). Este cron solo crea `Sugerido`; no dispara WhatsApp.

**Títulos y presentación por empresa (19 ago):** las sugerencias se guardan como `Sugerido: Empresa asistente × Empresa sponsor`; una reserva confirmada usa `Cita — Empresa asistente - Empresa sponsor` en Notion, Calendar y correo. Si `Empresa` está vacía, el nombre de la persona es únicamente el fallback. El parser concatena todos los fragmentos `title`/`rich_text` de Notion para no truncar nombres o empresas multipart.

**Nota sobre los GET de solo lectura:** el resto del repo de Google usa solo POST/PATCH/DELETE por convención (no por limitación técnica). Aquí se dejaron como GET porque son consultas de solo lectura y son más simples de probar/cachear — si quieres uniformidad total con el otro repo, se pueden cambiar a POST sin problema.

**Horario de `GET /citas/disponibilidad` (confirmado Laura, 14-ago):** miércoles 7-oct `10:30–19:00`, jueves 8-oct `09:00–18:00`, bloques de 30 min, offset `-06:00`. Se configura **por fecha** vía env (no hardcodeado) — ver Variables de entorno. Pendiente con Laura: si el último bloque del miércoles (`18:30–19:00`, que topa el cierre) está bien o hay que cortar antes; mismo análisis jueves (`17:30–18:00`).

## MCP

Además de los endpoints REST de arriba, este servicio expone un servidor **MCP** (Model Context Protocol) en `POST /mcp` — mismo `X-API-Key` que el resto de rutas, mismo `authMiddleware`. Transporte Streamable HTTP, modo stateless (`sessionIdGenerator: undefined`).

Las herramientas MCP no reimplementan lógica: llaman a los mismos `services/` que usan las rutas REST. Es una capa de presentación delgada (`src/mcp/server.js`), pensada para que un agente conversacional (el agente de Plática) invoque esta lógica en lenguaje natural sin tener que reimplementar reglas de negocio en su prompt. Hoy son **9** tools MCP (+ `reservar_cita` como API REST en Plática, no en este servidor MCP).

| Herramienta | Tipo | Qué hace |
|---|---|---|
| `consultar_checklist` | Lectura | Qué le falta a un sponsor/speaker por nombre aproximado. Desde el 13-ago el `contacto` del return incluye `calendarioGoogleId` (multi-calendario) — vacío/`null` si el sponsor aún no tiene calendario |
| `consultar_sugeridas_para_asistente` | Lectura | Filas Citas `Sugerido`/`Aprobado`. Identificador principal: `whatsapp`. Devuelve empresa y nombre del asistente y del sponsor para presentar `Empresa asistente × Empresa sponsor`. |
| `revisar_checklists_pendientes` | Lectura + escribe estado | Barrido completo de checklist de todos los activos |
| `sugerir_matches_para_sponsor` | Escritura acotada | Matchmaking para un sponsor específico. `escribirEnNotion` default `false` (dry-run) — con `true`, crea una fila `Sugerido` en `Citas` por candidato. Capa 1 incluye filtro de Giro/Industria (solo Marca de moda, Retailer, Manufactura) y excluye Presencial solo si `Quiere Citas 1a1 = 'No'` (12-ago). El objeto `sponsor` del return incluye `calendarioGoogleId` desde el 13-ago |
| `guardar_sugerencia_individual` | Escritura acotada | **Nueva (19 de agosto).** Guarda únicamente el par sponsor-asistente elegido de un dry-run individual o global. Recalcula elegibilidad, score y explicación en backend; crea una sola fila `Sugerido`. Si el usuario pide varias, una llamada por par — no volver a correr `sugerir_matches_*` con `escribirEnNotion: true` (eso guarda el bloque completo). |
| `sugerir_matches_global` | Escritura acotada, masiva | Matchmaking para todos los sponsors activos, detecta solapamientos y devuelve el ranking por sponsor con `explicacion`/`detalle` en cada match (19-ago: antes los solapamientos perdían la explicación). Mismo patrón dry-run. **Corregido el 10-ago** — timeout por ~130 llamadas Notion; ahora carga pares activos una sola vez (ver Bugs) |
| `aprobar_match` | Escritura acotada | **Nueva (9 de agosto).** Marca como `Aprobado` una fila de `Citas` ya en estado `Sugerido`, dado un par (sponsorPageId, asistentePageId). Verifica que la fila exista antes de aprobar — nunca aprueba a ciegas ni crea una fila nueva. No crea ninguna cita real ni toca Calendar (eso sigue siendo exclusivo de `reservar_cita`) |
| `reintentar_notificaciones_pendientes` | Escritura acotada, masiva | Reenvía a demanda correo/ICS para todas las citas `Confirmada sin notificar`; sin parámetros y sin tope de llamadas |
| `disparar_campanas_aprobadas` | Escritura acotada, masiva | Procesa manualmente `Aprobado` sin campaña, agrupado por asistente. Simulación por default; el agente no puede habilitar envío real por parámetros. |

**Rediseño del 12 de agosto — `Quiere Citas 1a1` y filtro de Giro:** el campo `Quiere Citas 1a1` pasó de checkbox a `select` (`Sí` / `No` / vacío) porque un checkbox no puede distinguir "nunca contestó" de "contestó que no". Decisión de Laura (demo 11-ago): se excluye solo `'No'` explícito; vacío histórico entra. Además, `buscarAsistentesCandidatos` filtra por Giro/Industria — solo Marca de moda, Retailer/tienda multimarca y Manufactura (aplica también a VIP). Mismo día se agregó `Calendario Google ID` por sponsor (multi-calendario) y se cargaron 29 asistentes reales que faltaban de la importación original de Ticketópolis.

**Rediseño del 9 de agosto — de dónde salió `aprobar_match`:** el campo `Match Aprobado` (checkbox único por sponsor) no distinguía CUÁL de varios candidatos sugeridos había sido aprobado — un hueco de diseño que se volvió real en cuanto `Citas Minimas Prometidas` se confirmó como variable por sponsor (un sponsor con cuota de 4+ tiene 4+ candidatos sugeridos, no 1). La tabla `Citas` ya tenía la forma correcta (una fila por par sponsor-asistente), así que se extendió su `Estatus` con `Sugerido` y `Aprobado` como los dos primeros pasos del ciclo de vida, antes de `Pendiente Calendar`. `Match Sugerido` (relation en el sponsor) queda en desuso a partir de este cambio — se conserva en el schema por historial, pero ningún código nuevo lo escribe.

**`reservar_cita` deliberadamente NO se expone como herramienta MCP.** Crea un evento real en el calendario de un sponsor real, y la regla de negocio del cliente exige aprobación humana antes de ofrecer una cita — una herramienta que el agente pudiera invocar por una interpretación equivocada en conversación contradice esa regla directamente. En su lugar, `POST /citas/reservar` se conectó como herramienta de **API REST** directamente en la plataforma de Plática, con la instrucción explícita de invocarse solo tras aprobación humana.

## Variables de entorno
Ver `.env.example`. Resumen:
- `API_SECRET_KEY` — clave para llamar a ESTE servicio (propia, no la del repo de Google).
- `NOTION_API_KEY`, `NOTION_CONTACTOS_DATA_SOURCE_ID`, `NOTION_CITAS_DATA_SOURCE_ID`.
- `GOOGLE_API_BASE_URL`, `GOOGLE_API_KEY`, `GOOGLE_API_CLIENTE_ID` — para llamar HACIA `platica-google-docs-api`. `GOOGLE_API_CLIENTE_ID` requiere que la cuenta de Google de los sponsors ya esté conectada por OAuth en ese servicio (Adler lo maneja directamente, no es parte de este repo).
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
  - El envío real además exige las plantillas `PLATICA_TEMPLATE_MATCHMAKING_A/B/C1/C2` aprobadas en Meta (C1/C2: copy pendiente con Sam).
  - Tras A (o B perdida), el pool de reactivación rota C1→C2 con la misma ventana de 14 días y tope de 2 (`CAMPANAS_MATCHMAKING_REACTIVACIONES_MAXIMAS`, campo Notion `Reactivaciones Enviadas`). B solo se manda con cita confirmada viva; el tope no la bloquea.
  - Envío real marca `Estado Envío Campaña=En curso` **antes** de WhatsApp; éxito → `Enviada` + checkbox `Campaña Enviada`; fallo de plantilla → `Falló`. Un `En curso` de más de 10 minutos se reintenta. `soloMarcar` pasa directo a `Enviada`. Simulación no escribe Notion.
  - **Antes del primer envío real** (una vez por ambiente): revisar la vista Notion `Solo Aprobados`. Lo que sí deba recibir WhatsApp en ese primer disparo no debe estar `Aprobado`. Luego `node scripts/one-shots/marcar-cola-sin-enviar.js --confirmar`. El script muestra los títulos reales de Citas/Contactos del `.env` activo y el tamaño de la cola; hay que escribir el nombre de Citas tal cual para seguir. Misma decisión A/B/C, escribe `Campaña Enviada` / `Última Campaña Enviada`, **no** llama a Plática. No es REST ni MCP. No es una prueba repetible.

## Por qué un repo separado (no una app más sobre `platica-google-docs-api`)
1. **Separación de responsabilidades** — ese repo es la capa genérica de Google para todos los clientes de Plática. Las reglas de negocio de un evento específico (pesos de matchmaking, requisitos de checklist) no son su lugar natural.
2. **Concurrencia** — `booking.service.js` depende de un mutex en memoria de un solo proceso. Compartir servidor con otro servicio cuya política de réplicas no controlas directamente es un riesgo real de que la protección se rompa en silencio.
3. Nada de esto bloquea reusar el código de Calendar — se llama por HTTP (`calendar-client.service.js`), no se duplica.

## Cómo correr las pruebas manuales
No hay suite automatizada con Jest todavía — son scripts que se corren a mano y muestran resultado en consola, usando datos reales de los contactos de ejemplo en Notion con las llamadas de escritura simuladas:

```bash
node tests/matchmaking.manual-test.js
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
node tests/campanas-webhook.manual-test.js
node tests/marcar-cola-sin-enviar.manual-test.js
# Verificación contra Notion real de los 5 casos Quiere Citas 1a1 + Giro (12-ago):
node scripts/one-shots/verificar-casos-quiere-citas-giro.js
```

Pruebas SMTP reales contra Coolify: destinatarios **solo** en allowlist de prueba (`adler.calvillo@platica.mx`, `0257691@up.edu.mx`, `adlerero666@gmail.com`). Si `obtenerContacto` trae un correo externo → abortar. Nunca sponsor × sponsor para demos de cita 1a1.

## Pendientes conocidos (no bloquean el primer deploy, sí producción estable)
- Cron de reconciliación para citas que quedan en "Pendiente Calendar" por un crash a media ejecución.
- Confirmar con Laura: lista final de `Nivel de Patrocinio` y tabla de equivalencia de `Etapa de Negocio` ↔ `Etapa Cliente Buscada` (ver `matchmaking-spec-fdt.md`).
- ~~El shape exacto de la respuesta de `/calendar/crear-evento`~~ — **verificado el 22 de julio con una reserva real de punta a punta** (mutex → Notion → Calendar → Notion confirmado), contra el calendario "Prueba FDT" y el cliente_id `adler-calvillo`. `evento_id` sí viene donde se esperaba.
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
