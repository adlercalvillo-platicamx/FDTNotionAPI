# Bitácora — oro molido más preciso (26-ago-2026)

Pendiente de Adler: el match de empresa en texto libre del sponsor era
frágil con `includes()` tras `normalizar()`. Caso real en `Contactos (nueva)`:
Reversso escribió `"Priceshoes"`; el candidato `"Price Shoes"` no sumaba
oro molido.

## Qué cambió

Solo `empresaMencionadaEn` (también se usa para excluir clientes actuales).
`normalizar()`, `getEtapasValidas` y `coincidenciaTextoLibre` no se tocaron.

La función nueva:
- une letras del candidato con separadores opcionales (espacio/guion/punto);
- exige límite de palabra para no matchear `"Andrea"` dentro de `"AndreaMoto"`;
- trata `&` como `y` (C&A / "C y A").

Limitación conocida, sin lista de recortes: si el candidato trae sufijo
legal (`SA DE CV`) y el sponsor escribió solo el nombre comercial, no hay
match. Hoy es 1 caso en pruebas.

## Verificación

- `node tests/matchmaking-2026.manual-test.js`
- `node tests/matchmaking.manual-test.js` (regresión Carlos/Laura)

No se tocó el workspace de producción de Laura.
