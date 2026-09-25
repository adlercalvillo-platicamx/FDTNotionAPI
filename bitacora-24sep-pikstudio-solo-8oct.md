# Bitácora 24sep — Pikstudio solo el 8 de octubre
Handoff. Código gana si esto contradice algo.
Fecha del trabajo: 24 sep 2026. Commit `6b60ed4` en `main`. Continúa [bitacora-18sep-sponsors-nuevos-laura.md](bitacora-18sep-sponsors-nuevos-laura.md).

Pedido Adler (cliente): Pikstudio no recibe citas el 7 de octubre, solo el 8. Consulta, escritura, QR y Agente 2. No usar bloqueos de conferencia (parecería agenda llena y un slot olvidado seguiría reservable).

## Decisión

Un helper `fechasPermitidasParaSponsor` en `citas.service.js`. Default = `CITAS_FECHAS_EVENTO`. Restricción por env `CITAS_SPONSOR_FECHAS` (page_id, no el nombre). Código `FECHA_NO_PERMITIDA_PARA_SPONSOR` + `fechas_permitidas`. Matchmaking y campañas no cambian (no ofrecen horas).

## Auditoría Laura (antes de código)

Token `NOTION_API_KEY_LAURA`, Citas `3b162dda-199a-8053-8098-000b00916893`, Pikstudio `3df62dda-199a-81e1-bf0d-c64484844e02`.

| Qué | Resultado |
| --- | --- |
| Filas Contacto Match = Pikstudio | 20 |
| Con `Fecha y Hora` el 2026-10-07 | **0** |
| Estatus | 20 `Sugerido` |

No había cita real el 7. No se tocó Notion.

## Código

- `GET /citas/disponibilidad`, MCP `consultar_disponibilidad_cita`, reserva pública, Flow legado, `reservarCita` y `modificarCita` pasan por el mismo allowlist.
- QR: `listarSponsorsPublicos` manda `fechasPermitidas`; el frontend no pinta el 7 para ese sponsor.
- Tests: `tests/sponsor-fechas.manual-test.js` + smokes de disponibilidad, booking 14-ago, MCP, Flow, QR.

## Rollout (orden)

1. Deploy backend **sin** la env → el resto de sponsors igual que hoy. El redeploy del 24-sep se hizo **antes** del push (`925f9b2`), así que no llevaba este cambio: hay que redeployar sobre `6b60ed4`.
2. Coolify Laura, **una réplica**: `CITAS_SPONSOR_FECHAS=3df62dda-199a-81e1-bf0d-c64484844e02:2026-10-08` y restart.
3. Rebuild del frontend QR (Application aparte).
4. `refresh_mcp_server` del MCP de citas en Plática (la description nueva vive en Coolify).
5. Prompt Agente 2 **ya editado** en vivo: `lap6lGagwVXTPRAYSFPr` (25 sep 2026, 01:00 UTC). Snapshot: `prompts-agentes-platica/Prompt y detalles - Citas 1-1 - Gestión de Citas Fashion Digital Talks.md`.

Rollback: borrar `CITAS_SPONSOR_FECHAS` y restart. El código sin mapa vuelve a ambos días.

En el workspace de pruebas el page_id de Pikstudio es otro: o se pone el de ese workspace o se deja la env vacía.

## Pendientes

- Adler: pegar la env en Coolify Laura **después** del deploy, rebuild QR, refresh MCP.
- No reejecutar one-shots de sponsors.
