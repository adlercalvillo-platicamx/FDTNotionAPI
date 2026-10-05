# Bitácora 05oct — last call hoy, sin Amazon
Handoff. Código gana si esto contradice algo.
5 de octubre de 2026. Continúa [bitacora-09sep-lastcall.md](bitacora-09sep-lastcall.md).

## Pedido y decisión

Adler: la plantilla y la audiencia del last call están bien, incluidos los del viernes 2 cuyo primer recontacto sería este mensaje. Hay que poder mandarlo hoy, sin dispararlo todavía. Amazon (Luiz Damasceno, Estefania Ustarroz Wood, Javier Aleman Arguelles) no entra en este envío.

## Qué cambió

- `LASTCALL_DESDE` default pasó de `2026-10-06T09:30` a `2026-10-05T09:30`. Si Coolify tiene la variable en el 6, esa gana y hoy no abre.
- El last call omite empresa o nombre que contenga `amazon`. No llama a WhatsApp ni escribe `Estado Lastcall`. El conteo sale como `omitidosAmazon`.
- `node tests/lastcall.manual-test.js` pasó.

## Cómo operarlo

No se mandó nada. Las banderas de envío real no se tocan hasta que Adler lo pida, y solo después de desplegar este código.

En Coolify, cuando se vaya a mandar:

```
LASTCALL_DESDE=2026-10-05T09:30
LASTCALL_MODO_SIMULACION=false
LASTCALL_ENVIO_REAL_HABILITADO=true
```

`MODO_SIMULACION` solo se apaga con el string exacto `false`. El body del endpoint no adelanta la fecha ni fuerza el envío. Después del envío, devolver las dos banderas a `true` y `false`.

Si el cron de cada 15 minutos sigue activo y se prenden las tres cosas, el siguiente tick manda. Hoy ya es horario laboral.

## Pendientes

- Desplegar este código antes de mover Coolify. Si la fecha se adelanta en el servidor viejo, Amazon entra.
- No disparar hasta que Adler lo pida. Audiencia revisada: 124 con oferta inicial y sin cita activa, menos los 3 de Amazon.
