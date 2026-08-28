# Bitácora 28-ago — explicar citas 1a1 al responder la oferta inicial

Sigue de [`bitacora-28ago-plantilla-oferta-inicial.md`](bitacora-28ago-plantilla-oferta-inicial.md). Pedido de Adler: el asistente no busca las citas 1a1 (van incluidas en el registro); muchos no procesan la plantilla y el agente preguntaba “¿con cuál quieres empezar?” como si ya se hubiera entendido.

## Prompt

Agente `c1IYnFsr0Jzfqq4NeLAs` (Gestión de Citas). Solo se tocó la sección `CUANDO LA CONVERSACIÓN ABRE CON LA OFERTA INICIAL`. Backend y workspace de Laura: no.

| | ID | UTC |
| --- | --- | --- |
| Anterior | `JtYcoCujRetTxvkN8cLi` | 28 ago 2026, 22:49 |
| Activa | `grIyFz9PHRvrwtQ2UUwS` | 28 ago 2026, 22:54 |

(Antes de `DwD7kKEXBppRYwCGT96a`: `2Qv2wfoJ7Z4qfUhUamun` a las 22:02.)

Snapshot: [`prompts-agentes-platica/Prompt y detalles - Citas 1-1 - Gestión de Citas Fashion Digital Talks.md`](prompts-agentes-platica/Prompt%20y%20detalles%20-%20Citas%201-1%20-%20Gesti%C3%B3n%20de%20Citas%20Fashion%20Digital%20Talks.md).

## Qué cambió

1. **“Sí” general:** ya no está prohibido mencionar las citas. Una sola línea de recordatorio (30 min, incluidas en el registro, sin costo, tú decides con quién) y luego las de `sugeridas_para_ofrecer` en prosa (**hasta 4**; a las 22:34 decía “2 o 3”, residuo del límite anterior). No se reenvían las 4 viñetas ni el párrafo de la plantilla.
2. **Sponsor ya nombrado:** igual que antes, directo a horarios, sin recordatorio.
3. **Confusión en cualquier momento** (“qué es esto”, “para qué sirve”, “no entiendo”, “tengo que pagar”, “es obligatorio”): explicación completa — reuniones privadas de 30 min, incluidas en el registro, sin costo extra, con expertos de empresas que ya resuelven los retos que tienes según las soluciones que buscas. Opcionales: tú eliges con quién y a qué hora. Mismo lenguaje que `CÓMO SE VE UN MENSAJE` y que la plantilla `agendar_cita_inicial` (ya no “proveedores y aliados”).
4. **Sin** “el sponsor te busca / quiere conocerte”. Adler: no enfatizar esa dirección.

## Ajuste 22:49 UTC — mismo texto que la plantilla

`F7LmUNUU2hwWNOPcF3WX` → `JtYcoCujRetTxvkN8cLi`. Adler escribió “Hola” sin plantilla y el agente usó “conectan con proveedores y aliados”. Se alinearon las dos fuentes:

- `CÓMO SE VE UN MENSAJE` punto 2 (quien escribe por su cuenta)
- Párrafo de confusión en `CUANDO LA CONVERSACIÓN ABRE CON LA OFERTA INICIAL`

Ambos: expertos que resuelven tus retos según las soluciones que buscas.

## Ajuste 22:54 UTC — ejemplo de FLUJOS

`JtYcoCujRetTxvkN8cLi` → `grIyFz9PHRvrwtQ2UUwS`. El ejemplo de Agendar (“Hola Alejandra,”) ya no dice “proveedores y aliados”; usa el mismo lenguaje de la plantilla. Las tres fuentes (mensaje de apertura, confusión, ejemplo de FLUJOS) coinciden.

## Pendiente de prueba

En chat real: un “sí” sin elegir debe traer la línea corta + pregunta en prosa; un “Revie” debe ir a horarios; un “¿qué es esto?” debe traer la explicación completa, no el recordatorio de una línea.
