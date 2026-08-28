# Bitácora 28-ago — casillas Día 1 Mañana / Día 1 Tarde / Día 2

Reemplaza la alternancia “cruza de día solo si hace falta”. En vivo daba
`10:30, 14:00, 11:00` del miércoles y **nunca el jueves** si el primer día
tenía variedad.

## Criterio

Sin `fecha`: casilla 1 = Día 1 Mañana, casilla 2 = Día 1 Tarde, casilla 3 =
Día 2. Vacía → el más próximo que quede, sin repetir. Menos de 3 bloques
reales → se devuelven los que hay.

Día 1 / Día 2 son relativos a lo que aún es ofrecible. Si solo queda un día
(el otro ya pasó, o el usuario mandó `fecha`), colapsa a Mañana / Tarde /
relleno.

Sigue filtrando pasados con `CITAS_MARGEN_MODIFICACION_MINUTOS`. MCP y oferta
inicial siguen llamando `seleccionarHorariosParaOferta`.

## Tests

`node tests/horarios-oferta.manual-test.js`
`node tests/mcp-modificar-cancelar.manual-test.js`
