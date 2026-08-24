# Bitácora 23-ago — Estado intermedio de envío

Handoff corto. Código gana si esto contradice algo. Fecha: 23-ago-2026. **Sin commit.** Sigue de `bitacora-23ago-pool-variantes-reactivacion.md`. Cierra el pendiente del fallo parcial: WhatsApp OK + Notion KO.

## Por qué

El orden viejo era `enviarPlantilla` → escribir Notion. Si Plática respondía OK y Notion fallaba, la fila seguía “pendiente” y el siguiente disparo **duplicaba** el WhatsApp. Ahora se deja rastro **antes** de mandar.

## Orden (envío real)

1. `actualizarEstadoEnvioCampana(..., En curso, Fecha Inicio Envío=ahora)` en **todas** las filas del grupo. Si esto falla, **no** se llama a Plática.
2. `enviarPlantilla`.
3. Éxito → `actualizarEstadoCampana` + `incrementarReactivaciones` si aplica + `marcarCampanaEnviada` (checkbox `Campaña Enviada=true` **y** `Estado Envío Campaña=Enviada`).
4. Fallo de plantilla → `Estado Envío Campaña=Falló` (no dejar `En curso` colgado).
5. Fallo de Notion **después** de WhatsApp OK → las filas quedan `En curso` (no Pendiente). A los 10 min el disparador las vuelve a tomar (riesgo residual de duplicado si WhatsApp sí salió; es el tradeoff del diseño).

## Candidatas

Sigue el query `Estatus=Aprobado` + `Campaña Enviada=false`, y en JS:

| `Estado Envío Campaña` | Acción |
|---|---|
| vacío / `Pendiente` / `Falló` | candidata |
| `Enviada` | fuera |
| `En curso` y `Fecha Inicio Envío` &lt; 10 min | **fuera** (posible envío vivo) |
| `En curso` y ≥ 10 min (o sin fecha) | candidata (reintento) |

Helper: `src/utils/estado-envio-campana.js` → `esCandidataEnvioCampana`. Constante `MINUTOS_TIMEOUT_ENVIO_EN_CURSO = 10`.

## Modos

- Simulación: **cero** escrituras Notion (tampoco En curso).
- `soloMarcar`: directo a `Enviada` + checkbox, **sin** En curso.

## Notion (solo pruebas Adler)

Citas (nueva) `df93bc94-26ee-42fc-92d7-a0ed3a8e1f68`:

- Select `Estado Envío Campaña`: Pendiente, En curso, Enviada, Falló
- Date `Fecha Inicio Envío`
- Checkbox `Campaña Enviada` se mantiene

**No** se tocó el workspace de Laura.

## Tests

`node tests/campanas-matchmaking.manual-test.js` — 5 min fuera; 15 min reintenta; WhatsApp OK + Notion KO deja En curso; plantilla KO deja Falló; soloMarcar no pasa por En curso.

## Qué no hacer

No meter Redis/jobs. No bajar el timeout de 10 min sin que Adler lo pida. No aplicar el schema en producción Laura sin pedido explícito.
