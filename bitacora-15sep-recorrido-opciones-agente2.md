# Bitácora 15sep — recorrido y copy de opciones del Agente 2
Handoff. Código gana si esto contradice algo.
Fecha del trabajo: 15 sep 2026. Continúa [bitacora-14sep-mas-opciones-agente2.md](bitacora-14sep-mas-opciones-agente2.md).

## Pedido y decisión
Después de la prueba de Adler del 14-sep, hacer más clara la presentación de soluciones y evitar que el Agente 2 pierda las opciones adicionales al volver a consultar tras reservar, modificar o cancelar. Adler aprobó el copy y el recorrido por pasadas.

## Qué cambió y por qué
- Cada pasada ofrece hasta 4 por lote: cancelada reagendable + Aprobado, luego `opciones_adicionales`.
- La oferta inicial cuenta como Aprobado ya visto. Volver a llamar la tool o cambiar una cita no borra el avance de la pasada.
- El último lote de la primera pasada incluye el aviso de que, de momento, esas son las opciones que hacen match. Ese aviso está condicionado a `hay_mas_sugeridas` **y** `hay_mas_opciones` en false, más haber dicho todas las de `opciones_adicionales_para_ofrecer` (ver corrección de 16:40 abajo).
- Si después de ese aviso vuelven a pedir más, se inicia otra pasada con lo que siga disponible; ahí sí pueden volver a salir CaaS u otros ya vistos. Una Confirmada nunca vuelve a ofrecerse.
- Copy de adicionales: `soluciones_en_comun` se presenta como “expertos en”; `otras_soluciones` como “También ofrecen”. Si no hay comunes, las otras se presentan directamente como especialidad, sin decir “según lo que registraste” ni explicar que no hubo coincidencia.
- El `aviso` y la descripción de `consultar_sugeridas_para_asistente` refuerzan la misma conducta. El payload y los filtros de matchmaking no cambiaron.

## Corrección 16:40 UTC — el cierre se disparaba con adicionales sin decir

En la prueba de Adler del 15-sep 16:27–16:28 el agente listó los 4 Aprobado y, al pedirle “¿Que otras opciones hay?”, contestó el copy de cierre aunque la misma respuesta de la tool traía `hay_mas_opciones: true` y seis adicionales sin decir (Leadin, Reversso, Flow, Revie, Infracommerce, Envia.com).

Causa: al reescribir el prompt a las 15:51 la condición verificable (“`hay_mas_sugeridas` y `hay_mas_opciones` en false”) se cambió por prosa — “cuando ya no quede ningún sponsor nuevo por decir”. El agente leyó `hay_mas_sugeridas: false`, que solo agota los Aprobado, como “ya no hay nada”, y nunca abrió `opciones_adicionales_para_ofrecer`. El backend desplegado estaba correcto: `POST /mcp` `tools/list` en Coolify ya devolvía la descripción nueva (HTTP 200, con “pasadas” y “expertos en”).

Qué se ajustó en el prompt vivo, sin tocar backend:
- `hay_mas_sugeridas: false` se declara explícitamente como “se acabaron los Aprobado”, no como fin de las opciones; las adicionales son listas aparte.
- Antes de decir “ya no hay más” hay que revisar esas dos listas; prohibido cerrar mientras quede un sponsor sin decir.
- El copy de cierre exige las tres condiciones: `hay_mas_sugeridas` en false, `hay_mas_opciones` en false y todas las de `opciones_adicionales_para_ofrecer` ya dichas.
- El paso 2 del flujo Agendar usa la misma condición (`hay_mas_opciones` en false) en vez de repetir la instrucción suelta.

Lección: las condiciones de cierre van como banderas que el agente puede leer del JSON, no como juicio narrativo.

## Corrección 16:47 UTC — pregunta de dos salidas y cierre literal

Con la corrección anterior el recorrido ya funcionó (16:36 Leadin/Reversso/Flow/Revie, 16:37 Infracommerce/Envia.com), pero Adler marcó dos cosas en esa misma prueba:

1. Ningún lote preguntaba si quería que le buscaran más opciones; todos cerraban con “¿Con quién te gustaría revisar horarios?”. La instrucción existía, pero como sugerencia entre paréntesis, y FORMATO pide “una sola pregunta relevante por turno”: el agente se quedaba con la mitad obvia y la persona no sabía que había más.
2. El mensaje final no fue el copy acordado. A las 16:37 mandó el último lote sin pegar el cierre y a las 16:38 improvisó “ya te compartimos todas las opciones que me salen para ti”, que es ambiguo y suena a sistema. El prompt solo contemplaba el cierre “pegado al último lote”, no el caso de que vuelva a pedir más en un turno aparte.

Qué se ajustó, aprobado por Adler, sin tocar backend:
- Todo lote que no sea el último cierra con las dos salidas en una sola pregunta, literal: “¿Con quién te gustaría revisar horarios, o prefieres que te busque otras opciones?”. Prohibido recortarla.
- El copy de cierre se declara texto literal aprobado por el equipo: no se parafrasea ni se resume a quién ya nombró. Prohibidas las variantes tipo “ya te compartí todas las opciones” o “todas las que me salen”.
- Se cubren los dos momentos: pegado al final del último lote, y como respuesta única si ya se dijo todo y vuelve a pedir más.
- El paso 2 del flujo Agendar repite las dos reglas para no contradecir la sección principal.

## Corrección 19:20 UTC — el copy de cierre se movió al payload del MCP

Prueba de Adler en la conversación `y1gBHTy0x9Uy4x50qEOZ` (19:01–19:03). El recorrido salió completo y los tres lotes llevaron la pregunta de dos salidas. Fallaron dos cosas:

1. El último lote (Infracommerce, Envia.com) volvió a preguntar “¿o prefieres que te busque otras opciones?” cuando ya no quedaba nada. La regla nueva quedó redactada como obligatoria para todos los lotes.
2. Al volver a pedir opciones respondió “Por ahora ya te compartí las opciones adicionales disponibles. ¿Agendamos con alguno de los que ya vimos?”: conservó la última frase del copy y tiró las dos primeras.

Causa de fondo, y la razón de cambiar de enfoque: el texto vivía **solo en el prompt**, así que el agente lo reconstruía de memoria y al hacerlo lo pasaba por TONO / ANTI-TELLS, que le exigen frases cortas y “si una frase no aporta un dato o una pregunta, córtala”. “Con mucho gusto revisamos más de nuestro lado y te confirmamos” es exactamente lo que esa regla manda tirar. Pedirle “es literal” competía contra una sección entera de tono, y perdió dos veces. Lo que el agente **sí** copia sin fallar es lo que viene en la respuesta de la tool: ids, ISO, `horario_legible`.

Cambio de backend (requiere deploy + refresh del MCP, a diferencia de las correcciones anteriores):
- `src/mcp/server.js` expone `copy_sin_mas_opciones` en `consultar_sugeridas_para_asistente`, en los dos caminos del payload. Constante `COPY_SIN_MAS_OPCIONES`, texto idéntico al aprobado.
- El `aviso` y la descripción de la tool ahora dicen: al agotar la pasada, responde textualmente ese campo, sin editarlo.
- Cobertura en `tests/mcp-modificar-cancelar.manual-test.js`: el texto se compara **carácter por carácter** — si cambia sin pedido explícito de Adler, es regresión, no un test que “arreglar”.

Prompt (`8UbLHEVgk2r1A4R3jPqF`):
- El copy se copia del payload, palabra por palabra, como un id o un horario.
- Es la única excepción declarada a TONO y ANTI-TELLS: va completo aunque una frase parezca relleno.
- El último lote **ya no lleva** la pregunta de dos salidas; cierra con el copy, que trae su propia pregunta.
- `NUNCA` prohíbe parafrasearlo, y el fallback de listas vacías apunta al mismo campo.

Lección, hermana de la anterior: el texto que tiene que salir palabra por palabra viaja como dato en el payload, no como instrucción de redacción — sobre todo cuando el prompt tiene reglas de tono que lo contradicen.

## Operación
1. Prompt vivo del Agente 2: `8UbLHEVgk2r1A4R3jPqF` (102 versiones). Intermedias del 15-sep: `vPygRjKZjZUJVkjKQNVf` (19:19), `4zSU2aLwMLD2x1stCtuQ` (19:18), `xl5Kglzhwhs5B9evpMip` (19:17), `17k1QeuZKBOJ3FpJMbjm` (16:47), `hGY5PqFpf4dOTmrOP2um` (16:46), `3cCCdSLbJ7ZdSQn7d2Si` (16:40), `SasevaynfmPoaf4xBTvs` (16:39), `p9beXAkx7MxaYFjjX8P0` (15:51).
2. Snapshot actualizado en `prompts-agentes-platica/Prompt y detalles - Citas 1-1 - Gestión de Citas Fashion Digital Talks.md`.
3. La corrección de 19:20 **sí** necesita deploy de Coolify y después refresh del MCP `fdt-notion-api` en Plática, porque `copy_sin_mas_opciones` viaja en el payload. Sin refresh, Plática sigue con la descripción vieja y el agente no verá el campo. Las correcciones de 16:40 y 16:47 fueron solo prompt y no requerían nada.
4. No se enviaron campañas ni mensajes durante estos cambios.

## Evidencia
La conversación `jKC43IShhPKjpafBbXBc` mostró correctamente los dos lotes adicionales, pero después de cancelar Platica.mx una nueva consulta volvió a cancelada+Aprobado y terminó sin recorrer de nuevo Leadin–Envia.com. El backend sí devolvía `opciones_adicionales`; la falla estaba en las instrucciones conversacionales.

Prueba relevante: `node tests/mcp-modificar-cancelar.manual-test.js`.

## Pendiente de Laura
Definir si al presentar sponsors se deben incluir los valores del campo `Otro` y si se deben mostrar todas las soluciones del sponsor o solo comunes + otras estructuradas. No cambiar esa regla hasta tener respuesta. Hoy el backend excluye `Otro` y el prompt usa únicamente `soluciones_en_comun` / `otras_soluciones`.
