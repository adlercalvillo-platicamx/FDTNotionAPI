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
- **Marketing sigue dando el programa viejo a prospectos.** Su knowledge
  `Evento FDT 2026 — Fuente de verdad del evento`
  (`6TSizqkFOPBKnYnErdAi`) necesita el programa del 20-sep. No se tocó: es de
  otro hilo y no hubo instrucción.
- Prueba de “no reservar sin confirmación”: hace falta un sponsor de prueba
  para no mandar `.ics` a un sponsor real.
- Abrir el QR desde un teléfono real (Adler o Laura); lo probado aquí fue el
  backend y la conversación por API.
- Brand Lift expone el 8-oct 15:00 y no tiene bloqueo, pero tampoco existe
  como `Categoria=Sponsor`: hoy no puede recibir citas. Solo actuar si se da
  de alta.
