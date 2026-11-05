# Bitácora 04nov — agenda en el WhatsApp del sponsor
Handoff. Código gana si esto contradice algo.
Fecha: 4 nov 2026. Sin commit. Sigue el cierre de [bitacora-03nov-faqs-duplicados-carga.md](bitacora-03nov-faqs-duplicados-carga.md).

## Pedido y decisión
Adler actualizó en Meta las tres plantillas de sponsor y creó `recordatorio_sponsor_agenda_24h`. Las cuatro quedaron `APPROVED`. Decisión: dejar el armado listo y no mandar nada en este turno.

## Qué cambió y por qué
Al agendar, modificar o cancelar, el WhatsApp del sponsor lleva su primer nombre, la persona y la empresa del asistente, y la agenda de sus citas reales. Un nombre o empresa en mayúsculas sostenidas pasa a título; el resto se queda. Los bloqueos del programa no entran. Si el mensaje no cabe en 1024, la agenda suelta empresa, modalidad y mesa, y al final corta con cuántas reuniones faltan.

`listarCitasRealesPorSponsor` lee las confirmadas del sponsor. El recordatorio de 24 h solo arma `{{1}}` y `{{2}}` (`armarRecordatorioSponsor24h`). No tiene ruta ni cron.

## Cómo operarlo
Coolify ya apunta las tres env `PLATICA_TEMPLATE_SPONSOR_CITA_*` a los nombres aprobados. El próximo reservar, modificar o cancelar real usa el texto nuevo. Hoy no hay citas que dispararlo.

`PLATICA_TEMPLATE_SPONSOR_AGENDA_24H=recordatorio_sponsor_agenda_24h` está en `.env.example`. No enviar hasta que se pida el cron.

## Evidencia
`node tests/notificacion-sponsor-whatsapp.manual-test.js` OK. Patricia Lopez, de Nomadas; primer nombre Marco; agenda `7 oct 10:30 am, Patricia Lopez de Nomadas, mesa 6, presencial`. Sin WhatsApp.

## Enojo, como lo pidió Laura (misma noche)

Adler vio las pruebas de las 23:04: Citas pasó a asistencia y Marketing pidió disculpas. En la junta del 30-oct Laura dijo otra cosa. Si detectan que es una IA, que no llame a auxilio: que diga que sí lo es, que está para ayudar, que consigue la información y que ve con el equipo quién responde, y que pregunte en qué ayuda. Si el mensaje no era para esa persona o pide que no le escriban: baja, “lo último que queríamos era molestarte”, sin disculpa y sin pasar a alguien.

Citas `4dSGhQDLnUkgFZRSNj6j`. Marketing `uYqH39xTWd8REaHTkSQy`. Los disparadores de asistencia ya no escalan ese caso. Reprueba interna, sin WhatsApp: Citas contestó el texto de inteligencia artificial y no llamó asistencia (`chat_12da4f3b`). Marketing contestó la baja (`chat_4d637bd7`). Esos dos clientes de prueba quedaron borrados. La frase “gastando tokens” la puede cortar el moderador de la plataforma como spam; el prompt no la alcanza.

## Prueba de sponsor y de ficha (misma noche)

Chats internos, sin WhatsApp. Sponsor pidió cita nueva: dijo que la edición ya terminó y no llamó `reservar`. Asistente pidió cita: pidió folio, no le aplicó el bloqueo de sponsor. Ficha: Citas dijo que tipo de usuario y notas son internos y no repitió `etiqueta_interna_prueba`. Marketing lo cortó un guardrail de privacidad (“No puedo ayudarte”) y tampoco lo repitió.

La primera vez que el sponsor pidió agenda, el chat no traía WhatsApp y pasó a asistencia. Quedó corregido en `1xg2tCY90nYYa8xJqfFF`: sin número no inventa uno, no llama la tool y no escala. Reprueba `chat_44e3b815`: “Desde aquí no me aparece ninguna reunión. Tu tipo de usuario y las notas de tu ficha son información interna que no compartimos.” Sin herramientas. Los cinco clientes de prueba quedaron borrados. La agenda real de un sponsor en WhatsApp sigue dependiendo del deploy de `cc712b7`.

## Ajuste: giro y soluciones buscadas sí se dicen (5-nov)

Adler pidió no romper lo que el agente ya decía. El prompt del 3-nov ya decía nombre, empresa de registro, boleto, folio, correo propio y puesto. El giro y las soluciones buscadas no estaban prohibidos. Lo que sí estaba prohibido desde antes: correo y teléfono del sponsor, tamaños, filtros, etiquetas e IDs.

Citas `6oInCScgzvYDZAQX17t8` y Marketing `afUgX1Wr7r8jp6oswEUO`. Prueba interna: Citas dijo marca de moda, CRM y pagos, y director comercial, y no soltó la etiqueta. Marketing dijo Retailer y Logística, cotizó el presencial con 40% en $1,794 y no soltó etiqueta ni tipo de usuario. Los dos clientes de prueba quedaron borrados. Área, tamaño, web y redes no se agregaron: el prompt viejo no los decía.

## Ajuste: la ficha no debe tapar el boleto ni el folio (5-nov)

La regla de “no compartir la ficha” decía que de la ficha solo se usaba el nombre. Eso cortaba dos cosas que sí se usan: el tipo de boleto (virtual o presencial, con Meet o Club France) y el folio propio de la persona. Citas `wjFh1s6pGwUzmclIJGqm` y Marketing `4dIJJY6kaL5DRY6bjvOb` ahora tienen una lista explícita de lo que sí puede decir. Sigue prohibido todo lo demás de la ficha.

Pruebas internas, sin WhatsApp: Citas dijo “tu boleto es Virtual” y no mostró tipo de usuario ni tema. Marketing confirmó “Presencial” y dijo que las notas son internas. Citas repitió el folio de la persona. Los tres clientes de prueba quedaron borrados.

## Pendientes
- Cron del recordatorio de 24 h, cuando Adler lo pida.
- Adler confirmó el 5 nov que `cc712b7` ya está desplegado en Coolify.

Los tres clientes sintéticos de las pruebas quedaron borrados: `client_333d2f6a-1430-4a78-b8aa-3e208f8e394f`, `client_0eb6fded-c1ec-4180-b9cf-af355f0282d1`, `client_a66cae6e-d5a7-4d26-9d5e-9d00db40db6e`.

## Agente de Citas y de Marketing (mismo día)

Pedido: que Citas distinga al sponsor, que nadie reserve por él, y que los dos agentes no repitan etiquetas ni campos internos. Si alguien se enoja, dicen que son una inteligencia artificial y ofrecen a una persona. Decisión de Adler en el cierre del 3-nov; este turno lo dejó en vivo.

`consultar_sugeridas` , si el WhatsApp no es Asistente y sí es Sponsor, responde `es_sponsor`, los tres `puede_*` en falso y `agenda_sponsor`. Lectura de producción de Marco: 6 reuniones reales, sin los tres bloqueos del 8-oct por la mañana. `reservar` rechaza esa ficha con `SPONSOR_NO_PUEDE_RESERVAR` (403). No se cambió `CITAS_FASE_EVENTO_SIMULADA`: hoy el calendario ya cae en `despues`.

Prompts: Citas `u54Ku2oazpoxk6AO8bPw`; Marketing `MEaEkHOdGn3k9893GH0F`. Snapshots en `prompts-agentes-platica/`.

Chats internos, sin WhatsApp. Sponsor (`chat_f7fd7b1d`): no agendó y dijo que la edición ya terminó; a «¿Eres un bot?» respondió el texto de inteligencia artificial. Asistente (`chat_bc0f174c`): preguntó con qué empresa, no le aplicó el bloqueo de sponsor. Marketing (`chat_ce2fb133`): «tokens» lo cortó la plataforma («No puedo ayudarte»); al pedir que no le escriban pidió disculpas y dijo que dejan de escribir. `node tests/agenda-sponsor.manual-test.js` OK.
