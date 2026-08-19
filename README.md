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
├── services/
│   ├── citas.service.js              # Queries/escrituras sobre `Citas` — flujo Sugerido→Aprobado (9-ago); caché de pares con cita activa (10-ago); GET disponibilidad reusa sponsorOcupado/contarCitas (14-ago)
│   ├── contactos.service.js          # Queries/escrituras sobre `Contactos` — filtro Giro/Industria + fix Quiere Citas 1a1 (select Sí/No/vacío) + calendarioGoogleId (12-ago)
│   ├── booking.service.js            # Orquesta la reserva (mutex + patrón de rollback)
│   ├── matchmaking.service.js        # Capa 1 (filtros duros) + Capa 2 (ranking) — sugerirMatchesGlobal usa caché de citas activas desde el 10-ago, ver sección Bugs
│   ├── checklist.service.js          # Evaluación de completitud Sponsor/Speaker
│   └── calendar-client.service.js    # Llama por HTTP a platica-google-docs-api
├── mcp/
│   ├── server.js                     # Define herramientas MCP — capa delgada sobre services/, no reimplementa lógica
│   └── mount.js                      # Monta POST /mcp en modo stateless (Streamable HTTP)
└── utils/
    └── notion-client.js              # Cliente REST de Notion compartido

tests/
├── matchmaking.manual-test.js        # Corre contra datos reales con mocks inyectados
├── matchmaking-global.manual-test.js # Escenario de solapamiento (Diamante vs Oro)
├── checklist.manual-test.js
├── aprobar-match.manual-test.js      # Caso feliz + límite de aprobarMatch (9-ago)
├── global-cache-citas.manual-test.js # Fix timeout de sugerirMatchesGlobal (10-ago)
├── disponibilidad.local-smoke.js     # Smoke local 4/4b/4c de GET /citas/disponibilidad (sin Notion)
└── mocks/                            # Mocks usados por los scripts de prueba manual

scripts/one-shots/                    # Scripts one-shot ya ejecutados — no volver a correr sin revisar
├── cargar-29-asistentes-faltantes.js # Cargó 29 asistentes reales faltantes (12-ago)
└── verificar-casos-quiere-citas-giro.js # Los 5 casos del fix Quiere Citas 1a1 + Giro (12-ago)
```

## Endpoints

Todos requieren header `X-API-Key` (excepto `/health`). Body en JSON. Los GET con query params son de solo lectura: `/checklist/consultar` y `/citas/disponibilidad`.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/health` | Sin auth. Para monitoreo de Coolify. |
| POST | `/citas/reservar` | Reserva una cita 1a1 con protección de concurrencia (mutex + Notion como árbitro). |
| GET | `/citas/disponibilidad?sponsor_notion_id=...&fecha=YYYY-MM-DD` | **Nueva (14 de agosto).** Solo lectura — lista de bloques de 30 min del día con `disponible` / `motivo` (`SPONSOR_YA_OCUPADO` \| `CAPACIDAD_MESAS_LLENA` \| `null`). Para el formulario de horarios (WhatsApp Flow / botones / mini web app). Reusa `sponsorOcupadoEnBloque` y `contarCitasEnBloque` — no reimplementa reglas. **No reemplaza** `POST /citas/reservar` (es una foto del momento; la reserva sigue siendo la fuente de verdad). Sin variables de horario en el ambiente → `503` a propósito, nunca inventa bloques. |
| POST | `/matchmaking/sponsors/:sponsorId/sugerir-matches` | Corre Capa 1 + Capa 2 para un sponsor. Con escritura activa, crea una fila `Sugerido` en `Citas` por candidato (ya NO escribe en `Match Sugerido`, en desuso desde el 9 de agosto — ver sección MCP). |
| POST | `/matchmaking/sugerir-todos` | Corre matchmaking para todos los sponsors activos, detecta solapamientos (mismo asistente sugerido para más de uno). |
| GET | `/checklist/consultar?nombre=...` | Consulta bajo demanda — "cómo va fulano". |
| POST | `/checklist/revisar-pendientes` | Barrido completo, pensado para dispararse desde un Cron Job de Coolify. |

**Nota sobre los GET de solo lectura:** el resto del repo de Google usa solo POST/PATCH/DELETE por convención (no por limitación técnica). Aquí se dejaron como GET porque son consultas de solo lectura y son más simples de probar/cachear — si quieres uniformidad total con el otro repo, se pueden cambiar a POST sin problema.

**Horario de `GET /citas/disponibilidad` (confirmado Laura, 14-ago):** miércoles 7-oct `10:30–19:00`, jueves 8-oct `09:00–18:00`, bloques de 30 min, offset `-06:00`. Se configura **por fecha** vía env (no hardcodeado) — ver Variables de entorno. Pendiente con Laura: si el último bloque del miércoles (`18:30–19:00`, que topa el cierre) está bien o hay que cortar antes; mismo análisis jueves (`17:30–18:00`).

## MCP

Además de los endpoints REST de arriba, este servicio expone un servidor **MCP** (Model Context Protocol) en `POST /mcp` — mismo `X-API-Key` que el resto de rutas, mismo `authMiddleware`. Transporte Streamable HTTP, modo stateless (`sessionIdGenerator: undefined`).

Las herramientas MCP no reimplementan lógica: llaman a los mismos `services/` que usan las rutas REST. Es una capa de presentación delgada (`src/mcp/server.js`), pensada para que un agente conversacional (el agente de Plática) invoque esta lógica en lenguaje natural sin tener que reimplementar reglas de negocio en su prompt.

| Herramienta | Tipo | Qué hace |
|---|---|---|
| `consultar_checklist` | Lectura | Qué le falta a un sponsor/speaker por nombre aproximado. Desde el 13-ago el `contacto` del return incluye `calendarioGoogleId` (multi-calendario) — vacío/`null` si el sponsor aún no tiene calendario |
| `revisar_checklists_pendientes` | Lectura + escribe estado | Barrido completo de checklist de todos los activos |
| `sugerir_matches_para_sponsor` | Escritura acotada | Matchmaking para un sponsor específico. `escribirEnNotion` default `false` (dry-run) — con `true`, crea una fila `Sugerido` en `Citas` por candidato. Capa 1 incluye filtro de Giro/Industria (solo Marca de moda, Retailer, Manufactura) y excluye Presencial solo si `Quiere Citas 1a1 = 'No'` (12-ago). El objeto `sponsor` del return incluye `calendarioGoogleId` desde el 13-ago |
| `guardar_sugerencia_individual` | Escritura acotada | Guarda únicamente el par sponsor-asistente elegido de un resultado previo individual/global. Recalcula elegibilidad, score y explicación en backend; crea una sola fila `Sugerido`, nunca el bloque completo |
| `sugerir_matches_global` | Escritura acotada, masiva | Matchmaking para todos los sponsors activos, detecta solapamientos y devuelve el ranking por sponsor con `explicacion`/`detalle` en cada match. Mismo patrón dry-run que la anterior. **Corregido el 10-ago** — antes fallaba por timeout con datos reales (ver sección Bugs), ahora carga la lista de citas activas una sola vez en vez de consultar Notion por cada candidato |
| `aprobar_match` | Escritura acotada | **Nueva (9 de agosto).** Marca como `Aprobado` una fila de `Citas` ya en estado `Sugerido`, dado un par (sponsorPageId, asistentePageId). Verifica que la fila exista antes de aprobar — nunca aprueba a ciegas ni crea una fila nueva. No crea ninguna cita real ni toca Calendar (eso sigue siendo exclusivo de `reservar_cita`) |
| `reintentar_notificaciones_pendientes` | Escritura acotada, masiva | Reenvía a demanda correo/ICS para todas las citas `Confirmada sin notificar`; sin parámetros y sin tope de llamadas |

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
# Verificación contra Notion real de los 5 casos Quiere Citas 1a1 + Giro (12-ago):
node scripts/one-shots/verificar-casos-quiere-citas-giro.js
```

## Pendientes conocidos (no bloquean el primer deploy, sí producción estable)
- Cron de reconciliación para citas que quedan en "Pendiente Calendar" por un crash a media ejecución.
- Confirmar con Laura: lista final de `Nivel de Patrocinio` y tabla de equivalencia de `Etapa de Negocio` ↔ `Etapa Cliente Buscada` (ver `matchmaking-spec-fdt.md`).
- ~~El shape exacto de la respuesta de `/calendar/crear-evento`~~ — **verificado el 22 de julio con una reserva real de punta a punta** (mutex → Notion → Calendar → Notion confirmado), contra el calendario "Prueba FDT" y el cliente_id `adler-calvillo`. `evento_id` sí viene donde se esperaba.
- Envío de alertas por WhatsApp (checklist y prospección) — no construido, es integración aparte.
- Confirmar con Laura: ¿última cita del miércoles puede ser `18:30–19:00` (toca el cierre del horario de citas) o hay que cortar antes? Mismo análisis jueves (`17:30–18:00`). Ver Caso 4c de `tests-disponibilidad`.
- Tests manuales Notion de `GET /citas/disponibilidad` (casos 1–3, 5–7) — correr después de cargar env en Coolify + redeploy.

## Bugs reales encontrados y corregidos

Documentados aquí porque afectaban tanto a rutas REST como a las herramientas MCP correspondientes — no eran exclusivos de una capa:

- **`Match Aprobado` no distinguía candidato individual** (9 de agosto): era un checkbox único por sponsor; con un sponsor teniendo varios candidatos sugeridos a la vez (confirmado con datos reales: 7 sponsors de prueba con Match Sugerido de 2+ candidatos cada uno), no había forma de decir "el match con Ana está aprobado pero el de Carlos no". Resuelto extendiendo `Citas` con estados `Sugerido`/`Aprobado` en vez de parchar el checkbox — ver sección MCP arriba.
- **`sugerir_matches_global` fallaba por timeout con datos reales** (10 de agosto): la función original llamaba a `existeCitaActivaEntre` (una petición HTTP a Notion) **una vez por cada candidato evaluado**, dentro de un loop por cada sponsor. Con 8 sponsors reales y ~15-20 candidatos elegibles cada uno, eran ~130-150 llamadas HTTP secuenciales en una sola invocación — más de 40-100 segundos incluso en el mejor caso, muy por encima de cualquier timeout razonable de un tool call MCP. Por eso `sugerir_matches_para_sponsor` (1 sponsor, ~15-20 llamadas) siempre funcionó bien mientras la versión global fallaba consistentemente. Corregido trayendo, una sola vez al inicio de `sugerirMatchesGlobal`, la lista completa de pares (sponsor, asistente) con cita activa — con paginación real, no asumida — y consultándola en memoria en vez de volver a golpear Notion por cada candidato. Esto bajó el número de llamadas HTTP de ~130-150 a un puñado. `sugerir_matches_para_sponsor` individual no cambió su comportamiento — el volumen ahí nunca fue el problema.
- **`Quiere Citas 1a1` excluía en silencio a históricos vacíos** (12 de agosto): el post-filtro exigía `quiereCitas1a1 === true` cuando el campo aún era checkbox. En Notion un checkbox no distingue "nunca contestó" de "contestó que no" (ambos = `false`), así que ~28 de 55 asistentes del CSV real de Ticketópolis quedaban fuera del matchmaking sin error visible. Laura (demo 11-ago): *"yo descartaría a los que expresamente te pusieron no"*. Corregido: el campo pasó a `select` (`Sí`/`No`/vacío) y el código excluye solo `'No'` explícito.
- **Filtro de Giro/Industria faltante en Capa 1** (12 de agosto): Laura confirmó en la demo del 11-ago que sponsors (proveedores de servicios) solo deben verse con Marca de moda, Retailer/tienda multimarca y Manufactura — "todo lo demás, no me interesa que tengan citas". Se agregó el filtro en `buscarAsistentesCandidatos` (aplica también a VIP). Verificado con 5 casos contra Notion real, incluyendo contactos FICTICIO para vacío+giro no elegible.
- **`calendarioGoogleId` no salía en los returns de las tools** (13 de agosto): el campo ya se leía de Notion en `parseContacto` (multi-calendario del 12-ago) pero `consultarChecklist` y `sugerirMatchesParaSponsor` no lo exponían — el agente pedía `sponsor_calendario_id` al usuario al reservar (Caso 5, `bitacora-verificacion-12ago.md`). Corregido agregándolo a ambos returns; no hizo falta ajustar prompt. `sugerirMatchesGlobal` no se tocó (su reporte de solapamientos no es el camino de `reservar_cita`).
- **Anidamiento de filtros de Notion en `buscarAsistentesCandidatos`** (`contactos.service.js`): el filtro tenía 3 niveles de anidamiento (`and`→`or`→`and`); Notion solo soporta 2. Bloqueaba matchmaking para *cualquier* sponsor, no un caso aislado. Corregido moviendo una condición a post-filtrado en JavaScript.
- **`escribirEnNotion` con default divergente/ausente** entre `sugerirMatchesParaSponsor` (default `true` en el service vs. `false` ya usado en MCP) y `sugerirMatchesGlobal` (hardcodeado en `true`, sin opción de dry-run en absoluto). Ambos homologados a default `false`; los endpoints REST correspondientes se ajustaron para pasar `true` explícito y preservar su comportamiento ya probado.
