# Bitácora 01oct — tope de mesas de 11 a 8
Handoff. Código gana si esto contradice algo.
1 oct 2026. Sin commit. Pedido del día: revisar si se podía bajar el tope sin romper producción; Adler dijo hacerlo.

## Pedido y decisión

Bajar `CAPACIDAD_MAXIMA_MESAS` de 11 a 8. Lo pidió el equipo del evento; Adler confirmó el cambio después de ver que en Notion de Laura nadie está en mesa 9, 10 u 11.

## Qué cambió y por qué

El tope no es variable de entorno. Estaba duplicado a propósito en `booking.service.js` (reserva y modificación) y en `citas.service.js` (disponibilidad). Los dos quedaron en 8. Si solo se mueve uno, el agente ofrece un horario que la reserva rechaza, o al revés.

La novena cita real de un mismo bloque de 30 min recibe `CAPACIDAD_MESAS_LLENA`. La asignación sigue siendo la primera mesa libre entre 1 y 8. Una cancelada sigue sin ocupar mesa. Un bloqueo de conferencia sigue ocupando al sponsor y sigue sin restar mesa.

No se reescribieron filas de Notion, ni correos, ni prompts, ni plantillas. Las 19 citas confirmadas se quedan en su mesa (la más alta en uso es la 4).

## Cómo operarlo

El proceso que ya corre en Coolify sigue en 11 hasta el redeploy de este servicio. Una variable de entorno no lo cambia. No hace falta redeploy del frontend ni de Plática.

No reejecutar `scripts/one-shots/prueba-limite-11-mesas.js`.

## Evidencia

Lectura de producción de Laura (1 oct, solo query, data source con prefijo `3b162dda`):

| | |
|---|---|
| Citas reales `Confirmada` | 19 |
| Pico en un horario | 4, el 2026-10-07 a las 14:00, mesas 1–4 |
| Mesa más alta | 4 |
| Mesa 9, 10 u 11 | ninguna, tampoco en la cancelada |
| `Confirmada sin notificar` | 13, todas bloqueos de conferencia |
| Sponsors activos | 16 (3 Cristal, 9 Diamante, 4 Oro) |

Tests locales (mocks, sin Notion): `asignacion-mesa.manual-test.js`, `bloqueo-conferencias.manual-test.js`, `modificar-cancelar-cita.manual-test.js`, `horarios-oferta.manual-test.js`.

## Pendientes

Redeploy en Coolify de fdt-notion-api para que producción deje de asignar hasta la mesa 11. Hasta ese deploy, una reserva nueva todavía puede recibir mesa 5 en adelante.
