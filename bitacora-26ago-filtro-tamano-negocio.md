# Bitácora 26-ago — Filtro de tamaño de negocio en matchmaking

Handoff. Código gana si contradice esto. Fecha: 26-ago-2026. **Sin commit.** Prompt: `prompt-cursor-filtro-tamano-negocio.md`. Laura (25-ago): priorizar empresas grandes; Micro/Pequeña **fuera del universo**, no un peso bajo.

## Schema (solo pruebas Adler)

`Contactos (nueva)` `9f335308-da0e-4672-9744-c1dabcfb22aa`: **CREATE** select `Tamaño de Negocio` (no existía; no hubo colisión).

Opciones (texto exacto):

- `Grande - más de 250 empleados`
- `Mediana - 50 a 250 empleados`
- `Pequeña - 10 a 50 empleados`
- `Micro - menos de 10 empleados`

**No** se tocó el workspace de producción de Laura.

## Filtro (Capa 1, antes de `calcularScore`)

`esCandidatoPorTamanoNegocio` en `matchmaking.service.js`. Se aplica al armar `candidatosBrutos` (`.filter` justo después de `buscarAsistentesCandidatos`). Allowlist, no `!== 'Micro'`.

| `Tamaño de Negocio` | Resultado |
|---|---|
| Grande / Mediana | entra |
| Micro / Pequeña | **excluido** (aunque Exa diga Consolidado) |
| vacío + Exa Consolidado o PyME | entra (asistentes viejos) |
| vacío + Temprano | excluido |
| vacío + vacío | **excluido** (confirmado Adler: sin beneficio de la duda hasta que Exa llene madurez) |

Micro/Pequeña no generan `detalle`/`senales`. `totalCandidatosEvaluados` ya no los cuenta.

## Pesos (Capa 2, solo quien pasó)

`TAMANO_GRANDE: 40`, `TAMANO_MEDIANA: 15` (igual que madurez Consolidado/PyME).

**Si ambos campos están poblados:** gana el select del formulario; **no** se suman 40+40. Test explícito.

Fallback Exa sigue usando `MADUREZ_NEGOCIO_*` solo cuando `Tamaño` está vacío.

Parseo: `tamanoNegocio: select(p['Tamaño de Negocio'])` en `parsearContacto`.

## Tests

- `node tests/sesion-14ago-diffs.manual-test.js` — bloque nuevo de tamaño; todo OK.
- `node tests/tamano-negocio.manual-test.js` — pool de `sugerirMatchesParaSponsor` con 8 mock; solo Grande/Mediana/Exa-Consolidado/Exa-PyME salen.

## Baseline mock (`matchmaking.manual-test.js`)

Ana no tenía tamaño ni Exa → con la regla nueva **habría quedado fuera** y Laura pasaría a 0 sugerencias. En el mock se le puso `madurezNegocioExa: 'Consolidado'` (camino de registro viejo). Score Laura→Ana: **1320** (antes ~1280 en la corrida 23-ago; +40 de madurez). `contacto-vacio-historico` sigue vacío+vacío y **ya no entra**. Carlos sigue en 0 candidatos (etapa).

`.cursor/rules/testing.mdc` aún dice Laura 1 candidato score 1095 — ese número ya estaba desfasado (Presencial +150, etc.). Ahora además +40 Exa en el mock de Ana.

## Hallazgos (no minimizados)

1. Un Micro **con** Exa Consolidado queda fuera: el tamaño declarado manda. Es intencional (allowlist).
2. Asistentes reales en Notion de pruebas, casi todos sin el select nuevo y muchos sin Exa, **van a desaparecer** de `sugerir-todos` hasta que Luis/el cron llene `Madurez Negocio (Exa)` o Ticketópolis llene `Tamaño de Negocio`. No se corrió `sugerir-todos` en esta sesión.
3. Producción Laura: campo **no** creado. El código lee el select; si el DS de prod no lo tiene, `tamanoNegocio` llega `null` y aplica el fallback Exa (vacío+vacío = fuera).

## Qué no se hizo

Commit/push. Schema en Laura. Poblar filas. Cambiar pesos 40/15.
