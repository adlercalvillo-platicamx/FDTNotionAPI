# AGENTS.md — fdt-notion-api

Backend Node/Express de citas 1a1, matchmaking y checklist para **Fashion Digital Talks 2026** (Plática.mx). Fuente de verdad: Notion. Calendar se consume por HTTP; no hay SDK de Google en este repo.

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

Contrato del Flow de reserva (asistente): [`contrato-whatsapp-flow-citas.md`](contrato-whatsapp-flow-citas.md). JSON de pantallas: [`flows/reserva-asistente.json`](flows/reserva-asistente.json). El webhook se **despliega** aquí y se **registra** en Plática.

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
| Aprobar par sugerido | (vía service; tool MCP) | `aprobar_match` — exige fila `Sugerido` existente; nunca crea cita ni Calendar |
| Reservar cita real | **POST `/citas/reservar`** | **NO exponer** `reservar_cita` como tool |
| Sugeridas del asistente | GET `/citas/sugeridas?whatsapp=` (alias `telefono=`; `asistente_notion_id=` opcional) | `consultar_sugeridas_para_asistente` (`whatsapp` preferido) |
| Disponibilidad (foto) | GET `/citas/disponibilidad` | — |
| Data WhatsApp Flow | POST `/webhooks/whatsapp-flows` (HMAC) | — |
| Reenviar .ics | POST `/citas/:id/reenviar-notificacion`, POST `/citas/reintentar-notificaciones-pendientes` | `reintentar_notificaciones_pendientes` (a demanda, sin tope, no cron) |
| Disparar campañas aprobadas | POST `/webhooks/notion/enviar-campanas-aprobadas` (secret propio; simulación por default) | `disparar_campanas_aprobadas` (misma función, agrupada por asistente) |

`GET /citas/disponibilidad` usa una query de citas confirmadas del día (misma regla 11 mesas / sponsor). Sin env de horario → **503**. No sustituye a `reservar`. El Flow nunca confirma en pantalla; encola `reservarCita` y avisa por WhatsApp.

La generación periódica de sugerencias es externa al proceso: cron HTTP cada 6h a `POST /matchmaking/sugerir-todos` con `X-API-Key`. Nunca usar ese cron para enviar WhatsApp. Las campañas A/B/C requieren disparo humano y permanecen en simulación hasta aprobar plantillas y variables en Meta. Limpiar la cola acumulada antes del primer envío real es `scripts/one-shots/marcar-cola-sin-enviar.js` (`soloMarcar`); pide `--confirmar` y después escribir el título real de Citas. No hay endpoint ni tool MCP para eso.

## Ciclo de vida en tabla `Citas`

`Sugerido` → `Aprobado` → `Pendiente Calendar` → `Confirmada`

Si SMTP falla tras Calendar + Notion OK: **`Confirmada sin notificar`** (no revertir la cita). Motivo en `Notas Envio Email`.

**`Match Sugerido` / checkbox `Match Aprobado` están en desuso.** Escrituras nuevas van a filas en `Citas` por par sponsor–asistente. No revivir esos campos.

Toda escritura a `Confirmada` / `Confirmada sin notificar` debe pasar por `booking.service.js`. Editar Estatus a mano en Notion rompe capacidad y “sponsor ocupado”.

## Reserva (`booking.service.js`)

- Mutex **en memoria, un proceso**. Coolify: **1 réplica**. No quitar ni “simplificar” el mutex.
- Notion es el árbitro del slot; Calendar vía [`calendar-client.service.js`](src/services/calendar-client.service.js) → `platica-google-docs-api`. Si Calendar falla, **no** importar googleapis aquí.
- Duración y grilla de bloques: mismas env que disponibilidad (`CITAS_*`). Reusar `generarBloquesParaFecha`; no duplicar la lista de slots.
- Capacidad: **11 mesas por bloque** (`CAPACIDAD_MAXIMA_MESAS`). Mesa = `contarCitasEnBloque(inicio) + 1`. Cancelar no reutiliza el número.
- Correos: dos envíos distintos (sponsor con datos del asistente; asistente corto, **sin** contacto del sponsor). 3 reintentos SMTP inmediatos por envío. `emailsExtra` / `asistentes_email` van al correo del asistente.

## Matchmaking

- **Bronce** no participa (error explícito). Prioridad de desempate: Cristal > Diamante > Oro. **`Citas Minimas Prometidas` es por sponsor**, no derivar cuota del nivel. `topN` = cuota + `MARGEN_CANDIDATOS` (2).
- Capa 1: filtros duros (boleto, giro, etapa, tamaño de negocio Grande/Mediana o fallback Exa Consolidado/PyME, no “Dado de Baja”, no Expo). Capa 2: ranking en [`matchmaking.service.js`](src/services/matchmaking.service.js) (pesos `PESOS`).
- Giro elegible (también VIP): Marca de moda, Retailer/tienda multimarca, Manufactura. `Quiere Citas 1a1` es **select** `Sí`/`No`/vacío — excluir solo `'No'` explícito.
- Virtual es elegible por default (13-ago). `incluirVirtual` está **deprecado** (no-op, no usarlo en código nuevo).
- Alias de etapa: `"Venta por redes sociales"` → `"Vendo principalmente por redes sociales"`.
- Notion: **máximo 2 niveles** de anidamiento en filtros. Condiciones extra → post-filtro en JS (como `Quiere Citas 1a1`).
- Global: cargar pares con cita activa **una vez** (paginado) y consultar en memoria. No llamar Notion por candidato (timeout histórico ~130–150 HTTP).

## Notion y env

- Cliente: [`src/utils/notion-client.js`](src/utils/notion-client.js) contra data sources `NOTION_CONTACTOS_DATA_SOURCE_ID` / `NOTION_CITAS_DATA_SOURCE_ID`.
- Horario: `CITAS_FECHAS_EVENTO=2026-10-07,2026-10-08`. En Coolify, Names con **underscores** en la fecha (`CITAS_HORA_INICIO_2026_10_07`). Guiones en el Name no se inyectan. El query `fecha` del API sigue con guiones.
- `API_SECRET_KEY` es de **este** servicio. `GOOGLE_API_KEY` es el X-API-Key de Google Docs API. No mezclarlos. FDT usa OAuth por cliente (Modelo 2), no refresh token de agencia.

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

Scripts locales útiles: `tests/disponibilidad.local-smoke.js` (sin Notion), `tests/email-notificacion.manual-test.js`, `tests/asignacion-mesa.manual-test.js`.
