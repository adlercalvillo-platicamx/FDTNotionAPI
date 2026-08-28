# Bitácora 28-ago — alternancia de disponibilidad conversacional

## Alcance verificado

`consultar_disponibilidad_cita` y la oferta inicial ya llamaban
`citasService.seleccionarHorariosParaOferta`; no había dos algoritmos de
alternancia. La función compartida ya alternaba sobre el conjunto de ambos
días.

## Cambio

- La selección compartida documenta y prueba explícitamente el cruce de días:
  primero el bloque más próximo, luego alterna Mañana/Tarde mientras exista
  una alternativa.
- Los bloques que ya superaron `CITAS_MARGEN_MODIFICACION_MINUTOS` se excluyen
  tanto de las opciones como de `total_libres` / `hay_mas`.
- Una consulta con `fecha` sigue limitada al día pedido.
- `booking.service.js` usa la misma constante exportada por `citas.service.js`;
  no hay dos valores independientes para el margen.

## Plantilla inicial pendiente

Adler está diseñando la plantilla y aún no está confirmado si tendrá horarios.
No se cambió su payload provisional. La selección queda disponible si la
plantilla aprobada los incluye; `payloadPara` debe ajustarse al contrato final
de Meta antes de habilitar envío real.

## Verificación local

- `node tests/horarios-oferta.manual-test.js`
- `node tests/mcp-modificar-cancelar.manual-test.js`
- `node tests/modificar-cancelar-cita.manual-test.js`
- `node tests/campanas-matchmaking.manual-test.js`
