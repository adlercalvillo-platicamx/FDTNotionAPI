# Bitácora 23-ago — Reactivaciones C con tope de 2

Handoff corto para el siguiente chat. Código gana si esto contradice algo. Fecha: 23-ago-2026. **Sin commit.** Sigue de `bitacora-23ago-solomarcar-limpieza-cola.md`.

## Por qué

`elegirCampana()` devolvía `COMPORTAMIENTO_POSTERIOR_NO_DEFINIDO` si `ultimaCampanaEnviada` era B o C. Adler definió el caso C: misma ventana de 14 días que A→C, con **tope de 2 reactivaciones**. Después de A + C + C, silencio automático hasta que alguien reactive a mano en Notion. B no cambia.

## Tabla (lo que quedó en código)

| Estado | Resultado |
|---|---|
| Sin última campaña | A. Contador no se toca. |
| Tiene cita confirmada | B, **aunque el contador esté en 2**. Contador no se toca. |
| Última = A, ventana no cumplida (`fechaAnterior < limite` es false; a los 14 días exactos **no** reactiva) | Nada. `VENTANA_REACTIVACION_NO_CUMPLIDA`. |
| Última = A, ventana cumplida | C. Contador 0→1. |
| Última = C, contador ≥ 2 | Nada, siempre. `TOPE_REACTIVACIONES_ALCANZADO`. |
| Última = C, contador 0 o 1, ventana no cumplida | Nada. Mismo motivo de ventana. |
| Última = C, contador 0 o 1, ventana cumplida | C otra vez. Contador +1. |
| Última = B y **no** hay cita confirmada | Sigue `COMPORTAMIENTO_POSTERIOR_NO_DEFINIDO`. |

La comparación de fechas **no** es ≥14 días: es la misma de A→C (`fechaAnterior < ahora - 14d`).

## Notion

Campo number **`Reactivaciones Enviadas`** en Contactos de **pruebas Adler** (`Contactos (nueva)` / data source `9f335308-da0e-4672-9744-c1dabcfb22aa`). **No** se tocó el workspace de Laura.

Parseo: `reactivacionesEnviadas: numero(p['Reactivaciones Enviadas']) || 0` — `null`/`undefined` = 0.

## Código

`src/services/campanas-matchmaking.service.js`:

- `REACTIVACIONES_MAXIMAS` (env `CAMPANAS_MATCHMAKING_REACTIVACIONES_MAXIMAS`, default 2), junto a `DIAS_REACTIVACION`.
- Helper `evaluarVentanaReactivacion` compartido por A y C.
- `persistirEnvioCampana`: llama `actualizarEstadoCampana`; si la campaña es C, también `incrementarReactivaciones`. Corre en envío real y en `soloMarcar`. **No** en simulación.

`src/services/contactos.service.js`: `incrementarReactivaciones(contactoId, valorActual)` hace PATCH a `Reactivaciones Enviadas: (valorActual || 0) + 1`.

## Tests

`node tests/campanas-matchmaking.manual-test.js`

- C, contador 0, ≥ ventana → envía C, mock deja contador 1.
- Contador 1 → envía C, contador 2.
- Contador 2 + fecha ~100 días atrás → no envía, `TOPE_REACTIVACIONES_ALCANZADO`.
- Contador 2 + cita confirmada → B.
- `reactivacionesEnviadas` vacío → se trata como 0 (`soloMarcar`).
- A no incrementa. Simulación no escribe Notion.

## Archivos

| Archivo | Cambio |
|---|---|
| `src/services/campanas-matchmaking.service.js` | tope + ventana compartida + persistir C |
| `src/services/contactos.service.js` | parseo + `incrementarReactivaciones` |
| `tests/campanas-matchmaking.manual-test.js` | casos del tope |
| `.env.example`, `README.md` | `CAMPANAS_MATCHMAKING_REACTIVACIONES_MAXIMAS` |

## Qué no hacer

No aplicar el campo en producción Laura sin que Adler lo pida. No incrementar en A ni B. No convertir el tope en un bloqueo de B.
