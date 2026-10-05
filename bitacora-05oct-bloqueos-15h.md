# Bitácora 05oct — correo de modificación por programa (bloqueos 1.5 h)
Handoff. Código gana si esto contradice algo.
5 de octubre de 2026. Continúa el plan de ampliar a 1.5 h los 13 bloqueos de agenda. El lote en vivo (mover 6 citas, WhatsApp, bloqueos) **no se corrió**: espera redeploy de Coolify.

## Pedido y decisión

Adler: al mover las 6 citas que chocan con la ventana de 1.5 h, el correo del asistente explica el cambio de programa y deja el WhatsApp `+52 33 3236 1963` para pedir otro horario. El resto de modificaciones conserva el correo de siempre. Decisión de Adler.

## Qué cambió

`POST /citas/modificar-cita` acepta `motivoOperativo: true`. Solo entonces el cuerpo del **asistente** agrega la frase del programa y cambia el cierre al WhatsApp de dudas/otro horario. El sponsor no cambia. El MCP `modificar_cita` y la página QR no mandan el flag.

## Cómo operarlo

1. Redeploy de `fdt-notion-api` en Coolify con este commit.
2. Recién ahí, mover las 6 por el API de producción con `motivoOperativo: true` (mutex de la única réplica). No correrlas en local.
3. Enviar plantilla `cita_modificada` (APPROVED) con `responderAgentId` = `c1IYnFsr0Jzfqq4NeLAs`.
4. Crear los bloqueos adyacentes (antes y después) de los 13 sponsors.

## Evidencia

`node tests/modificar-cancelar-cita.manual-test.js`: todos pasaron, incluido el caso nuevo de `motivoOperativo` y el default sin la frase del programa.

## Pendientes

- Redeploy y aviso de Adler.
- Re-auditar que sigan siendo solo las 6 y que los destinos sigan libres.
- Mover, WhatsApp y bloqueos. Nombres y horarios ya acordados en el plan de esta sesión.
