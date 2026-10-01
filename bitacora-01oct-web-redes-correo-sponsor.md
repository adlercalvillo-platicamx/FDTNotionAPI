# Bitácora 01oct — web y redes en el correo al sponsor
Handoff. Código gana si esto contradice algo.
1 de octubre de 2026. Sin commit. Continúa
[bitacora-01oct-boleto-breakfast.md](bitacora-01oct-boleto-breakfast.md).

## Pedido y decisión

Adler pidió que el correo al sponsor, además de los datos que ya lleva,
incluya la página web y las redes que el asistente tiene en Notion.
Si el dato no está, no se imprime. Decisión de Adler en este pedido:
mismo criterio para confirmar, modificar y cancelar, porque los tres
usan el bloque de contacto.

## Qué cambió y por qué

En producción de Laura (data source `3b162dda`) la web del formulario
está en `Web / Redes` y las redes en `LinkedIn/Instagram`. Casi todo
llega en mayúsculas. `Sitio Web Empresa` está vacío en casi todas las
filas; solo se usa si `Web / Redes` no trae nada útil.

`lineasDatosContactoAsistente` en `booking.service.js` agrega:

```
Página web: https://impuls.com.mx
Instagram / LinkedIn: https://www.instagram.com/marca
```

Un handle suelto se deja en minúsculas (`@modelgenia`). Un texto con
espacios pasa a Title Case (`Laura Veciconti`). Se omiten vacíos y
respuestas que no son un dato: `NA`, `N/A`, `ND`, `-`, `no`, `no tengo`,
`no tenemos`, `no hay`, `ninguno`, `en proceso`, `aún no`, cadenas de
puras `x` y una sola letra.

Ticketópolis a veces guarda la URL sin `://` ni diagonales
(`HTTPSWWW.LINKEDIN.COMINNOMBRE`). El correo reconstruye el esquema y
la diagonal del dominio. No recupera `?` ni `=` de los parámetros que
también se perdieron al cargar. Una URL que ya trae ruta solo se pasa
a minúsculas.

El asistente no ve estas líneas. El `.ics` del sponsor sí, porque usa
el mismo cuerpo.

## Cómo operarlo

No hay bandera ni env nuevo. Sale en el próximo confirmar, modificar,
cancelar o reenvío. No reescribe correos ya enviados. No toca Notion.

## Evidencia

`node tests/email-notificacion.manual-test.js` — todos pasaron, incluidos
los casos de URL pegada, placeholder y fallback a `Sitio Web Empresa`.

## Pendientes

Ninguno de este hilo. Si el copy de la etiqueta (`Instagram / LinkedIn`
en vez de `Redes`) no les late, es un cambio de texto, no de campos.
