# Bitácora 21sep — retro Eduardo Heath / Agente 2
Handoff. Código gana si esto contradice algo.
Fecha del trabajo: 21 sep 2026 (noche). Continúa [bitacora-21sep-qrs-y-prueba-adversarial.md](bitacora-21sep-qrs-y-prueba-adversarial.md).

## Pedido

Adler recibió la retro de Eduardo Heath (prueba del Agente 2). Pedido: partir del prompt vivo, verificar el cambio de nombre, aplicar los 4 afinamientos y probar con Adler Calvillo.

Decisión Adler: conservar **reuniones con expertos** (Luis, por el cliente). No usar “citas de negocios”. Folio: explicar reservación o boleto, correo del día de la compra, spam; solo después recoger datos y pasar a asistencia.

## Qué había en el prompt

El snapshot local (`6xm1oDG7M3qPVN6g1w56`) estaba atrás. El vivo era `Xpo5wPKhs6WaJkP8kqsu` (22 sep 00:11 UTC): Luis ya había prohibido “citas 1a1” / “1a1” al contacto y lo sustituyó por *reuniones con expertos*, zona de Reuniones con Expertos. No era “citas de negocios”.

El chat de Eduardo (`29kjcyV4wVnhkqKXTQ99`, 5218444644160) confirma los 4 puntos: folio sin salida, mesa 3→1 omitida al reagendar, 20 vs 30 explicado tarde, horarios 11:30 / 14:00 / 12:00.

## Qué cambió

- Prompt activo `knaysLsydl5vrN8Q1R9R`. Copy de folio guiado; duración 20+10; confirmación/reagenda con mesa y Club France; horarios en orden cronológico en el chat.
- `seleccionarHorariosParaOferta` ahora ordena el lote de 3 por `inicio` (sigue eligiendo casillas Mañana/Tarde/Día 2). Tests de `tests/horarios-oferta.manual-test.js` actualizados y en verde.
- Asistencia humana **activada**. El primer “no tengo folio” **no** transfiere (en la prueba sí disparó el wait message; se recortó el trigger). Escala cuando ya hay nombre + correo de compra + empresa.
- Adler Calvillo (Notion `3d062dda-199a-81f0-9171-e1a7f6e424a1`, WhatsApp `+52 4492867741`): giro en Notion ya era Marca de moda; Plática tenía Agencia de marketing. Rehidratado por MCP. Folios `PRB004` / `PRB104`. No se le borró el WhatsApp.

## Cómo operarlo

- Coolify fue redesplegado y el MCP refrescado por Adler. El backend ya devuelve `opciones_para_ofrecer` en orden cronológico.
- `PRB004` y `PRB104` están repetidos en cinco clones de prueba. Para probar el caso feliz se cambiaron temporalmente solo en Adler por `ADLER21SEP-R/B`; al terminar se restauraron y verificaron.
- Destinatarios de la prueba E2E: Adler `adlerero666@gmail.com`; CaaS `adler.calvillo@platica.mx`. Ningún correo externo.

## Evidencia

| Prueba | Resultado |
| --- | --- |
| Número no en Notion | Copy de folio completo (reservación/boleto, día de compra, spam) |
| “No encuentro el folio” | Pidió nombre completo, correo de compra y empresa; tras recibirlos transfirió |
| Folio ambiguo `PRB004` | Detectó 5 coincidencias y transfirió correctamente |
| Folio único temporal | Identificó a Adler, hidrató el teléfono nuevo y listó CaaS/Reevolution/Blip/Tiendanube |
| Adler: duración | “La reunión dura 20 minutos. La invitación aparta 30: incluye 10 para el cambio de mesa.” |
| Adler: CaaS, sin agendar | miércoles 10:30, miércoles 14:00, jueves 09:00 (cronológico desde MCP) |
| Reserva real | CaaS 7-oct 10:30, Mesa 1, cita `3e362dda-199a-8110-951b-df8ba84ca8c5` |
| Reagenda real | 7-oct 14:00, Mesa 1; WhatsApp resumió fecha, hora, mesa y Club France |
| Limpieza | Cita cancelada, 0 activas; folios/WhatsApp/giro restaurados; 4 contactos sintéticos eliminados |
| `node tests/horarios-oferta.manual-test.js` | OK |
| `node tests/mcp-modificar-cancelar.manual-test.js` | OK; expectativa de hora solicitada actualizada al orden cronológico |

Sin pendientes de esta prueba. La mesa no cambió (Mesa 1 en ambos bloques), pero el agente la reportó explícitamente después de reservar y de modificar.
