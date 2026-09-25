# Bitácora 25sep — Daniela Luna: ofreció Flow, mandó "CaaS" y editó el UUID
Handoff. Código gana si esto contradice algo.
Fecha del trabajo: 25-sep-2026. Continúa [bitacora-24sep-albita-revie-id-cruzado.md](bitacora-24sep-albita-revie-id-cruzado.md).

## Pedido
Adler: escalación “solicitud de asistencia” de Daniela Luna (WhatsApp `527203313107`, Presencial): quería CaaS el jueves 8-oct 10:00 y `reservar_cita` devolvió `SPONSOR_NO_ENCONTRADO`. Qué pasó, cómo se arregla y cómo evitar que se repita. Después: “agéndala y haz más robusto el agente”.

## Qué pasó (conversación `8wDXaQ54Resj8prrOrbY`)
1. El agente listó varias empresas y luego abrió su último mensaje con **Flow** (“Con Flow puede ser: … jueves 10:00”). Daniela solo confirmó la hora.
2. El agente llamó `reservar_cita` con el `sponsor_notion_id` de **Flow** pero `sponsor_empresa_confirmada="CaaS"` (una empresa que había listado antes y que ella no nombró). El backend rechazó `SPONSOR_EMPRESA_NO_COINCIDE` **antes de escribir** — la guarda del 24-sep funcionó.
3. En vez de decidir por la conversación, el agente “corrigió” el UUID cambiándole caracteres (`…81ec-965e…`, `…81a9-965e…`). Ese id no existe → `SPONSOR_NO_ENCONTRADO` (404 de `requireSponsorExistente`). Escaló diciendo que el sponsor no existía; la escalación estaba mal diagnosticada.

No se escribió nada en Notion durante los intentos fallidos. No hubo cita cruzada que reparar (a diferencia de Albita el 24-sep).

## Decisión (Adler)
Agendar lo que Daniela confirmó: **Flow**, jueves 8-oct 10:00. Endurecer prompt y mensajes del backend para que el agente nunca edite un UUID y tome la empresa del último mensaje ofrecido.

## Cita creada (producción, `POST /citas/reservar`, HTTP 201)
| Campo | Valor |
| --- | --- |
| Página Citas | `3e562dda-199a-8162-9041-e3eec252ad0c` |
| Par | Flow × AMERICAN COTTON (Daniela Luna) |
| Horario | 2026-10-08 10:00–10:30 CDMX, Mesa 2 |
| Estatus | Confirmada; correos sponsor y asistente enviados |
| `request_id` | `wa:527203313107:<sponsor Flow>:2026-10-08T10:00` (formato estándar) |

## Qué cambió

### Prompt Agente 2 (`c1IYnFsr0Jzfqq4NeLAs`) — activo `Y12Y2trWqS7nOkjfg5Qe`
Tres `edit_agent_prompt` sobre `lap6lGagwVXTPRAYSFPr` (`BtS2carc0dpe9kFoYfft` → `5XJoEWMTdm6AqvOQEMJA` → `Y12Y2trWqS7nOkjfg5Qe`):
- `reservar_cita`: si el último mensaje abrió con una empresa y la persona solo confirma una hora, **esa** es la elegida; ids del sponsor cuyo `sponsorPageId` se pasó a `consultar_disponibilidad_cita`.
- Errores: bullet nuevo `SPONSOR_EMPRESA_NO_COINCIDE` con el camino (leer `sponsor_empresa_resuelta` / `sponsor_notion_id_de_empresa_confirmada`; reintentar con el mismo id y `request_id`, o usar el id de la empresa nombrada). `SPONSOR_NO_ENCONTRADO` justo después = id alterado; sin tercer intento; al escalar, decir que el id se modificó.
- NUNCA: “reconstruir o editar UUIDs (ni un carácter, ni ‘para corregirlos’)” y “reservar con una empresa que la persona no eligió en su último mensaje”.
Snapshot actualizado en `prompts-agentes-platica/Prompt y detalles - Citas 1-1 - Gestión de Citas Fashion Digital Talks.md`.

### Backend (requiere redeploy en Coolify)
- `booking.service.js` — `SPONSOR_EMPRESA_NO_COINCIDE` (409): el mensaje nombra la empresa real del id recibido, dice explícitamente “el id SÍ existe; no le cambies caracteres” y da los dos caminos. `detalle` trae `sponsor_empresa_resuelta`, `sponsor_notion_id_recibido` y `sponsor_notion_id_de_empresa_confirmada` (vía `contactosService.resolverSponsorPorEmpresa`, solo si resuelve única; helper `idSponsorPorEmpresaSiUnico`, tolera que el service no exista o falle). Sigue rechazando antes de escribir; el código no cambia.
- `citas.service.js` — `requireSponsorExistente` (404): agrega “un id que ya te sirvió para ofrecer horarios era válido: si ahora falla, se le cambiaron caracteres; no lo corrijas otra vez, vuelve a consultar”.
- `tests/asignacion-mesa.manual-test.js`: el caso `Revie + ID de otro sponsor` ahora verifica también el `detalle` y las frases del mensaje; el mock de contactos expone `resolverSponsorPorEmpresa`.
- `AGENTS.md`: párrafo de identidad del sponsor actualizado.

## Evidencia
| Prueba | Resultado |
| --- | --- |
| `node tests/asignacion-mesa.manual-test.js` | TODOS PASARON (incluye detalle nuevo del 409) |
| `node tests/modificar-cancelar-cita.manual-test.js` | TODOS PASARON |
| `node tests/mcp-modificar-cancelar.manual-test.js` | TODOS PASARON |
| `edit_agent_prompt` ×3 | `matchesFound=1`, `replacementsMade=1`, `editType=exact` cada una |
| `POST /citas/reservar` Daniela × Flow | HTTP 201, Confirmada, Mesa 2 |

## Cómo operarlo
- Redeploy de `fdt-notion-api` para que el 409/404 nuevos lleguen al agente. No hace falta `refresh_mcp_server`: `reservar_cita` es API tool REST de Plática, no MCP, y su schema no cambió.
- El prompt ya está vivo; no hay que hacer nada más en Plática.
- Daniela sigue en asistencia humana en `8wDXaQ54Resj8prrOrbY`: falta el mensaje de cierre (propuesto en el chat con Adler, no enviado).

## Pendientes
- Redeploy Coolify (Adler).
- Enviar a Daniela la confirmación por WhatsApp una vez aprobado el texto y sacar la conversación de asistencia.
- Vigilar si vuelve a aparecer `SPONSOR_EMPRESA_NO_COINCIDE` seguido de `SPONSOR_NO_ENCONTRADO` en alguna conversación; con el prompt nuevo debería quedar en un reintento correcto.
