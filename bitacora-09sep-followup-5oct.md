# Bitácora 09sep — follow-up el 5-oct a las 09:30, no a las 72 h
Handoff. Código gana si esto contradice algo.
9 de septiembre de 2026. Continúa [bitacora-04sep-followup-72h.md](bitacora-04sep-followup-72h.md).

## Pedido y decisión

Adler: el follow-up de quien no contestó la oferta inicial ya no sale a las 72 horas,
sale el **5 de octubre de 2026 a las 09:30** hora México. Misma plantilla `followup_72hrs`,
mismo cron, mismas omisiones (respondió / ya tiene cita / ya enviado).

## Qué cambió

El cron de 15 min se queda. Hasta las 09:30 del 5-oct responde `VENTANA_NO_CUMPLIDA` y no
toca Notion ni Plática. A partir de esa hora manda a quien ya tenga `Oferta inicial`,
sin esperar 72 horas, y sigue respetando lun–vie 09:00–18:00 CDMX (el 5-oct es lunes, así
que el primer tick laboral ≥ 09:30 es el disparo pedido). Reintentos de `Falló` y gente
que reciba la oferta después de esa hora entran en los ticks siguientes.

La hora vive en `FOLLOWUP_72H_DESDE` (default `2026-10-05T09:30`, zona `-06:00` si no
trae offset). No se reaprueba la plantilla.

## Operación

En Coolify, sin duplicados:

```env
FOLLOWUP_72H_DESDE=2026-10-05T09:30
FOLLOWUP_72H_MODO_SIMULACION=true
FOLLOWUP_72H_ENVIO_REAL_HABILITADO=false
```

Redeploy. El cron actual no hay que recrearlo. No abrir envío real sin una simulación
nominal que **nombre** a quién le llegaría.

## Evidencia

`node tests/followup-72h.manual-test.js`: 09:29 no abre, 09:30 sí, fuera de horario laboral
después de la ventana no consulta Notion, omisiones y estados iguales.

## Pendientes

- ~~Cargar `FOLLOWUP_72H_DESDE` en Coolify~~ — Adler ya la cargó (9-sep) con
  `FOLLOWUP_72H_MODO_SIMULACION=true` y `FOLLOWUP_72H_ENVIO_REAL_HABILITADO=false`.
- Redeployar para tomar este commit.
- Simulación nominal cerca del 5-oct (o con `ahora` solo en tests locales; el HTTP no
  acepta override).
- Envío real sigue con las dos banderas en default seguro.
- Last call (6-oct, cron propio): ver [bitacora-09sep-lastcall.md](bitacora-09sep-lastcall.md).
