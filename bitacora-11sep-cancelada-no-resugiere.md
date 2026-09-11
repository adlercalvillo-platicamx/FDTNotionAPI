# Bitácora 11sep — Cancelada no vuelve a sugerirse; sí se ofrece para reagendar
Handoff. Código gana si esto contradice algo.
Fecha del trabajo: 11 sep 2026. Continúa [bitacora-11sep-copys-correo-asistente.md].

## Pedido y decisión

Adler: no volver a crear un `Sugerido` de un par ya cancelado. El Agente 2, cuando liste sugerencias o aprobadas, debe incluir ese sponsor para poder reagendar.

## Qué cambió y por qué

Backend:

- `Cancelada` entra a `existeCitaActivaEntre` y `ESTATUS_ACTIVOS`. El cron de matchmaking y `sugerir_matches_*` ya no proponen de nuevo el mismo par.
- Mesa y horario siguen libres: `Cancelada` no está en `ESTATUS_CITA_REAL` ni en los conteos de 11 mesas.
- Reagendar no cambia: `reservar_cita` + `cita_origen_cancelada_id`, con la misma disponibilidad.

Agente 2 (`consultar_sugeridas_para_asistente`):

- `sugeridas_para_ofrecer` (tope 4) pone primero las canceladas reagendables (`para_reagendar=true`) y luego `Aprobado`.
- Un sponsor con cita Confirmada no se vuelve a ofrecer.
- La lista completa mezclada va en `sponsors_para_agendar` si hay más de 4.

Prompt vivo: `pzj6kAa0zQxtsyE2loQh` (11 sep 2026, 20:45 UTC). Snapshot en `prompts-agentes-platica/Prompt y detalles - Citas 1-1 - Gestión de Citas Fashion Digital Talks.md`.

## Cómo operarlo

Tras el deploy del backend, el siguiente `sugerir-todos` ya omite pares cancelados. El prompt ya está en Plática; no espera al deploy.

## Evidencia

- `node tests/rechazado-pares-activos.manual-test.js`
- `node tests/mcp-modificar-cancelar.manual-test.js`

Mocks. No se corrió matchmaking real.

## Verificación en vivo (11-sep, tras el commit)

Adler reportó que el Agente 2, al preguntarle "¿con quién me sugieres citas?", no
ofrecía la cancelada. No es el prompt: la versión activa `pzj6kAa0zQxtsyE2loQh`
ya trae `para_reagendar` y `sponsors_para_agendar`.

`tools/list` contra `https://f8wwwgc0g88wccscww4cccco.appsplatica.site/mcp`
(HTTP 200) devolvió la descripción **vieja** de
`consultar_sugeridas_para_asistente`: "…las canceladas (citasCanceladas) … usando
los campos *_para_ofrecer". Coolify corre el commit anterior, así que
`sugeridas_para_ofrecer` sigue siendo solo `Aprobado` y el campo `para_reagendar`
no existe en la respuesta. El agente no puede ofrecer lo que la tool no le manda.

## Pendientes

- Redeploy Coolify para que el filtro de `Cancelada` y la mezcla de
  `sugeridas_para_ofrecer` vivan en producción. Es el bloqueo del reporte de
  arriba.
- Tras el redeploy, `refresh_mcp_server` / `sync_mcp_server_tools` sobre
  `Backend MCP` (`YfE1GCT5D6KLwZ48lXzz`) en el workspace de Plática: la
  descripción de las tools está cacheada del deploy anterior.
- Filas `Sugerido` que el cron haya creado *después* de una cancelación, antes de este deploy, hay que revisar a mano si quedaron.
