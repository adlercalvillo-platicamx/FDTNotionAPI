# Bitácora 20sep — programa de conferencias en el Agente 2 y bloqueo de Mercado Libre
Handoff. Código gana si esto contradice algo.
Trabajo 20-sep-2026. Continúa [bitacora-20sep-vip-horarios-reintentos.md].

## Pedido y decisión

Adler: cuando el agente no puede ofrecer una cita 1a1, el copy decía “podrás
conocer a las empresas en sus espacios”. No le gustó. En vez de eso, invitar a
las **conferencias** y poder decir a qué hora expone cada empresa.

Se evaluaron dos fuentes para el horario. Las filas de bloqueo de agenda en
Notion traen hora y empresa, pero solo de los sponsors que además tienen
contacto 1a1: quedan fuera Brand Lift y todas las marcas invitadas al
escenario. Decisión de Adler: **base de conocimiento en Plática** con el
programa oficial completo, no un endpoint que lea los bloqueos.

## Programa: qué cambió desde el 3-sep

Adler pasó el programa vigente. Contra el que se usó el 3-sep
([bitacora-03sep-programa-bloqueos-speaker.md](bitacora-03sep-programa-bloqueos-speaker.md)):

- Se cayeron “Beyond the Transaction” (7-oct 18:00), “Cómo Crear Experiencias
  Omnicanal que Conviertan” y “Después de la tendencia” (8-oct).
- Entró “La belleza más allá de productos” con Ulta Beauty (8-oct 17:00).
- Marketplaces (Brand Lift) pasó de 8-oct 11:30–12:30 a **15:00–15:30**.
  Cross-Border (Cofoce) pasó de 14:30–15:30 a **14:30–15:00**.
- Las cinco sesiones que no traían ponentes ya los tienen. Entraron Canaive,
  Business France, Flexi, Totalpass, Skechers, Arkatha, Moda Uniforme, Steve
  Madden, Decathlon, Paruno, Unlocked AI, Seicento, Bernarda y Ulta Beauty.

Los 10 bloqueos que ya existían en Citas de Laura siguen correctos: ninguna de
esas sesiones se movió de hora.

## Notion: bloqueo de Mercado Libre (escritura real)

Mercado Libre entró al programa el **8-oct 13:00–13:30** (“El futuro de la moda
es online”, Amelie Mossberg y Aaron Braiman) y es sponsor de 1a1 desde el
18-sep. Sin bloqueo, el sistema le podía agendar una cita mientras estaban en
el escenario.

Script: `scripts/one-shots/bloqueo-mercado-libre-programa-20sep.js --confirmar`.
Idempotente en el alta; **no reejecutar sin revisar**.

| Qué | Valor |
|---|---|
| Fila de bloqueo creada | `3e262dda-199a-812b-bb1e-c757515ca04a` |
| Sponsor | Mercado Libre `3df62dda-199a-81c3-b9a2-ffb0478b4663` |
| Horario | `2026-10-08T13:00:00-06:00` → `13:30` |
| `Es Speaker` | estaba en false, quedó en **true** |
| Verificación | `sponsorOcupadoEnBloque=true`, `contarCitasEnBloque=0` (no resta mesa) |

**Brand Lift sigue sin bloqueo** y ahora expone 8-oct 15:00. No existe como
contacto `Categoria=Sponsor` en Contactos de Laura, así que no hay fila que
crear. Pendiente desde el 3-sep.

## Plática: knowledge y prompt

Agente 2 `c1IYnFsr0Jzfqq4NeLAs`, workspace `yay7N6Iejg62P9h0nJaU`.

- Knowledge nueva **`Programa FDT2026`** (`ntTj1Qn7m5PEsH74KuCJ`, active). Son 5
  entradas ahora. Copia local:
  `prompts-agentes-platica/Programa FDT2026 - conferencias y horarios.md`.
- Prompt: dos ediciones exactas sobre `VcdnpLA164GE5Y5p1o6f`.
  - `JS1yWw8kplAmMXXDNgRO`: sección nueva `PROGRAMA DEL EVENTO (conferencias)`
    entre `DUDAS SOBRE SPONSORS` y `HERRAMIENTAS`, con el copy aprobado de
    boleto Expo.
  - `Ox75lg442DR0R7TL74e2` (**activa**): `HUMANO` deja de escalar preguntas de
    speakers y del programa.
- Snapshot resincronizado con el texto vivo. De paso se quitó un bloque
  duplicado de Identidad/Herramientas que había quedado en el resync anterior.

El agente responde día, hora y nombre de la sesión; si la empresa no está en el
programa lo dice en vez de inventar; aclara que las conferencias son abiertas
incluso para boleto Expo; y tiene prohibido usar el programa para ofrecer citas
o para explicar por qué alguien no tiene citas disponibles.

## Copys: qué entró y qué no

Entró solo el de **boleto Expo**:

> Tu boleto Expo incluye acceso al piso de exhibición, pero no incluye citas
> 1a1. Lo que sí puedes hacer es entrar a las conferencias de las empresas
> durante el evento. Dime cuál te interesa y te paso el día y la hora en que
> expone.

**No** entraron, a propósito:

- **Giro no elegible** (antes y durante el evento). El backend todavía no
  distingue “no eres elegible” de “ya no hay más opciones”: las dos situaciones
  llegan al agente como listas vacías, y hoy responde con
  `copy_sin_mas_opciones`. Meter el copy de giro ahora haría que se lo diga a
  gente que sí es elegible y solo agotó la pasada.
- **Folio** (no encontrado por WhatsApp, encontrado por folio, folio no
  encontrado). No existe la búsqueda por folio.
- **Después del evento**. Depende de `fase_evento`, que no está implementado.

El saludo “Hola [Nombre]” va **solo** si es el primer mensaje de la
conversación; los copys son el cuerpo.

## Pendientes

- Backend: distinguir “no elegible por giro” de “se agotaron las opciones”, para
  poder meter ese copy.
- Backend: búsqueda por folio (Folio Reservación / Folio Boleto).
- `fase_evento` para el copy posterior al evento y para el frontdesk solo el
  7 y 8 de octubre.
- Brand Lift: alta como Sponsor y después el bloqueo 8-oct 15:00.
- Si el programa vuelve a cambiar, hay que actualizar la knowledge
  `ntTj1Qn7m5PEsH74KuCJ` **y** revisar si algún sponsor cambió de hora.
