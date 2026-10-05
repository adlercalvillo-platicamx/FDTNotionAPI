# Bitácora 05oct — last call de Quiere citas no, disparo aparte
Handoff. Código gana si esto contradice algo.
5 de octubre de 2026. Continúa bitacora-05oct-lastcall-envio.md.

## Pedido

Mandar `lastcall_cita1a1` a los 71 de `Quiere citas no` (los 77 del 1-oct menos 6 puestos). Decisión de Adler: entran también los 4 que ya tienen cita. No se ha enviado.

## Qué cambió

El cron de cada 15 min (`POST /matchmaking/enviar-lastcall`) sigue leyendo solo `Oferta inicial` y se salta citas activas. Meter ahí a este grupo lo dispararía solo en el siguiente tick, y bajaría el envío a 67.

Disparo nuevo, manual, `POST /matchmaking/enviar-lastcall-quiere-citas-no` (`X-API-Key`). Misma plantilla, mismas banderas (`LASTCALL_MODO_SIMULACION` / `LASTCALL_ENVIO_REAL_HABILITADO`) y la misma ventana del 5-oct 09:30, lun–vie 09:00–18:00. Escribe `Estado Lastcall` / `Fecha Lastcall` y sube `Reactivaciones Enviadas`. No toca `Última Campaña Enviada` (sigue `Quiere citas no`).

Omite, sin escribir estado: Amazon; puesto con becari, pasante, intern (palabra), estudiante, content creator, o diseñador/diseador gráfico jr. `E-Business Jr Manager` se queda. No se salta a quien ya tiene cita.

## Cómo operarlo

1. Commit, push y redeploy de este código. Hasta entonces la ruta no existe en Coolify.
2. Confirmar que el cron de oferta inicial ya no está en envío real, o dejarlo: con todos en `Enviado` solo recorre y no reenvía. Este POST usa las mismas dos banderas: para que salga de verdad tienen que estar `LASTCALL_MODO_SIMULACION=false` y `LASTCALL_ENVIO_REAL_HABILITADO=true`.
3. Una sola tarea manual (no cron) a `POST /matchmaking/enviar-lastcall-quiere-citas-no`. Unos 71 envíos pueden pasar los 5 min de espera de Coolify; si el job marca timeout, el proceso sigue. Un segundo Run now se salta a quien ya quedó `Enviado`.
4. Al terminar, devolver las dos banderas a simulación y real apagado.

No reejecutar el cron de oferta inicial para este grupo.

## Evidencia

`node tests/lastcall.manual-test.js` pasa: los 6 tipos de puesto salen, Jr Manager se queda, y una Confirmada de Quiere citas no sí entra en simulación.

## Pendientes

- Adler: commit/push si quiere, redeploy, y él dispara el POST. No enviado.
- Los 6 que no entran: Pamela Espinoza (becaria), Roderick Antezana (pasante), Fabiola Villanueva (intern), Adrian Luna Brenist (estudiante), Fernanda Ganem (diseñador gráfico jr), Ximena Velasco (content creator).
- Los 4 con cita que sí entran: Lorena Reza, Blondina Field, Arlette Valentin, Jose Francisco Sandoval.
