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

## Operación
1. Prompt vivo del Agente 2: `3cCCdSLbJ7ZdSQn7d2Si` (96 versiones). Intermedias: `SasevaynfmPoaf4xBTvs` (16:39), `p9beXAkx7MxaYFjjX8P0` (15:51).
2. Snapshot actualizado en `prompts-agentes-platica/Prompt y detalles - Citas 1-1 - Gestión de Citas Fashion Digital Talks.md`.
3. Para que Plática reciba el `aviso` y la descripción nuevos del backend: deploy de Coolify y después refresh del MCP `fdt-notion-api`. Ya hecho y verificado el 15-sep. La corrección de 16:40 es solo prompt: **no** requiere deploy ni refresh.
4. No se enviaron campañas ni mensajes durante este cambio.

## Evidencia
La conversación `jKC43IShhPKjpafBbXBc` mostró correctamente los dos lotes adicionales, pero después de cancelar Platica.mx una nueva consulta volvió a cancelada+Aprobado y terminó sin recorrer de nuevo Leadin–Envia.com. El backend sí devolvía `opciones_adicionales`; la falla estaba en las instrucciones conversacionales.

Prueba relevante: `node tests/mcp-modificar-cancelar.manual-test.js`.

## Pendiente de Laura
Definir si al presentar sponsors se deben incluir los valores del campo `Otro` y si se deben mostrar todas las soluciones del sponsor o solo comunes + otras estructuradas. No cambiar esa regla hasta tener respuesta. Hoy el backend excluye `Otro` y el prompt usa únicamente `soluciones_en_comun` / `otras_soluciones`.
