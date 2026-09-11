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

## Pendientes

- Redeploy Coolify para que el filtro de `Cancelada` viva en producción.
- Filas `Sugerido` que el cron haya creado *después* de una cancelación, antes de este deploy, hay que revisar a mano si quedaron.
