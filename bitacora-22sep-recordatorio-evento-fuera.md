# Bitácora 22sep — recordatorio de 14 días apagado
Handoff. Código gana si esto contradice algo.
22 de septiembre de 2026. Continúa [bitacora-27ago-cron-recordatorio.md].

## Pedido

Adler: no vamos a usar el recordatorio WhatsApp de 14 días antes del
evento. Apagarlo y asegurar que no se mande.

## Decisión

No basta con borrar el cron de Coolify ni con dejar las banderas de
campaña en simulación: ese recordatorio **compartía**
`CAMPANAS_MATCHMAKING_MODO_SIMULACION` / `ENVIO_REAL_HABILITADO` con la
oferta inicial. El día que se encienda el envío real de ofertas, el cron
diario habría podido mandar este WhatsApp desde el 23-sep.

`enviarRecordatorioEvento` ahora sale al inicio con
`motivo: 'RECORDATORIO_EVENTO_DESHABILITADO'`. No hay env para
reactivarlo. La ruta HTTP y la lógica vieja quedan en el archivo.

## Cómo operarlo

- Subir y **redeploy Coolify**. Hasta entonces el proceso viejo sigue
  pudiendo enviar si el cron pega y las banderas están en real.
- Opcional: borrar en Coolify el scheduled task a
  `POST /matchmaking/enviar-recordatorio-evento`. Con el código nuevo
  ese cron solo recibe 200 vacío.
- Oferta inicial, follow-up 5-oct y last call 6-oct no cambian.
- Recordatorios de cita (2 h y 15 min) no cambian.

## Evidencia

`node tests/recordatorio-evento.manual-test.js` — sin Notion ni Plática.

## Pendientes

- Redeploy. Confirmar en Coolify si el cron diario existe y apagarlo
  ahí también, por higiene.
