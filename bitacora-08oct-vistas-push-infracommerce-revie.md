# Bitácora 08oct — vistas cola Infracommerce/Revie y push oportunidad_cita_sponsor
Handoff. Código gana si esto contradice algo.
8 de octubre de 2026. Continúa [bitacora-07oct-vista-cola-envia.md](bitacora-07oct-vista-cola-envia.md).

## Pedido

Adler: vistas en Citas (Laura) como **Cola — Envia.com**, para **Infracommerce** y **Revie**; luego código para plantilla Meta aprobada `oportunidad_cita_sponsor` (solo filas **Sugerido** que Laura deje en la cola).

## Vistas Notion (producción)

Misma tarjeta y `group_by` que **Cola — Sugeridas por aprobar** (`3d062dda-199a-8159-82ed-000c83a37787`). Filtro: Sugerido / Aprobado / Rechazado por sponsor, sin bloqueos de conferencia, sin filtro de cupo.

| Vista | id | Filas al crear |
|---|---|---|
| Cola — Infracommerce (Sugerido / Aprobado / Rechazado) | `3f362dda-199a-8138-932f-000cec70caa7` | 74 |
| Cola — Revie (Sugerido / Aprobado / Rechazado) | `3f362dda-199a-8137-b0e5-000cee93915c` | 94 |

Script: `scripts/one-shots/crear-vista-cola-sponsor-push-laura-08oct.js` (`--confirmar`, opcional `--solo infracommerce|revie`).

Sponsors: Infracommerce `3bc62dda-199a-81bb-b769-f4ef0eab9a5f`, Revie `3bc62dda-199a-8189-805d-ee8b4fcca080`.

## Código — push WhatsApp

- `POST /matchmaking/enviar-push-oportunidad-sponsor` — body `{ "sponsor": "infracommerce" | "revie", "modoSimulacion": opcional }`.
- Service: `src/services/push-oportunidad-sponsor.service.js`.
- Rama **propuesta_cita** (`PLATICA_TEMPLATE_PROPUESTA_CITA=propuesta_cita`) si `Última Campaña Enviada = Oferta inicial`.
- Rama **oferta inicial** (`agendar_cita_inicial_aprobado_1`…`_4`) si no: Aprobados sin campaña del asistente (top 4) o solo el sponsor del push si no hay Aprobados.
- Lectura Notion: `listarSugeridasParaPushOportunidad(sponsorPageId)` — solo **Sugerido**; idempotencia `Estado Envío Campaña` en la fila (no `Campaña Enviada`).
- Excluye: Speaker, Expo, Amazon, sin WhatsApp, sin soluciones armables.
- Env (Coolify): `PLATICA_TEMPLATE_OPORTUNIDAD_SPONSOR=oportunidad_cita_sponsor`, `PUSH_OPORTUNIDAD_SPONSOR_MODO_SIMULACION=true`, `PUSH_OPORTUNIDAD_SPONSOR_ENVIO_REAL_HABILITADO=false`.

## Operación antes del envío real

1. Curar en las vistas: **Sugerido** = mandar, **Rechazado** = no mandar (el código no lee Rechazado).
2. Simulación: `POST` con `X-API-Key`, revisar `detalle[].payload` (nombres y conteos).
3. Prender envío real solo con las dos banderas en `false` / `true` respectivamente; **un sponsor por disparo** (Infracommerce y Revie por separado).
4. No reenviar a filas con `Estado Envío Campaña = Enviada` en esa fila Sugerido.

## Prueba

`node tests/push-oportunidad-sponsor.manual-test.js`

## Agente 2 — prompt `propuesta_cita` (8 oct)

Plática Agente `c1IYnFsr0Jzfqq4NeLAs`, prompt activo `xYrVRCmHIP5TY0n1zhlR`. Nueva sección **CUANDO LA CONVERSACIÓN ABRE CON PROPUESTA_CITA**; enlaces en Agendar paso 1 y quiere_citas_no. Snapshot: `prompts-agentes-platica/Prompt y detalles - Citas 1-1 - Gestión de Citas Fashion Digital Talks.md`.

## Pendientes

- Deploy a Coolify + vars de plantilla (`PLATICA_TEMPLATE_PROPUESTA_CITA=propuesta_cita`).
- Simulación nominal con lista de nombres antes del primer envío real (regla operación en vivo).
