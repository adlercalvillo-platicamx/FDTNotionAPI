# Bitácora 14sep — más opciones por tamaño (Agente 2)
Handoff. Código gana si esto contradice algo.
Fecha del trabajo: 14 sep 2026. Continúa el pedido de Liz/Laura de ofrecer más sponsors en el chat sin tirar la oferta inicial Aprobado.

## Pedido
Si el asistente pide más opciones, sugerir sponsors que coincidan en tamaño (no “todos”). Grande/Consolidado también a quien no pidió Grande (caso Revie). PyME Exa = Mediana y Pequeña, no Micro. Poder agendar aunque el par no esté Aprobado ni Sugerido. Copy si se acaba el pool. Decisión Adler.

## Qué cambió y por qué
El primer WhatsApp sigue siendo canceladas reagendables + Aprobado. Un segundo pool (`opciones_adicionales`) relaja área y solución; el piso es giro (los 3 de siempre) + tamaño asimétrico. El cron de `sugerir-todos` y las plantillas de campaña **no** cambian: si Grande entrara ahí, Revie saldría en el masivo sin aprobación.

`reservar_cita` ya creaba cita sin fila de matchmaking; no hubo endpoint nuevo. La tool MCP `consultar_sugeridas_para_asistente` y `GET /citas/sugeridas` arman el mismo payload.

## Cómo operarlo
1. Deploy Coolify (1 réplica).
2. Refresh del MCP `fdt-notion-api` en Plática **después** del deploy (si se refresca antes, Plática se queda con el schema viejo).
3. Prompt Agente 2 ya en vivo: `EyIaJyVzLQrmWgOVNYRP` (90 versiones). Snapshot en `prompts-agentes-platica/Prompt y detalles - Citas 1-1 - Gestión de Citas Fashion Digital Talks.md`.
4. No reejecutar one-shots. No envío WhatsApp de prueba a números reales.

Campos nuevos en la consulta: `opciones_adicionales`, `opciones_adicionales_para_ofrecer`, `hay_mas_opciones`, `soluciones_en_comun`, `otras_soluciones`, `estatus_origen` (`cancelada` | `aprobado` | `sugerido` | `tamano`).

Filtro capa 2:
- Bronce fuera.
- Giro no elegible → sin unsugeridos (Sugerido sí se ofrece).
- Grande declarado o Exa Consolidado → cualquier sponsor.
- Mediana/Pequeña/Micro declarado → el sponsor debió pedir ese valor.
- Solo Exa PyME → Mediana o Pequeña (no Micro, no solo-Grande).
- Temprano / vacío → lista extra vacía → copy de revisar.

## Evidencia
`node tests/mas-opciones.manual-test.js` PASS.
`node tests/sugeridas-empresas.manual-test.js` PASS.
`node tests/tamano-negocio.manual-test.js` PASS (Capa 1 intacta).
`node tests/mcp-modificar-cancelar.manual-test.js` PASS.

## Pendientes
- Refresh MCP en Plática tras Coolify.
- Probar en un hilo de prueba: “más opciones” → lista extra → reservar sin Aprobado.
- Asistencia humana en Plática sigue disparando “no hay sugeridas Aprobado”; el prompt ya no escala hasta agotar extras, pero el disparador guardado no se tocó.
