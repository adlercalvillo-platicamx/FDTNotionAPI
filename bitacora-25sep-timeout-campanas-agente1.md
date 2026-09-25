# Bitácora 25sep — timeout del disparo de campañas (Agente 1)
Handoff. Código gana si esto contradice algo.
Fecha del trabajo: 25-sep-2026. Continúa el hilo de oferta inicial / `disparar_campanas_aprobadas`.

## Pedido
Adler: ayer el disparo mandó 11 bien, pero el Agente 1 reportó error ~1 min después; los WhatsApp tardaron ~10 min. No romper el envío; el agente debe poder esperar/consultar y reportar enviados y errores con volumen.

## Decisión
Plática corta el tool call MCP ~1 minuto. El loop del backend (Notion + plantilla, uno por asistente) no se aborta: por eso las 11 salieron y el chat dijo error. No se tocó la lógica de plantilla, banderas de Coolify ni el agrupado por asistente.

## Qué cambió
- MCP `disparar_campanas_aprobadas` **arranca en segundo plano** y responde al momento con `estadoCorrida=en_curso`. `consultarEstado=true` lee avance, `paraInformar` (nombre, empresa, texto de sponsors) y `errores` hasta `terminada`. Un segundo arranque mientras corre no relanza (lock en memoria, 1 réplica).
- El webhook `POST /webhooks/notion/enviar-campanas-aprobadas` **sigue esperando el lote completo**. Si ya hay corrida: 409 `DISPARO_EN_CURSO`.
- Prompts en vivo: subagente `kWQm6d9abFj4ChkxN6Bf`, orquestador `3xoV18e77zn8lpM3se48`. Timeout ≠ fallo; no relanzar; listar todas las personas.

## Cómo operarlo
1. **Desplegar** este backend en Coolify (1 réplica, como siempre).
2. En Plática: `refresh_mcp_server` del Backend MCP (`YfE1GCT5D6KLwZ48lXzz`) para que el esquema vea `consultarEstado`.
3. No reejecutar one-shots. No hace falta tocar banderas de simulación/envío real.
4. Hasta que Coolify tome el código, el agente ya no debe relanzar si hay timeout; el envío viejo (síncrono) sigue igual.

## Evidencia

Todo con mocks (`require.cache`): **no** se tocó Notion de producción ni se mandó WhatsApp real.

`node tests/mcp-disparar-campanas.manual-test.js` — nuevo, invoca el handler real que registra `crearServidorMcp()` con 11 asistentes y `enviarPlantilla` con 120 ms de latencia:

| Qué se midió | Resultado |
|---|---|
| Respuesta del tool call | **1 ms**, con el lote de 11 aún corriendo (antes esperaba el lote completo) |
| Segundo disparo durante la corrida | `yaHabiaCorrida`, 11 envíos totales — no 22 |
| `consultarEstado=true` al terminar | 11 enviados, `paraInformar` con nombre, empresa y sponsors de cada uno |
| Un WhatsApp rechazado (132000) | 10 enviados + 1 error nombrado; el lote no se abortó |

Sin regresión en `campanas-matchmaking`, `campanas-webhook`, `followup-72h`, `lastcall`, `mcp-modificar-cancelar`, `matchmaking` (Carlos 173 / Laura 1173) y `sponsor-fechas`.

**No probado:** el backend desplegado, el timeout real de Plática y el comportamiento del agente con el esquema nuevo. Eso solo se ve después del deploy + refresh del MCP.

## Pendientes
- Deploy Coolify + refresh MCP (Adler/Luis). Hasta entonces `consultarEstado` no existe en el servidor en vivo.
- El orquestador de Plática también corta ~1 min: el agente dirá “ya arrancó” y el reporte nominal completo llega al volver a preguntar / al siguiente turno, no en un wait de 10 min en el mismo mensaje.
