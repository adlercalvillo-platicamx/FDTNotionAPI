# Bitácora 31ago — `buscar_contacto` + VIP salta filtro de tamaño

Handoff. Código gana si esto contradice algo.
Fecha del trabajo: 31 ago 2026. Continúa el prompt de Adler (`prompt-cursor-buscar-contacto-y-limpieza-agente`). HEAD al arrancar: `6c6d4affde7940629db8c69e81fec23ea384cb86` (igual al SHA del prompt).

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

## Evidencia (unitario, sin Notion)

| Caso | Resultado |
|---|---|
| buscar-contacto 7/7 | PASS (`node tests/buscar-contacto.manual-test.js`) |
| vip-tamano-negocio 5/5 | PASS |
| tamano-negocio baseline | PASS (no-VIP vacío sigue fuera) |
| matchmaking.manual-test.js | Carlos 260 / Laura 1320, sin cambio |

## Impacto VIP (Notion de pruebas) — pendiente de dry-run post-deploy

El conteo de VIP con Tamaño y Madurez Exa ambos vacíos se reporta **después** del dry-run contra un sponsor real (`escribirEnNotion: false`). Hasta entonces: tests unitarios confirman el comportamiento; no hay cifra de Notion en esta sección.

## Plática (Parte 2)

Al cerrar código esto **aún no** está aplicado en vivo. Pendiente tras redeploy:

- Desconectar las 6 tools de checklist/sugerir/aprobar/guardar.
- Conectar `disparar_campanas_aprobadas` + `buscar_contacto` (REST).
- Reescribir prompt del subagente (ya no checklist/sugerir_matches).

## Pendientes

- [ ] Redeploy Coolify (Adler).
- [ ] 7 casos de `GET /contactos/buscar` contra Coolify + Notion real (confirmar 0 escrituras).
- [ ] Dry-run `sugerirMatchesParaSponsor` y contar VIP afectados.
- [ ] Tools + prompt del subagente; actualizar snapshot `prompts-agentes-platica/`.
