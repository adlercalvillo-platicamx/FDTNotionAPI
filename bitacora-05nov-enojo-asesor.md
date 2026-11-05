# Bitácora 05nov — enojo, asesor y no volver a molestar
Handoff. Código gana si esto contradice algo.
Fecha: 5 nov 2026. Sin commit. Continúa [bitacora-04nov-agenda-sponsor.md](bitacora-04nov-agenda-sponsor.md).

## Pedido y decisión
Adler: dejar el texto de Laura cuando detectan la IA. Si están molestos y no piden que dejemos de escribir, ofrecer consulta o un asesor, y pasarlos solo si dicen que sí. Si dicen contacto equivocado o que no quieren mensajes, sí decir que no les vamos a volver a escribir, porque esas etiquetas ya los marcan. La baja automática no se construye.

## Qué cambió y por qué
El prompt de Marketing y el de Citas prometían “damos de baja tu contacto” sin escribir nada. Eso se quitó.

- Inteligencia artificial: “Sí, soy una inteligencia artificial… ¿En qué te ayudo?” Sin asistencia en ese turno.
- Molestia o “gastando tokens”, sin pedir que dejemos de escribir: “Lo último que queríamos era molestarte. Estoy aquí si tienes cualquier consulta. Si lo deseas, te paso con un asesor especializado.”
- Contacto equivocado, elimínenme o no recibir mensajes: “Lo último que queríamos era molestarte. No te preocupes, no te vamos a volver a escribir.” Sin asesor y sin asistencia. Adler pidió “escribir” para no repetir “molestar”.
- Si en el mensaje siguiente aceptan al asesor, ahí sí escala una vez.

En Marketing, DROP40 ya no abre con disculpa ni confirma una baja por una molestia sola. El flujo de baja ya no le pide al agente que registre nada.

## Cómo operarlo
Etiquetas automáticas de Plática, hoy: `No recibir mensajes` y `Contacto equivocado - eliminar de listas`. El agente no las pone ni las nombra. `Interés en no recibir mensajes` salió en un contacto el 2 oct y ya no está en la lista de etiquetas.

Esas etiquetas marcan al contacto. No sacan solas a la persona de una audiencia de campaña ni del checkbox `Dado de Baja` de Notion.

## Evidencia
| Agente | Prompt activo |
| --- | --- |
| Marketing `4HoKf6mkEekTKA3jXFK3` | `xywUZqKimpPYtdaMRyHb` |
| Citas `c1IYnFsr0Jzfqq4NeLAs` | `UEVGcZB7OHS3IEb4guBD` |

Asistencia sigue activada. El primer enojo no llama `call_for_help`.

## Pendientes
- Adler manda por su WhatsApp la prueba cuando quiera. Su contacto sigue `active`.
- Bloqueados el 5 nov, motivo `No recibir mensajes`: los 15 de esa etiqueta. No se bloqueó “Contacto equivocado” (incluye a Adler, Liz y Luis) ni “Interés en no recibir mensajes” (pasa de 50 y mezcla interés en asistir).
- Prompts tras quitar “quién eres” del bloqueo: Marketing `h2ZPiaSxWvG9ITTEIcg1`, Citas `ytBqoQ9mdXCNLhx3zetr`. Ocho chats internos. Bloquearon: tokens, “elimínenme”, “no quiero recibir mensajes” y “cambió de dueño”. No bloquearon: “quién eres”, “eres un bot” y “creo que se equivocaron, cuéntame”. La tool de bloqueo se llamó con `status: blocked` y falló solo porque el chat interno no trae teléfono.
- La baja de Notion sigue sin construirse.

## Campaña y bloqueo (mismo día)

Audiencia de una sola persona, Adler, con `status: blocked`. Campaña `prueba bloqueo no enviar` (`2yFT9O4xbT8HnupupZyI`), plantilla `lastcall_cita1a1`, canal `wb-1167456423128610`. El envío respondió 409: “Todos los contactos de la audiencia están bloqueados”. No salió WhatsApp. Se quitó a Adler de esa audiencia y se desbloqueó. “No recibir mensajes” son 15 contactos. Las otras dos etiquetas pasan de 50 cada una.

## Bloqueo (mismo día)

Adler pidió bloquear cuando pidan no recibir mensajes o digan que el contacto es equivocado. No hace falta backend nuevo.

Marketing ya tenía `platica_update_client_xwr3zo`, que acepta `status: blocked` y toma el teléfono de la conversación. A Citas se le conectó la misma tool. El prompt les dice que la llamen solo en ese caso, sin otros campos y sin decir “bloqueado”.

Prueba con un contacto ficticio, luego borrado:
- La API dejó `status: blocked` y guardó el motivo. Las plantillas a un bloqueado responden 409 y no salen. El envío de campañas también los excluye. Fuente: [enviar plantilla](https://docs.platica.mx/api/mensajes/enviar-plantilla) y [enviar campaña](https://docs.platica.mx/api/campañas/enviar-campaña).
- Anna dijo la frase y llamó la tool solo con `{"status":"blocked"}`. La tool falló en ese chat interno: “No se encontró el número de teléfono en la conversación.” En WhatsApp el hilo sí trae el número.
- En ese mismo contacto cayeron solas `No recibir mensajes`, `Contacto equivocado - eliminar de listas` e `Interés en no recibir mensajes`. El catálogo de etiquetas sigue listando las dos primeras; la tercera apareció en el contacto de la prueba.

| Agente | Prompt activo |
| --- | --- |
| Marketing | `PKNhKqDOs3z29BHd3BET` |
| Citas | `Mj9Yw7H3IkgXcWRJoUsh` |
