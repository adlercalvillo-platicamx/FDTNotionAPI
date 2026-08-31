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
- Coolify: redeploy **manual**. Hasta que no esté, Plática no puede registrar `api_buscar_contacto`.

## Evidencia

**Unitario (mocks, sin Notion):** buscar-contacto 7/7; vip-tamano-negocio 5/5; tamano-negocio baseline PASS; matchmaking.manual-test.js Carlos 260 / Laura 1320.

**Notion de pruebas (solo lectura, vía `.env` local — no Coolify):** los 7 casos HTTP de `buscarContacto` PASS. Las llamadas fueron `query` a Contactos, no PATCH. VIP en el pool de giro elegible: **0**. VIP con Tamaño y Madurez Exa vacíos en ese pool: **0**. El cron no va a “soltar” VIP nuevos en este dataset de pruebas; el test unitario sí cubre el caso. Dry-run `sugerirMatchesParaSponsor` post-Coolify queda como confirmación en el host desplegado, no como hallazgo nuevo de VIP.

## Plática (Parte 2 — incompleta a propósito hasta el redeploy)

Hecho ahora:
- Refresh + sync del MCP `YfE1GCT5D6KLwZ48lXzz` (Backend MCP): `disparar_campanas_aprobadas` quedó instalada (`mcp_disparar_campanas_aprobadas_xhbrbu`, `X06FqRzIW5HqjImemwGQ`) y **conectada active** al subagente `gZ4oJ84r1JT79zd9AEZg`.
- Las 6 tools de checklist/sugerir/aprobar/guardar **siguen active**. No las desconecté todavía: sin `GET /contactos/buscar` en Coolify ni `api_buscar_contacto`, el agente perdería cómo resolver nombres.

Pendiente (Adler, redeploy manual de Coolify, nunca automático):
- [ ] Redeploy para que exista `GET /contactos/buscar`.
- [ ] Registrar tool REST `buscar_contacto` (mismo patrón que `api_reservar_cita` / `DHNtYd1XvPA8IWaKBQxU`) y conectarla.
- [ ] Desconectar las 6: `bw8Kl02fMqNgSN1Icg1v`, `98cW1ucXsMXKAMJQsNs6`, `T7Ra4k66RNTPIYqwI7Ok`, `YnSJmKwam8dvts4X0Sgb`, `ZsVRWjaYxRVyCqSXwPay`, `uNRGZ4h9QN34wBZtRLZ8`.
- [ ] Reescribir prompt del subagente (ya no checklist/sugerir_matches) y snapshot en `prompts-agentes-platica/`.
- [ ] 7 casos contra Coolify vía Plática.

## Pendientes

Los de arriba. Esta tarea **no** está terminada: falta Coolify + REST `buscar_contacto` + limpieza de tools/prompt.
