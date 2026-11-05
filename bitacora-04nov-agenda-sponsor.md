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

## Pendientes
- Cron del recordatorio de 24 h, cuando Adler lo pida.
- Desplegar este código para que `consultar_sugeridas` devuelva `agenda_sponsor` en producción. El prompt ya está en vivo.

Los tres clientes sintéticos de las pruebas quedaron borrados: `client_333d2f6a-1430-4a78-b8aa-3e208f8e394f`, `client_0eb6fded-c1ec-4180-b9cf-af355f0282d1`, `client_a66cae6e-d5a7-4d26-9d5e-9d00db40db6e`.

## Agente de Citas y de Marketing (mismo día)

Pedido: que Citas distinga al sponsor, que nadie reserve por él, y que los dos agentes no repitan etiquetas ni campos internos. Si alguien se enoja, dicen que son una inteligencia artificial y ofrecen a una persona. Decisión de Adler en el cierre del 3-nov; este turno lo dejó en vivo.

`consultar_sugeridas` , si el WhatsApp no es Asistente y sí es Sponsor, responde `es_sponsor`, los tres `puede_*` en falso y `agenda_sponsor`. Lectura de producción de Marco: 6 reuniones reales, sin los tres bloqueos del 8-oct por la mañana. `reservar` rechaza esa ficha con `SPONSOR_NO_PUEDE_RESERVAR` (403). No se cambió `CITAS_FASE_EVENTO_SIMULADA`: hoy el calendario ya cae en `despues`.

Prompts: Citas `u54Ku2oazpoxk6AO8bPw`; Marketing `MEaEkHOdGn3k9893GH0F`. Snapshots en `prompts-agentes-platica/`.

Chats internos, sin WhatsApp. Sponsor (`chat_f7fd7b1d`): no agendó y dijo que la edición ya terminó; a «¿Eres un bot?» respondió el texto de inteligencia artificial. Asistente (`chat_bc0f174c`): preguntó con qué empresa, no le aplicó el bloqueo de sponsor. Marketing (`chat_ce2fb133`): «tokens» lo cortó la plataforma («No puedo ayudarte»); al pedir que no le escriban pidió disculpas y dijo que dejan de escribir. `node tests/agenda-sponsor.manual-test.js` OK.
