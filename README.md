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
│   ├── citas.service.js              # Queries/escrituras sobre `Citas` en Notion — flujo Sugerido→Aprobado (9-ago); caché de pares con cita activa para evitar timeout en matchmaking global (10-ago)
│   ├── contactos.service.js          # Queries/escrituras sobre `Contactos` en Notion
│   ├── booking.service.js            # Orquesta la reserva (mutex + patrón de rollback)
│   ├── matchmaking.service.js        # Capa 1 (filtros duros) + Capa 2 (ranking) — sugerirMatchesGlobal usa caché de citas activas desde el 10-ago, ver sección Bugs
│   ├── checklist.service.js          # Evaluación de completitud Sponsor/Speaker
│   └── calendar-client.service.js    # Llama por HTTP a platica-google-docs-api
├── mcp/
│   ├── server.js                     # Define las 4 herramientas MCP — capa delgada sobre services/, no reimplementa lógica
│   └── mount.js                      # Monta POST /mcp en modo stateless (Streamable HTTP)
└── utils/
    └── notion-client.js              # Cliente REST de Notion compartido

tests/
├── matchmaking.manual-test.js        # Corre contra datos reales con mocks inyectados
├── matchmaking-global.manual-test.js # Escenario de solapamiento (Diamante vs Oro)
├── checklist.manual-test.js
└── mocks/                            # Mocks usados por los scripts de prueba manual
```

## Endpoints

Todos requieren header `X-API-Key` (excepto `/health`). Body en JSON, no hay `GET` con query params salvo `/checklist/consultar` (por conveniencia, ver nota abajo).

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/health` | Sin auth. Para monitoreo de Coolify. |
| POST | `/citas/reservar` | Reserva una cita 1a1 con protección de concurrencia (mutex + Notion como árbitro). |
| POST | `/matchmaking/sponsors/:sponsorId/sugerir-matches` | Corre Capa 1 + Capa 2 para un sponsor. Con escritura activa, crea una fila `Sugerido` en `Citas` por candidato (ya NO escribe en `Match Sugerido`, en desuso desde el 9 de agosto — ver sección MCP). |
| POST | `/matchmaking/sugerir-todos` | Corre matchmaking para todos los sponsors activos, detecta solapamientos (mismo asistente sugerido para más de uno). |
| GET | `/checklist/consultar?nombre=...` | Consulta bajo demanda — "cómo va fulano". |
| POST | `/checklist/revisar-pendientes` | Barrido completo, pensado para dispararse desde un Cron Job de Coolify. |

**Nota sobre `GET /checklist/consultar`:** el resto del repo de Google usa solo POST/PATCH/DELETE por convención (no por limitación técnica). Aquí se dejó como GET porque es una consulta de solo lectura y es más simple de probar/cachear — si quieres uniformidad total con el otro repo, se puede cambiar a POST sin problema.

## MCP

Además de los endpoints REST de arriba, este servicio expone un servidor **MCP** (Model Context Protocol) en `POST /mcp` — mismo `X-API-Key` que el resto de rutas, mismo `authMiddleware`. Transporte Streamable HTTP, modo stateless (`sessionIdGenerator: undefined`).

Las herramientas MCP no reimplementan lógica: llaman a los mismos `services/` que usan las rutas REST. Es una capa de presentación delgada (`src/mcp/server.js`), pensada para que un agente conversacional (el agente de Plática) invoque esta lógica en lenguaje natural sin tener que reimplementar reglas de negocio en su prompt.

| Herramienta | Tipo | Qué hace |
|---|---|---|
| `consultar_checklist` | Lectura | Qué le falta a un sponsor/speaker por nombre aproximado |
| `revisar_checklists_pendientes` | Lectura + escribe estado | Barrido completo de checklist de todos los activos |
| `sugerir_matches_para_sponsor` | Escritura acotada | Matchmaking para un sponsor específico. `escribirEnNotion` default `false` (dry-run) — con `true`, crea una fila `Sugerido` en `Citas` por candidato |
| `sugerir_matches_global` | Escritura acotada, masiva | Matchmaking para todos los sponsors activos, detecta solapamientos. Mismo patrón dry-run que la anterior. **Corregido el 10-ago** — antes fallaba por timeout con datos reales (ver sección Bugs), ahora carga la lista de citas activas una sola vez en vez de consultar Notion por cada candidato |
| `aprobar_match` | Escritura acotada | **Nueva (9 de agosto).** Marca como `Aprobado` una fila de `Citas` ya en estado `Sugerido`, dado un par (sponsorPageId, asistentePageId). Verifica que la fila exista antes de aprobar — nunca aprueba a ciegas ni crea una fila nueva. No crea ninguna cita real ni toca Calendar (eso sigue siendo exclusivo de `reservar_cita`) |

**Rediseño del 9 de agosto — de dónde salió `aprobar_match`:** el campo `Match Aprobado` (checkbox único por sponsor) no distinguía CUÁL de varios candidatos sugeridos había sido aprobado — un hueco de diseño que se volvió real en cuanto `Citas Minimas Prometidas` se confirmó como variable por sponsor (un sponsor con cuota de 4+ tiene 4+ candidatos sugeridos, no 1). La tabla `Citas` ya tenía la forma correcta (una fila por par sponsor-asistente), así que se extendió su `Estatus` con `Sugerido` y `Aprobado` como los dos primeros pasos del ciclo de vida, antes de `Pendiente Calendar`. `Match Sugerido` (relation en el sponsor) queda en desuso a partir de este cambio — se conserva en el schema por historial, pero ningún código nuevo lo escribe.

**`reservar_cita` deliberadamente NO se expone como herramienta MCP.** Crea un evento real en el calendario de un sponsor real, y la regla de negocio del cliente exige aprobación humana antes de ofrecer una cita — una herramienta que el agente pudiera invocar por una interpretación equivocada en conversación contradice esa regla directamente. En su lugar, `POST /citas/reservar` se conectó como herramienta de **API REST** directamente en la plataforma de Plática, con la instrucción explícita de invocarse solo tras aprobación humana.

## Variables de entorno
Ver `.env.example`. Resumen:
- `API_SECRET_KEY` — clave para llamar a ESTE servicio (propia, no la del repo de Google).
- `NOTION_API_KEY`, `NOTION_CONTACTOS_DATA_SOURCE_ID`, `NOTION_CITAS_DATA_SOURCE_ID`.
- `GOOGLE_API_BASE_URL`, `GOOGLE_API_KEY`, `GOOGLE_API_CLIENTE_ID` — para llamar HACIA `platica-google-docs-api`. `GOOGLE_API_CLIENTE_ID` requiere que la cuenta de Google de los sponsors ya esté conectada por OAuth en ese servicio (Adler lo maneja directamente, no es parte de este repo).

## Por qué un repo separado (no una app más sobre `platica-google-docs-api`)
1. **Separación de responsabilidades** — ese repo es la capa genérica de Google para todos los clientes de Plática. Las reglas de negocio de un evento específico (pesos de matchmaking, requisitos de checklist) no son su lugar natural.
2. **Concurrencia** — `booking.service.js` depende de un mutex en memoria de un solo proceso. Compartir servidor con otro servicio cuya política de réplicas no controlas directamente es un riesgo real de que la protección se rompa en silencio.
3. Nada de esto bloquea reusar el código de Calendar — se llama por HTTP (`calendar-client.service.js`), no se duplica.

## Cómo correr las pruebas manuales
No hay suite automatizada con Jest todavía — son scripts que se corren a mano y muestran resultado en consola, usando datos reales de los contactos de ejemplo en Notion con las llamadas de escritura simuladas:

```bash
node tests/matchmaking.manual-test.js
node tests/matchmaking-global.manual-test.js
node tests/checklist.manual-test.js
node tests/aprobar-match.manual-test.js
node tests/global-cache-citas.manual-test.js
```

## Pendientes conocidos (no bloquean el primer deploy, sí producción estable)
- Cron de reconciliación para citas que quedan en "Pendiente Calendar" por un crash a media ejecución.
- Confirmar con Laura: lista final de `Nivel de Patrocinio` y tabla de equivalencia de `Etapa de Negocio` ↔ `Etapa Cliente Buscada` (ver `matchmaking-spec-fdt.md`).
- ~~El shape exacto de la respuesta de `/calendar/crear-evento`~~ — **verificado el 22 de julio con una reserva real de punta a punta** (mutex → Notion → Calendar → Notion confirmado), contra el calendario "Prueba FDT" y el cliente_id `adler-calvillo`. `evento_id` sí viene donde se esperaba.
- Envío de alertas por WhatsApp (checklist y prospección) — no construido, es integración aparte.

## Bugs reales encontrados y corregidos

Documentados aquí porque afectaban tanto a rutas REST como a las herramientas MCP correspondientes — no eran exclusivos de una capa:

- **`Match Aprobado` no distinguía candidato individual** (9 de agosto): era un checkbox único por sponsor; con un sponsor teniendo varios candidatos sugeridos a la vez (confirmado con datos reales: 7 sponsors de prueba con Match Sugerido de 2+ candidatos cada uno), no había forma de decir "el match con Ana está aprobado pero el de Carlos no". Resuelto extendiendo `Citas` con estados `Sugerido`/`Aprobado` en vez de parchar el checkbox — ver sección MCP arriba.
- **`sugerir_matches_global` fallaba por timeout con datos reales** (10 de agosto): la función original llamaba a `existeCitaActivaEntre` (una petición HTTP a Notion) **una vez por cada candidato evaluado**, dentro de un loop por cada sponsor. Con 8 sponsors reales y ~15-20 candidatos elegibles cada uno, eran ~130-150 llamadas HTTP secuenciales en una sola invocación — más de 40-100 segundos incluso en el mejor caso, muy por encima de cualquier timeout razonable de un tool call MCP. Por eso `sugerir_matches_para_sponsor` (1 sponsor, ~15-20 llamadas) siempre funcionó bien mientras la versión global fallaba consistentemente. Corregido trayendo, una sola vez al inicio de `sugerirMatchesGlobal`, la lista completa de pares (sponsor, asistente) con cita activa — con paginación real, no asumida — y consultándola en memoria en vez de volver a golpear Notion por cada candidato. Esto bajó el número de llamadas HTTP de ~130-150 a un puñado. `sugerir_matches_para_sponsor` individual no cambió su comportamiento — el volumen ahí nunca fue el problema.
- **Anidamiento de filtros de Notion en `buscarAsistentesCandidatos`** (`contactos.service.js`): el filtro tenía 3 niveles de anidamiento (`and`→`or`→`and`); Notion solo soporta 2. Bloqueaba matchmaking para *cualquier* sponsor, no un caso aislado. Corregido moviendo una condición a post-filtrado en JavaScript.
- **`escribirEnNotion` con default divergente/ausente** entre `sugerirMatchesParaSponsor` (default `true` en el service vs. `false` ya usado en MCP) y `sugerirMatchesGlobal` (hardcodeado en `true`, sin opción de dry-run en absoluto). Ambos homologados a default `false`; los endpoints REST correspondientes se ajustaron para pasar `true` explícito y preservar su comportamiento ya probado.
