# Bitácora 29sep — reconciliación del follow-up con la plantilla vigente
Handoff. Código gana si esto contradice algo.
29 de septiembre de 2026. Continúa [bitacora-09sep-followup-5oct.md](bitacora-09sep-followup-5oct.md).

## Pedido y decisión

Adler: el reintento de un follow-up a medias debe reconocer el cuerpo aprobado de
`followup_72hrs`, no el texto viejo. No se mandó ningún mensaje.

## Qué cambió

`followupSalientePosterior` buscaba `quiero darle seguimiento personalmente a tus citas 1 a 1`.
Esa frase era de un borrador anterior. La plantilla aprobada dice
`quisiera dar seguimiento a tus reuniones con expertos`.

Si Notion queda en `En curso` y WhatsApp ya salió, el siguiente tick no veía el mensaje
y podía mandar la plantilla otra vez. Ahora la búsqueda usa la subcadena de la plantilla
vigente. Un `Enviado` sigue sin reenviarse; esto solo cubre el corte a medias.

## Operación

No cambia env, cron ni plantilla. Coolify del follow-up sigue cerrado
(`FOLLOWUP_72H_MODO_SIMULACION=true`, `FOLLOWUP_72H_ENVIO_REAL_HABILITADO=false`,
`FOLLOWUP_72H_DESDE=2026-10-05T09:30`). El envío de hoy a los del 24 y 25 no sale por ese cron.

## Evidencia

`node tests/followup-72h.manual-test.js`: un `En curso` con el texto nuevo se reconcilia
y no vuelve a llamar a Plática.

## Pendientes

- Envío real de los 36 del 24 y 25, cuando Adler lo pida. Simulación Plática del 29-sep: nadie había contestado.
- Mañana: simular y, si sigue igual, mandar a los del 28 que no contestaron.
- Después de ese lote: follow-up automático al siguiente día hábil. Los del 29 no entran mañana.
