# Bitácora 04sep — ICS Club France y mesa en el cuerpo
Handoff. Código gana si esto contradice algo.
Fecha del trabajo: 4-sep-2026. Continúa el hilo de notificaciones por correo (no el de follow-up 72h).

## Pedido y decisión

Adler: Google Maps no geocodifica `LOCATION=Mesa N`. El `.ics` debe llevar la sede real; la mesa va en la descripción del evento (igual al cuerpo del correo). Copy de los seis correos (confirmar / modificar / cancelar × sponsor / asistente) ya aprobado en chat.

Sede: `Club France, Francia 75-Interior, Florida, Álvaro Obregón, 01030 Ciudad de México, CDMX`. Pin `19.3575567,-99.1808438`.

## Qué cambió y por qué

- `email.service.js` siempre escribe `LOCATION` Club France, más `GEO` y URL de Maps. Ya no acepta la mesa como ubicación del evento.
- Confirmación y modificación: horario legible + “Tu cita será en la mesa N…” + recuerde Club France. El asistente sigue sin datos de contacto del sponsor.
- Cancelación: solo horario cancelado en el cuerpo (sin mesa ni sede). El `.ics` de baja conserva Club France porque es el mismo UID.
- Notas de calendario nuevas: abrir el `.ics` para actualizar (modificar) o quitar (cancelar). Se retiró “Si tu calendario no se actualiza solo…” y la línea de “Agregar al calendario” en el correo de cambio.

## Cómo operarlo

Tras redeploy, las reservas/cambios **nuevos** salen con este copy. Un reenvío (`Confirmada sin notificar` / cancelación pendiente) regenera el `.ics` con Club France. No hay env, cron ni one-shot. No reejecutar pruebas SMTP reales contra correos externos.

## Evidencia

`node tests/email-notificacion.manual-test.js` y `node tests/modificar-cancelar-cita.manual-test.js`: todos pasaron.

## Pendientes

Ninguno de este hilo. El follow-up 72h sigue en simulación hasta que Sam/Adler habiliten envío real.
