# Bitácora 07sep — canceladas fuera de vistas y reutilización de mesas
Handoff. Código gana si esto contradice algo.
7 de septiembre de 2026. Sin commit todavía. Continúa [bitacora-03sep-timeline-mesa-laura.md] y [bitacora-27ago-mcp-modificar-cancelar.md].

## Pedido y decisión

Adler pidió que las citas canceladas dejen de aparecer en las vistas
operativas por mesa y que una mesa liberada pueda asignarse otra vez sin
crear dos citas activas con el mismo número.

Se decidió conservar `Fecha y Hora` y `Mesa / Ubicacion` en la fila
`Cancelada`: sirven como historial y para reenviar el `.ics` de baja. La
liberación depende del estatus, no de borrar esos datos.

## Qué cambió y por qué

- `citas.service.js` ahora puede devolver en una sola consulta tanto la
  cantidad de citas que ocupan el bloque como los números de mesa usados.
  Solo cuentan `Confirmada` y `Confirmada sin notificar`; los bloqueos de
  conferencia y las canceladas siguen fuera.
- `booking.service.js`, tanto al reservar como al modificar, asigna el menor
  número libre entre Mesa 1 y Mesa 11. Antes usaba `cantidad + 1`, que podía
  duplicar Mesa 3 si se cancelaba Mesa 2 mientras Mesa 3 seguía activa.
- Se ampliaron las pruebas manuales para cubrir reserva y reprogramación
  hacia un bloque con Mesa 2 cancelada.
- `README.md` y `AGENTS.md` documentan la nueva regla operativa.

El mutex global no cambió. La lectura de ocupación, la selección de mesa y
la escritura siguen dentro de la misma sección crítica y requieren una sola
réplica de Coolify.

## Notion de Laura

Se ejecutó
`scripts/one-shots/excluir-canceladas-vistas-mesa-laura-07sep.js --confirmar`
contra Citas de producción (`3b162dda-199a-8053-8098-000b00916893`).

- `Timeline por Mesa` (`3cf62dda-199a-8108-b3ce-000c6637c80c`): se agregó
  `Estatus does_not_equal Cancelada`; 221 → 220 filas consultables.
- `Por Horario (Mesas en ese bloque)`
  (`3cf62dda-199a-8197-9128-000c57eea588`): conservó la exclusión del
  contacto de bloqueos y agregó la de `Cancelada`; 211 → 210.
- La vista `Canceladas` y las vistas generales/históricas no se tocaron.
  Las demás vistas de ocupación ya filtraban por estados confirmados.

La cancelada existente
`3d162dda-199a-8124-a828-fd1d957ede2b` conserva Mesa 3 y el horario
7-oct 10:30. La lectura de ocupación del backend para ese bloque devuelve
2 citas y mesas `[1, 2]`, por lo que Mesa 3 está libre aunque siga en el
registro histórico.

## Evidencia

- Producción: 20 citas `Confirmada` / `Confirmada sin notificar`; cero
  duplicados de `inicio + mesa`.
- Verificación posterior de vistas: ambas reportan
  `[ya excluía Cancelada]` y no cambian el conteo al volver a correr dry-run.
- `node tests/asignacion-mesa.manual-test.js`: todos pasan; cancelar Mesa 2
  con Mesas 1 y 3 activas hace que la reserva nueva reciba Mesa 2.
- `node tests/modificar-cancelar-cita.manual-test.js`: todos pasan; mover a
  un bloque con Mesa 2 cancelada reutiliza Mesa 2.
- `node tests/email-notificacion.manual-test.js`: todos pasan.

No se enviaron correos, WhatsApp ni campañas. No se creó ni modificó una
cita real durante la verificación.

## Operación y pendiente

- No reejecutar el one-shot con `--confirmar` salvo que haya que reparar
  nuevamente esos filtros; es idempotente y su modo normal es dry-run.
- El filtro de vistas ya está vivo en Laura.
- La reutilización de huecos queda activa cuando este código se despliegue
  en la única réplica de Coolify. Hasta ese redeploy, el backend desplegado
  conserva la regla anterior `cantidad + 1`.
