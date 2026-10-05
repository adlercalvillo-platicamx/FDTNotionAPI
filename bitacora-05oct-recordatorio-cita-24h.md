# Bitácora 05oct — recordatorio de citas a 24 h
Handoff. Código gana si esto contradice algo.
5 oct 2026. Rama `feat/recordatorio-cita-24h` (worktree, todavía sin commit). Continúa el alta de campos en Contactos del mismo día.

## Pedido

Un solo WhatsApp al asistente, 24 h antes, con todas sus citas. Decisión de Luis: cron que lee Notion, no campaña de Plática.

## Qué cambió

`POST /citas/enviar-recordatorios-24h`. Agrupa `Confirmada` y `Confirmada sin notificar` por asistente. Manda cuando la primera entra en las próximas 24 h e incluye también las de después, aunque sean del otro día. El estado queda en el contacto (`Estado Recordatorio 24h`, `Fecha Recordatorio 24h`, `Notas Recordatorio 24h`), que ya existen en Notion. No toca los recordatorios de 15 min ni de 2 h, ni crea campo en Plática.

Plantilla aprobada 5-oct: `confirmacion_cita_1_dia_antes`. El service la
lleva como default. Env vacía sigue siendo el apagado (`SIN_PLANTILLA`).

## Cómo operarlo

Coolify: `PLATICA_TEMPLATE_CITA_24H=confirmacion_cita_1_dia_antes`. Cron
cada 15 min el 6, 7 y 8 de octubre a `POST /citas/enviar-recordatorios-24h`
con `X-API-Key` y sin body. No está creado todavía.

Prueba local sin Notion: `node tests/recordatorio-cita-24h.manual-test.js`.

Preview con datos reales, sin escribir ni WhatsApp:

`POST /citas/enviar-recordatorios-24h` con `X-API-Key` y
`{ "simulacion": true, "ahora": "2026-10-06T10:30:00-06:00" }`.
El cron no manda ese body. `enviados` en simulación = a quién les tocaría.

## Variables

```
¡Hola {{1}}! ¿Cómo estás? Te escribo para recordarte y confirmar las reuniones que tienes agendadas:
{{2}}
¿Me confirmas tu asistencia?
```

| Var | Qué | De dónde |
|---|---|---|
| `{{1}}` | Primer nombre, Title Case (`Luis`, no `Luis Miguel`) | `Contactos.Nombre` |
| `{{2}}` | Todas las reuniones que todavía no empiezan, en un parámetro, separadas con `; ` | Citas `Confirmada` / `Confirmada sin notificar` del asistente + nombre/empresa del sponsor |

Ejemplo de `{{2}}`: `7 oct a las 10:30 am con Marco Trujillo, de Plática.mx; 8 oct a las 11:00 am con Rodrigo Cerda, de Tiendanube`. Día y hora salen del ISO de la cita. Encargado = nombre + apellido paterno + empresa. Sin mesa y sin Meet.

## Pendiente

- Cron en Coolify después de desplegar esta rama.
- No reejecutar nada de este archivo: no hay escritura a Notion ni WhatsApp.
