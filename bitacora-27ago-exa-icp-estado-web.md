# Bitácora 27 ago — `ICP Moda/Ecommerce` y `Estado Web (Exa)` en el score

Pendiente de Adler: más campos de Exa en ranking. Siguen fuera (texto libre / sin mejor-peor): Giro Detectado, Presencia Digital, Madurez Ecommerce, Modelo de Negocio.

## Pesos (Capa 2, independientes de madurez 40/15)

| Campo | Valor | Puntos |
|---|---|---|
| ICP Moda/Ecommerce | Sí | +30 |
| ICP Moda/Ecommerce | No | −30 |
| ICP Moda/Ecommerce | Ambiguo o vacío | 0 |
| Estado Web (Exa) | Con web | +10 |
| Estado Web (Exa) | Sin web o vacío | 0 (no resta) |

Vacío ≠ No: no se penaliza a quien aún no enriqueció Luis.

Parseo: `icpModaEcommerce` ya existía; se agregó `estadoWebExa` en `parsearContacto`.

## Tests

`node tests/matchmaking-2026.manual-test.js` §7 y parseo en `sesion-14ago-diffs.manual-test.js`.
