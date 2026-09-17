# Bitácora 17sep — descriptions de tools (Agente 2) y ajuste Agente 1
Handoff. Código gana si esto contradice algo.
Fecha del trabajo: 17 sep 2026. Continúa [bitacora-17sep-correo-virtual-y-mensajes.md] y el prompt vivo de Luis (`OxP9D658SMpptyLBaa72`, 17-sep 04:01 UTC).

Para Luis: esto es lo que hay que saber para seguir. Carlos pidió las descriptions; Adler amplió el corte para que prompt + `aviso` no pelearan con el catálogo.

## Pedido y decisión

Carlos: reescribir lo que ve el LLM en las tools de citas (MCP + `api_reservar_cita`) y el string `copy_sin_mas_opciones`. Prioridad Agente 2 (WhatsApp asistentes). Notion no cambia.

Adler: las descriptions MCP son **un catálogo compartido**. El subagente de citas del Agente 1 las ve iguales. Se ajustó su prompt, no se duplicó el servidor.

## Qué no se tocó

- Filtros de matchmaking (PyME, Micro, Exa, `estatus_origen=tamano`).
- Reserva, mesas, mutex, `.ics`, QR, correos Virtual.
- Tools de plantillas / canales.
- Orquestador del Agente 1 y subagente Exa.
- Agente 3 (Marketing).
- El copy `expertos en` **de la oferta inicial de WhatsApp** (plantilla Meta). Eso es otro canal.

## Qué cambió (lista para Luis)

### 1. Backend — `src/mcp/server.js` (hace falta deploy Coolify)

| Tool | Cambio |
|---|---|
| `consultar_sugeridas_para_asistente` | Description de Carlos. Sin “pegar copy”, sin “expertos en” como copy, sin “Laura/Liz”. |
| `consultar_disponibilidad_cita` | Sin nombrar `CITAS_MARGEN_*` ni casillas Día 1. En el chat: solo lo que pidió. |
| `modificar_cita` / `cancelar_cita` | Sin “Laura/Liz” en description ni en el `describe` de `citaId`. El código **sigue** aceptando `citaId` solo. |
| Constante `COPY_SIN_MAS_OPCIONES` | `Por ahora ya son todas las disponibles.` |
| Campo `aviso` de sugeridas | Alineado: no pegar el campo; cierre de pasada; etiquetas internas; “Todavía hay más.” |
| `aviso` de disponibilidad (sin hora pedida) | No recitar las 3 casillas; “¿lo dejo?” solo si no eligió hora. |

Tests: `tests/mcp-modificar-cancelar.manual-test.js` — **TODOS PASARON** en local.

Docs: `README.md`, `AGENTS.md` (contrato de copy, no la lógica de Notion).

### 2. Plática — ya aplicado (no espera deploy)

| Qué | ID | Estado |
|---|---|---|
| `api_reservar_cita` | `DHNtYd1XvPA8IWaKBQxU` | versión **9**. Se añadió al final: sí explícito; no Notion/`request_id`/.ics al contacto; tras éxito confirma quién/cuándo y pregunta solo si llegó el correo; no pedir otra cita en el mismo mensaje. Variables igual. |
| Prompt Agente 2 | `c1IYnFsr0Jzfqq4NeLAs` → `KP43tfwZTcU7hQczOqWs` (17-sep 18:50 UTC) | Quitó “expertos en” / “También ofrecen”. `copy_sin_mas_opciones` interno. El resto del tono de Luis (04:01) se quedó. |
| Prompt subagente Agente 1 | `gZ4oJ84r1JT79zd9AEZg` → `FMf9oJB1ri7YB6cyG4bH` | Bloque **CATÁLOGO MCP**: no copies el tono WhatsApp; sigue empresa × empresa, `citaId` sin teléfono, reporta Notion/correo. |

### 3. Pendiente de Luis (si no, Plática sigue con descriptions MCP viejas)

1. **Deploy Coolify** de `fdt-notion-api` con este commit de `src/mcp/server.js`.
2. **`refresh_mcp_server`** del backend MCP (`YfE1GCT5D6KLwZ48lXzz`, URL `https://f8wwwgc0g88wccscww4cccco.appsplatica.site/mcp`).
3. Probar dos chats de números de prueba:
   - Agente 2: “más opciones” → cierre nuevo, sin “match”; “jueves tarde” → no recita mañana; reserva → no pregunta otra cita en el mismo mensaje.
   - Agente 1: listar/mover una cita con `citaId`; que no hable como WhatsApp de piso.

Sin el refresh, el Agente 2 ya tiene el prompt nuevo, pero el catálogo MCP (descriptions) sigue el de Coolify viejo y el `aviso` JSON también.

## Copy al contacto (Agente 2)

| Momento | Texto |
|---|---|
| Agotó la pasada | Por ahora ya son todas las disponibles. |
| Insiste | No, por ahora no hay otra. |
| Lote exploratorio con más | Todavía hay más. (sin pregunta) |

El prompt de Luis todavía dice que **después** de ese cierre, un pedido más puede iniciar otra pasada. La description de Carlos se queda en “No, por ahora no hay otra.” Si el modelo mezcla las dos, gana el prompt. Si quieres matar la segunda pasada, es un edit de prompt aparte.

## Cómo operarlo

- No reejecutar one-shots.
- `citaId` sin teléfono **sigue funcionando** para Laura/Liz.
- Si editas descriptions MCP otra vez: código en `server.js` → deploy → refresh. El catálogo de Plática no se edita a mano.
- `api_reservar_cita` sí se parchea con `update_api_tool`.

## Pendientes

- [ ] Deploy Coolify + refresh MCP (Luis / Adler).
- [ ] Prueba en vivo Agente 2 y Agente 1 (números de prueba).
- [ ] El snapshot `Prompt y detalles - Citas 1-1 - Gestión de Citas Fashion Digital Talks.md` tiene cabecera 17-sep y el delta de tools; el changelog largo de 15-sep debajo es histórico. Fuente de verdad del prompt: `get_agent_prompt` `KP43tfwZTcU7hQczOqWs`.
