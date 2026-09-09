# Bitácora 09sep — last call el 6-oct a las 09:30, cron propio
Handoff. Código gana si esto contradice algo.
9 de septiembre de 2026. Continúa [bitacora-09sep-followup-5oct.md](bitacora-09sep-followup-5oct.md).

## Pedido y decisión

Adler: el last call es para quien **ya recibió oferta inicial y no tiene cita activa**.
Haber respondido no excluye. `Cancelada` no cuenta como activa. Plantilla
`lastcall_cita1a1` el **6 de octubre de 2026 a las 09:30** hora México. Cron **nuevo**,
no reutilizar el del follow-up. Crear `Estado Lastcall` y `Fecha Lastcall` en Contactos
de Laura.

## Qué cambió

`POST /matchmaking/enviar-lastcall` (`X-API-Key`) recorre asistentes con `Oferta inicial`,
omite `Pendiente Calendar` / `Confirmada` / `Confirmada sin notificar` / `Completada`,
y manda `lastcall_cita1a1` con `{{1}}` = primer nombre. No filtra por
`Respondió Oferta Inicial`. Hasta las 09:30 del 6-oct responde `VENTANA_NO_CUMPLIDA`;
después lun–vie 09:00–18:00. Claim `En curso` (10 min) + reconciliación contra el
outgoing de Plática, mismo patrón que el follow-up. `Reactivaciones Enviadas` sube al
éxito.

Schema en Contactos de Laura: select `Estado Lastcall` (`En curso` / `Enviado` / `Falló`)
y date `Fecha Lastcall`, visibles en `Raw — todos los campos`.

## Operación

En Coolify, **sin duplicados** y **cron nuevo** (clonar el de follow-up, no editarlo):

```env
PLATICA_TEMPLATE_LASTCALL=lastcall_cita1a1
LASTCALL_DESDE=2026-10-06T09:30
LASTCALL_MODO_SIMULACION=true
LASTCALL_ENVIO_REAL_HABILITADO=false
```

Cron (clonar el de `enviar-followups-72h`):

- Name: `Last call citas 1a1`
- Command:
  ```
  curl -X POST http://localhost:3001/matchmaking/enviar-lastcall -H "X-API-Key: <mismo secret>" -H "Content-Type: application/json"
  ```
- Frequency: `*/15 * * * *`
- Timeout: 300 s (mismo que follow-up si ya está más alto)

El body no trae override. Hasta el 6-oct 09:30 el cron responde `VENTANA_NO_CUMPLIDA` y no
toca Notion. No abrir envío real sin una simulación que **nombre** a quién le llegaría
(`detalle`). Redeploy **antes** de que el cron corra contra código viejo (404).

No reejecutar `scripts/one-shots/lastcall-schema-laura-09sep.js --confirmar` si los
campos ya existen (el script es idempotente: “ya existe”).

## Evidencia

- `node tests/lastcall.manual-test.js`: ventana 09:29/09:30, Confirmada omite, Cancelada entra, respondió no excluye, estados y reconciliación.
- `node tests/followup-72h.manual-test.js`: sin regresión.
- Schema `--confirmar` en Contactos de Laura (`3b162dda-199a-8029-8d58-000b6d1fed37`): creados `Estado Lastcall` y `Fecha Lastcall`; visibles en `Raw — todos los campos` (`3d162dda-199a-818b-b1df-000cb04490b2`, 89 columnas).

## Pendientes

- Cargar las cuatro envs `LASTCALL_*` / `PLATICA_TEMPLATE_LASTCALL` en Coolify y
  **cron HTTP nuevo** cada 15 min al endpoint.
- Redeploy.
- Simulación nominal cerca del 6-oct (el HTTP no acepta `ahora`).
- Envío real: las dos banderas (`MODO_SIMULACION=false` exacto + `ENVIO_REAL_HABILITADO=true`).
