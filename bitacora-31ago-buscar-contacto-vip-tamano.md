# Bitácora 31ago — `buscar_contacto` + VIP salta filtro de tamaño

Handoff. Código gana si esto contradice algo.
Fecha del trabajo: 31 ago 2026. Commit `4d75180` en `main`. HEAD al arrancar: `6c6d4affde7940629db8c69e81fec23ea384cb86` (igual al SHA del prompt).

## Pedido

1. Endpoint de solo lectura para que Liz/Laura resuelvan un contacto por teléfono, nombre o empresa antes de `reservar_cita`.
2. Los VIP no deben quedar fuera del matchmaking por Tamaño de Negocio / Madurez Exa vacíos (Adler). Giro sigue sin excepción.
3. Limpiar tools y prompt del subagente `gZ4oJ84r1JT79zd9AEZg` (checklist + sugerir/aprobar/guardar).

Decisión de arquitectura (Adler, no reabierta): `buscar_contacto` y `reservar_cita` son REST, no MCP.

## Qué cambió y por qué

- `buscarContacto` en `contactos.service.js`: categoría obligatoria (`Asistente`|`Sponsor`), orden teléfono → nombre → empresa, para en el primero con resultados. Reusa `filtroWhatsAppPorTelefono`. Corrige el hueco de `buscarContactoPorNombre` (no filtraba categoría).
- `GET /contactos/buscar` (auth `X-API-Key`). 400 si falta categoría/criterio o categoría inválida. 200 con `{ resultados }` aunque esté vacío.
- `esCandidatoPorTamanoNegocio`: `if (candidato.esVip) return true`. Un solo cambio cubre cron `sugerir-todos`. Giro no se tocó.

## Cómo operarlo

- `GET /contactos/buscar?categoria=Asistente&telefono=...` (o `nombre=` / `empresa=`).
- Matchmaking: el próximo cron de 6h puede sugerir VIP que antes no salían. **Adler debe saberlo antes del redeploy Coolify** — no es sorpresa.
- Coolify quedó healthy tras el redeploy manual (Adler, 31-ago ~10:48 UTC-6).
- Estado operativo informado por Adler: `CAMPANAS_MATCHMAKING_MODO_SIMULACION=false` y envío real habilitado. No invocar `disparar_campanas_aprobadas` durante estas pruebas; aunque Aprobados contiene solo campañas de prueba ya enviadas, una llamada sería real.

## Evidencia

**Unitario (mocks, sin Notion):** buscar-contacto 7/7; vip-tamano-negocio 5/5; tamano-negocio baseline PASS; matchmaking.manual-test.js Carlos 260 / Laura 1320.

**Notion de pruebas (solo lectura, vía `.env` local — no Coolify):** los 7 casos HTTP de `buscarContacto` PASS. Las llamadas fueron `query` a Contactos, no PATCH. VIP en el pool de giro elegible: **0**. VIP con Tamaño y Madurez Exa vacíos en ese pool: **0**. El cron no va a “soltar” VIP nuevos en este dataset de pruebas; el test unitario sí cubre el caso. Dry-run `sugerirMatchesParaSponsor` post-Coolify queda como confirmación en el host desplegado, no como hallazgo nuevo de VIP.

**Coolify desplegado (solo lectura):** 7/7 casos PASS contra `GET /contactos/buscar`: teléfono Asistente 200/1; nombre 200/1; empresa `contains` 200/1; categoría inválida 400; sin criterio 400; no encontrado 200/0; teléfono de Asistente buscado como Sponsor 200/0. No se llamó ninguna ruta de escritura. MCP desplegado `sugerir_matches_para_sponsor` se ejecutó con `escribirEnNotion:false` para Platica.mx: HTTP 200, 4 candidatos evaluados, 0 válidos, 0 sugerencias; no escribió Notion.

**Plática `api_buscar_contacto` (`ltS6leGQTJTZxR51yUnu`):** Adler pegó `X-API-Key`. `test_api_tool` 200 (Samantha Rivas por teléfono), 200 `[]` no encontrado, 200 `[]` teléfono de Asistente con `categoria=Sponsor`. Enabled + connected. No se llamó `disparar_campanas_aprobadas`.

## Plática — tools del subagente `gZ4oJ84r1JT79zd9AEZg` (listado post-cambio)

**Active (5):**

| Nombre | Tipo | ID |
|---|---|---|
| api_reservar_cita | api | `DHNtYd1XvPA8IWaKBQxU` |
| api_buscar_contacto | api | `ltS6leGQTJTZxR51yUnu` |
| mcp_disparar_campanas_aprobadas_xhbrbu | mcp | `X06FqRzIW5HqjImemwGQ` |
| mcp_consultar_sugeridas_para_asistente_xhbrbu | mcp | `faEGlRzfgrD0s2bBcuLL` |
| mcp_reintentar_notificaciones_pendientes_xhbrbu | mcp | `qg4L9rgw93TC5S98tznX` |

**Desconectadas (ya no active):** `consultar_checklist` `bw8Kl02fMqNgSN1Icg1v`, `revisar_checklists_pendientes` `98cW1ucXsMXKAMJQsNs6`, `sugerir_matches_para_sponsor` `T7Ra4k66RNTPIYqwI7Ok`, `sugerir_matches_global` `YnSJmKwam8dvts4X0Sgb`, `aprobar_match` `ZsVRWjaYxRVyCqSXwPay`, `guardar_sugerencia_individual` `uNRGZ4h9QN34wBZtRLZ8`.

Prompt activo `iktBoBWKhFaM2v52lbIt` (41 versiones). Snapshot en `prompts-agentes-platica/`. El nombre del agente en Plática no se cambió.

## Pendientes

Ninguno de esta tarea. No hace falta otro redeploy de Coolify por el cambio de tools/prompt (es config de Plática). El cron de `sugerir-todos` sigue en el backend; el agente ya no lo dispara.
