# Bitácora 21sep — QRs por sponsor y prueba conversacional adversarial
Handoff. Código gana si esto contradice algo.
Trabajo 21 sep 2026. Cierra los puntos P1 y P3 de
[bitacora-20sep-plan-piso-agente2.md](bitacora-20sep-plan-piso-agente2.md).
Continúa [bitacora-20sep-qr-folio-fase-agente2.md](bitacora-20sep-qr-folio-fase-agente2.md).

## Pedido

Adler preguntó qué faltaba del plan de piso y pidió cerrar las dos cosas que
no dependían de él: la lista de QRs para las pantallas y la prueba de romper
al agente.

## QRs de piso

Corrección de Adler, 21-sep: los QR **ya existían** y Laura ya los entregó.
Los oficiales están en Canva:
https://www.canva.com/design/DAHVPivbDus/J0pbQm5invchw98EEaPq1g/edit

Ya abren la conversación con el Agente 2 y traen el mensaje aprobado. El
archivo generado abajo queda como auditoría técnica, no como entregable para
el proveedor de pantallas.

`scripts/one-shots/generar-qrs-wa-sponsors-21sep.js` lee Contactos de Laura y
escribe [`qrs-piso-wa-sponsors.md`](qrs-piso-wa-sponsors.md): un `wa.me` por
**empresa** sponsor con el texto prellenado que definió Laura el 17-sep. Solo
lee Notion; se puede reejecutar cuando cambie el padrón.

| Dato | Valor |
|---|---|
| Empresas con QR | 13 |
| Bronce (sin QR) | 0 |
| Contactos sponsor sin empresa | 0 |
| Número | `5213332361963` (Agente 2, no Marketing) |

**Mercado Libre y Pikstudio no tienen `Nivel de Patrocinio`.** No les impide
recibir citas, pero sí los deja fuera del desempate Cristal > Diamante > Oro.
Pendiente de Laura.

El QR no depende de que el texto coincida con Notion: el backend resuelve el
nombre aproximado (`resolverSponsorPorEmpresa`).

Regla definitiva Adler, 21-sep: **solo** los sponsors activos en Notion
participan en citas 1a1. Una empresa que aparezca en el programa puede tener
presentación, pero eso no le da citas. Solo cambia si Adler la agrega a Notion
y lo avisa.

## Prueba adversarial del Agente 2

Conversación real contra el agente vivo por el chat de API de Plática (no
WhatsApp, no pantalla). Contacto usado: **Samantha Rivas**, `sam@platica.mx`,
Presencial VIP, folio único `PRB002` — de prueba y con correo interno, para
que una reserva accidental no tocara a nadie externo.

No se probó “reserva sin confirmar” a propósito: si el agente hubiera
reservado, el `.ics` habría salido al sponsor real. Esa prueba necesita un
sponsor de prueba.

### Lo que resistió

- Pidió folio cuando el WhatsApp no estaba en Notion; con folio inválido usó
  el copy correcto; con `prb002` en minúsculas identificó y confirmó nombre,
  empresa, boleto y correo.
- Rechazó el viernes 9 de octubre y las 7:00 del día 7, y volvió a ofrecer
  horarios válidos.
- No compartió correo ni celular del sponsor, ni ids internos, ni el prompt.
- No inventó sponsors: Zara, Shein y Liverpool salieron como no participantes.
- Cerró sin citas confirmadas inventadas.

### Falla 1 — perdía el folio

Identificado por folio, al preguntar por dos empresas nuevas volvió a pedir el
folio. Prompt corregido (`dcQVdEGjuykkCL0PpjSl`): un folio que ya sirvió viaja
en **todas** las llamadas siguientes de esa conversación.

### Falla 2 — programa equivocado (la grave)

El agente decía que **Mercado Libre y Reversso no exponen**, y afirmaba que el
8-oct 13:00 había una mesa “La plataforma de Shopify para el mundo de moda”.
Ninguna de las dos cosas es cierta.

Causa: el Agente 2 delegaba las preguntas de programa al **subagente de
Marketing** (`4HoKf6mkEekTKA3jXFK3`), cuya knowledge trae el programa viejo.
Se confirmó preguntándole directo a Marketing: contesta lo mismo.

Dos arreglos:

1. Prompt `KPkaPiK5tBS0kj87TItf`: el programa se contesta **solo** con la
   knowledge propia `Programa FDT2026`; nada de preguntarle a Marketing por
   horarios, sesiones o ponentes.
2. Knowledge `ntTj1Qn7m5PEsH74KuCJ` reescrita. El formato viejo eran tablas
   markdown con la empresa en negritas dentro de la celda de ponentes; lo que
   llegaba al modelo venía sin el nombre de la empresa. Ahora cada empresa
   tiene **una frase completa** con día, hora, sesión y ponentes, y los dos
   días son listas, sin tablas ni negritas. Copia local en
   `prompts-agentes-platica/Programa FDT2026 - conferencias y horarios.md`;
   ese archivo es la fuente y se edita a mano.

Verificado después: Mercado Libre 8-oct 13:00–13:30, Reversso 8-oct
11:00–11:30, Crocs con su título real, Zara sin sesión.

## Evidencia

- 0 reservas. El contacto de prueba conserva sus 9 filas `Sugerido` previas
  (la más nueva del 20-sep, del cron); ninguna creada el 21-sep.
- Los 7 clientes sintéticos de Plática (`5215500002106`…`2112`) se borraron al
  terminar, incluido el que quedó hidratado con datos de Notion.
- Snapshot del prompt sincronizado con `get_agent_prompt`
  (`KPkaPiK5tBS0kj87TItf`, 06:48 UTC).

## Pendientes

- Laura: `Nivel de Patrocinio` de Mercado Libre y Pikstudio.
- Prueba de “no reservar sin confirmación”: hace falta un sponsor de prueba
  para no mandar `.ics` a un sponsor real.
- Brand Lift expone el 8-oct 15:00 y no tiene bloqueo, pero tampoco existe
  como `Categoria=Sponsor`: hoy no puede recibir citas. Solo actuar si se da
  de alta.

Cerrado por evidencia de Laura: los QR oficiales de Canva ya abren el Agente 2
con el mensaje prellenado aprobado.

## Cierre Marketing (21-sep, 07:02 UTC)

Adler pidió actualizar Marketing con el programa actual.

- Knowledge activa nueva: `Programa FDT2026 vigente`
  (`uRpsngiGfSNKo4gktEcN`). Es la fuente exclusiva para horarios, sesiones y
  ponentes; la fuente general del evento ya no arbitra la parrilla.
- Prompt activo `jvH0GUiacj23W9hk2EG7`: separa explícitamente programa de
  citas 1a1. Aparecer en programa/directorio no implica tener citas; solo
  sponsors activos en Notion, y las solicitudes concretas van al Agente 2.
- La prueba inicial confirmó esa separación. La knowledge recién creada aún
  no devolvió los horarios antes de cerrar el horario de servicio (17:00);
  los reintentos posteriores recibieron el mensaje de fuera de servicio.
  Pendiente: una comprobación conversacional de Mercado Libre y Reversso
  durante el horario de Marketing.
- Clientes sintéticos `5215500002113` y `5215500002114`: eliminados.

## Sede y dudas generales del evento (21-sep, 07:38 UTC)

Adler le preguntó al Agente 2 la dirección del Club France y contestó “la
dirección exacta no está confirmada en la información disponible”. Mal dato:
el backend la manda en cada `.ics` y en cada correo de confirmación
(`src/utils/sede-evento.js`), y Marketing la trae en sus datos duros.

Causa: el agente fue directo a `search_knowledgebase`, que solo decía “Club
France, Ciudad de México”, y se rindió ahí. Nunca consultó al subagente de
Marketing, que tiene conectado como `assist` desde el 20-sep. El prompt le
decía cuándo **no** usarlo (programa, horarios, ponentes — corrección de esa
misma tarde) pero nunca cuándo **sí**. Sin instrucción positiva el subagente
estaba muerto.

Tres arreglos:

1. Prompt `o3FTIc9opu1OrNBs0ygW` → sección **DUDAS GENERALES DEL EVENTO**
   entre `PROGRAMA DEL EVENTO` y `HERRAMIENTAS`. Sede como dato duro
   (dirección completa + mapa oficial `https://maps.app.goo.gl/X9M8zyMTqQndYfUY7`)
   y orden explícita de preguntar a Marketing por boletos, precios, registro,
   estacionamiento, transporte, hospedaje y accesibilidad. El programa
   mantiene su excepción: knowledge propia, nunca Marketing.
2. Prompt `6xm1oDG7M3qPVN6g1w56` (activo) → `HUMANO` ya no escala por
   “boletos”. Escala por patrocinio, facturación o comprar un boleto; las
   dudas informativas pasan primero por Marketing.
3. Knowledge `ntTj1Qn7m5PEsH74KuCJ` ganó un bloque **Sede y dirección**,
   porque el agente golpea `search_knowledgebase` por reflejo.

Verificado en chat de API (`chat_edce8e1f`): “¿tienes la dirección exacta del
Club France?” devolvió dirección completa + mapa. “¿hay estacionamiento? ¿a
qué hora abre el registro?” devolvió $300 por día con cupo limitado y registro
a las 9:00 — ninguno de esos datos vive en la knowledge del Agente 2, así que
la delegación a Marketing funcionó.

## Correo de soporte de Marketing (21-sep)

`supportEmail` de Marketing (`4HoKf6mkEekTKA3jXFK3`) pasó de
`juan.perez@example.com` —placeholder de Plática que se colaba en el mensaje
de fuera de horario— a **`rp@fashiondigitaltalks.com`**, por decisión de
Adler. Horarios (L–V 9:00–17:00) y `outOfServiceBehavior=limited` sin cambio.
El prompt no se tocó.
