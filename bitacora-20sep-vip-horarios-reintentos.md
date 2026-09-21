# Bitácora 20sep — VIP/Speaker, horarios vigentes y correo granular
Handoff. Código gana si esto contradice algo.
Fecha: 20 sep 2026. Sin commit. Continúa [bitacora-20sep-plan-piso-agente2.md](bitacora-20sep-plan-piso-agente2.md).

## Pedido y decisión

Adler aprobó el plan y confirmó tres reglas: Presencial VIP y Speaker saltan tamaño también en las opciones del Agente 2; durante el evento nunca se ofrecen horarios vencidos, con QR o mensaje directo; y el reintento de `Confirmada sin notificar` manda solo al lado cuyo correo falló.

## Qué cambió

- `esSponsorElegibleParaMasOpciones` deja pasar Presencial VIP y Speaker sin evaluar tamaño. Giro elegible y sponsor no Bronce siguen siendo obligatorios.
- La disponibilidad compartida ya excluía bloques vencidos con `CITAS_MARGEN_MODIFICACION_MINUTOS` (default 5). Se agregó regresión explícita y el prompt vivo obliga a usar únicamente `opciones_para_ofrecer`, incluso desde QR.
- Sponsor y asistente se envían independientemente. Una falla ya no impide intentar el otro correo.
- `Notas Envio Email` agrega `[EMAIL_PENDIENTES:sponsor]`, `[EMAIL_PENDIENTES:asistente]` o ambos. Los reintentos por id y por barrido leen ese marcador y no duplican el lado exitoso. Filas viejas sin marcador conservan el comportamiento compatible de reintentar ambos.
- La misma granularidad cubre confirmación, modificación y cancelación; una cancelada sigue en `Cancelada`.
- Prompt vivo del Agente 2 actualizado a `VcdnpLA164GE5Y5p1o6f` (191 versiones): distingue el lado pendiente, sugiere spam para el asistente, nunca revela correo del sponsor y no ofrece horarios pasados.

## Evidencia

- `node tests/mas-opciones.manual-test.js` — OK.
- `node tests/disponibilidad.local-smoke.js` — OK; 12:00 queda fuera a las 12:06 y 12:30 sigue disponible.
- `node tests/email-notificacion.manual-test.js` — OK; si solo falla el asistente, el reintento hace una llamada al asistente y cero al sponsor.
- `node tests/modificar-cancelar-cita.manual-test.js` — OK.

## Operación

No hay env nueva ni migración de schema. Desplegar backend normalmente. Los pendientes antiguos de Notion que no traigan `[EMAIL_PENDIENTES:…]` reenviarán ambos correos una última vez por compatibilidad; los nuevos serán granulares.

## Pendientes del hilo

Siguen pendientes QR por sponsor, identificación por folio, fase antes/durante/después, listado completo de confirmadas y campo de boleto en vistas top de Notion. No se ejecutó ninguna reserva ni envío SMTP real.
