# Bitácora 28-ago — plantilla de oferta inicial v2 (2 variables, sin horarios)

Pedido de Adler: la plantilla que abre la conversación tiene que **explicar qué son las citas 1a1** antes de ofrecerlas (el asistente no entendía de qué se trataban), hablar como **equipo de Fashion Digital Talks** (no como "Rebe") y traer los sponsors con la solución que embona con su perfil.

## Texto aprobado

`{{1}}` = nombre del asistente. `{{2}}` = hasta 4 sponsors con su solución.

```
Hola {{1}}, te escribimos del equipo de Fashion Digital Talks, el congreso internacional de eCommerce, negocios y moda en el que ya estás registrado.

Tu registro incluye citas de negocios 1 a 1: reuniones privadas de 30 minutos, dentro del evento y sin costo extra, con expertos de empresas que ya resuelven los retos que tienes en tu operación de acuerdo a las soluciones que buscas. Tú eliges con quién y a qué hora.

👉 Según el perfil que registraste, esto es lo que encontramos para ti:
{{2}}

Responde este mensaje y aquí mismo te ayudamos a apartar día y hora.
```

Categoría Marketing, español (MX), sin botones ni encabezado: la respuesta debe llegar como texto libre para que el Agente 2 la tome.

Lo que cambió respecto a la plantilla anterior: voz de equipo (antes "soy Rebe" / "quedo atenta", que no funciona si contesta otra persona), explicación de qué son y por qué convienen las citas, **30 minutos** en lugar de los 20 que decía —la grilla real es de 30, `CITAS_DURACION_BLOQUE_MINUTOS`— y cierre que pide respuesta para abrir la ventana de 24 h.

## Restricción de WhatsApp que obligó al formato de `{{2}}`

El valor de una variable de plantilla **no puede traer saltos de línea, tabs ni más de 4 espacios seguidos**; WhatsApp rechaza el envío (no la aprobación). `textoSugerencias()` unía los sponsors con `\n`, así que el primer envío real habría tronado.

`{{2}}` va en un solo renglón, con negritas (que sí se renderizan aunque vengan en el parámetro). Las soluciones son las etiquetas del multi-select de Notion, no prosa escrita a mano:

```
*Blip* (Estrategia de marketing digital, Omnichannel) · *Flow* (Pagos, Plataforma eCommerce) · *Platica.mx* (Omnichannel) · *Revie* (CRM / automatizacion, Customer experience)
```

## Segundo hallazgo (mismo día, al verificar la cola antes del primer disparo)

`textoSugerencias()` volcaba **todas** las `Solucion` del sponsor, no las que embonan con el asistente. Medido contra la cola real de 4 asistentes de prueba:

| Asistente | Sponsors | `{{2}}` antes | Cuerpo | `{{2}}` ahora | Cuerpo |
|---|---|---|---|---|---|
| Samantha Rivas | 4 | 463 | **1035 — rechazado** | 246 | 818 |
| Liz Melchor | 4 | 335 | 904 | 175 | 744 |
| Adler Calvillo | 3 | 355 | 927 | 183 | 755 |
| Luis Portugal | 2 | 144 | 715 | 79 | 650 |

El tope de Meta para el cuerpo armado es **1024 caracteres**, así que a Samantha no le habría llegado nada. Además se leía como un muro de etiquetas genéricas, incluía el comodín `Otro` y a Luis le tocaba `*Envia.com* (Otro)` porque esa es la única solución marcada de ese sponsor.

Arreglo (pedido de Adler, que era la intención original: "las soluciones que marcó el asistente que buscaba y que el sponsor ofrece"):

- `solucionesRelevantes()` nueva: intersección de `Solucion` del sponsor con `Soluciones Buscadas` del asistente, **máximo 2**, sin `Otro`.
- Sin intersección (registro legacy sin `Soluciones Buscadas`) cae a lo que ofrece el sponsor, para no dejar el nombre pelado. Si tras quitar `Otro` no queda nada, va solo `*Empresa*` sin paréntesis.
- Resguardo de longitud: si `{{2}}` pasa de 400 caracteres —nombres de empresa muy largos— baja a 1 solución por sponsor y, en el peor caso, a puros nombres. Un mensaje escueto es mejor que uno que Meta rechaza en silencio.
- `payloadPara()` ahora pasa `contacto.solucionesBuscadas` a `textoSugerencias()`.

Se descartó usar `Servicios / Producto` (que sí trae prosa legible: Revie = "Plataforma de Reseñas, automatizaciones y campañas por WhatsApp para Ecommerce"): mide 80–210 caracteres por sponsor y con cuatro no cabe en el cuerpo.

## Cambios de código (`campanas-matchmaking.service.js`)

- `textoSugerencias()`: formato `*Empresa* (solución)` unido con ` · `, en una sola línea. Antes: `1. Empresa — Solución` separado por `\n`.
- `limpiarParametroPlantilla()` nueva: quita saltos de línea, tabs y espacios dobles de **nombre y lista** antes de mandarlos. El nombre viene de Notion y también puede traer basura.
- `payloadPara()`: 2 params (`[nombre, sugerencias]`). Antes 5, con horario 1–3.
- **Se retiró el filtro `SIN_HORARIOS_SUGERIDOS`** (decisión de Adler). Antes, si ninguno de los hasta 4 sponsors tenía un bloque libre en ese instante, no se enviaba ni se marcaba: gente con buenos matches se quedaba sin oferta. Ahora tener sponsors sugeridos basta.
- Como consecuencia se borró `elegirHorariosDeSugerencias()` (y su export) y la carga de `cargarIndiceCitasConfirmadas()` en el disparo: ya no hay query paginada a Notion por corrida. El fallback por score del 26-ago queda sin efecto porque no hay horarios en el mensaje.
- `TEMPLATE_SIMULACION` (fallback si falta el env, solo en simulación) es `agendar_cita_inicial`, el nombre aprobado en Meta el 28-ago. El envío real sigue exigiendo `PLATICA_TEMPLATE_OFERTA_INICIAL` en Coolify.

Los horarios los ofrece el agente en la conversación con `consultar_disponibilidad_cita`, que revalida contra Notion en ese momento. Antes se mandaban horarios calculados al momento del disparo, que podían estar ocupados cuando la persona contestara.

## Tests

`node tests/campanas-matchmaking.manual-test.js` — 10 casos, todos pasan.

Nuevos / reescritos:
- `casoSolucionesCruzadasConLoQueBusca`: solo salen las soluciones que el asistente pidió, tope 2, y un sponsor con puro `Otro` queda como `*Envia.com*`.
- `casoSugerenciasNoPasanElMargen`: 4 sponsors con nombres largos → `{{2}}` ≤ 400 y se recorta a 1 solución por sponsor.
- `casoTopCuatroYParamsEstables`: 2 params, `*Empresa 1* (Solución 1)`, sin `\n` ni `\t` en `params[1]`, y `sponsorsConsultados` vacío (el disparo ya no consulta disponibilidad).
- `casoParametroSaneadoParaWhatsApp`: `Ana\nMaría` → `Ana María`; `Marketing   por WhatsApp` → un solo espacio.
- `casoSinBloquesLibresIgualEnvia`: con los 4 sponsors sin bloques libres ahora envía y marca (antes `sinEnviar` + `SIN_HORARIOS_SUGERIDOS`).

Se borraron los 5 casos del fallback de horarios (`casoHorariosSalenDelSponsorTop`, `casoTopConPocosHorariosIgualEnvia`, `casoFallbackAlSegundoSponsor`, `casoFallbackAlTercerSponsor`, `casoTodosLosSugeridosSinHorarios`): probaban comportamiento que ya no existe. **No es regresión, es alcance retirado a propósito.**

## Prompt del Agente 2 (aplicado en Plática el mismo día)

Prompt activo `2Qv2wfoJ7Z4qfUhUamun` (28 ago 2026, 22:02 UTC), agente `c1IYnFsr0Jzfqq4NeLAs`. Snapshot local actualizado en [`prompts-agentes-platica/Prompt y detalles - Citas 1-1 - Gestión de Citas Fashion Digital Talks.md`](prompts-agentes-platica/Prompt%20y%20detalles%20-%20Citas%201-1%20-%20Gesti%C3%B3n%20de%20Citas%20Fashion%20Digital%20Talks.md).

1. **Tono sin Rebe.** El encabezado decía "como Rebe en ediciones anteriores" y el cuerpo "el referente es el tono de Rebe". Ya tenía prohibido decir "Soy Rebe", pero tener el nombre como referente es lo que provoca que se firme con él. Ahora: voz de equipo, en plural, sin nombre propio.
2. **Sección nueva `CUANDO LA CONVERSACIÓN ABRE CON LA OFERTA INICIAL`.** El prompt asumía que el agente abre la conversación con saludo + explicación + 4 viñetas. Con la plantilla eso ya lo recibió la persona, así que repetirlo se siente a robot. La sección le dice qué hacer con un "sí" general, con un sponsor ya nombrado, y con un sponsor que no viene en `sugeridas` (no negarlo de golpe: la lista pudo cambiar entre el disparo y la respuesta).
3. **Duración explícita.** Antes solo decía "no digas que duran 20 min". Como la plantilla afirma 30 minutos, ahora responde 30 si preguntan.

El paso 1 del flujo Agendar remite a la sección nueva en vez de armar el primer mensaje.

El snapshot local también venía atrasado una versión: le faltaba `OoYEKAW7ddAtKXO7kSsg` (21:15 UTC, el `hora=HH:MM` del bug de las 15:00). Ya está incorporado.

## Pendiente

1. ~~Adler crea la plantilla en Meta~~ Cerrado: `agendar_cita_inicial` aprobada y puesta en `PLATICA_TEMPLATE_OFERTA_INICIAL`. **El nombre va en minúsculas**: Meta no acepta mayúsculas en nombres de plantilla, aunque la interfaz de Plática lo muestre capitalizado.
2. Envío real sigue detrás de `CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO=true`. `marcar-cola-sin-enviar.js` **no se necesita para la prueba del 28-ago**: la cola `Aprobado` sin campaña son 13 filas de 4 asistentes de prueba (Samantha Rivas, Liz Melchor, Adler Calvillo, Luis Portugal), ninguno con `Última Campaña Enviada` y ningún número externo. Sí se necesitará antes del primer disparo con asistentes reales.
3. Probar en conversación real, con la plantilla ya aprobada, que el agente no repite la explicación ni la lista al recibir la respuesta.
