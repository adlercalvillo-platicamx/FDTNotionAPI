# Bitácora tests GET /citas/disponibilidad — 14 ago 2026

**Base:** `https://f8wwwgc0g88wccscww4cccco.appsplatica.site`  
**Sponsor de prueba (referencia):** Magali Parra (CaaS) `3b790fe2-7345-8164-bc7e-ec3c81a07486`  
**Script:** `node scripts/one-shots/correr-tests-disponibilidad.js`  
**Última corrida Coolify:** guardada en `tests/_disponibilidad-coolify-last.json`

## Fix Coolify (cerrado)

Coolify **no inyecta** Names de env con guiones (`CITAS_HORA_INICIO_2026-10-07`). El código usa `fechaEnvKey()` → `2026_10_07`. En Coolify quedaron:

| Name | Value |
|---|---|
| `CITAS_HORA_INICIO_2026_10_07` | `10:30` |
| `CITAS_HORA_FIN_2026_10_07` | `19:00` |
| `CITAS_HORA_INICIO_2026_10_08` | `09:00` |
| `CITAS_HORA_FIN_2026_10_08` | `18:00` |

(+ `CITAS_FECHAS_EVENTO`, `CITAS_DURACION_BLOQUE_MINUTOS`, `CITAS_ZONA_HORARIA_OFFSET` sin cambio de Name.)

## Resultados — núcleo (cerrado post-redeploy)

| Caso | Resultado | Evidencia |
|---|---|---|
| 5 falta param | **PASS** | `400` — `sponsor_notion_id` requerido |
| 4 fecha fuera | **PASS** | `400` — fechas válidas `2026-10-07, 2026-10-08` |
| 4b fail-fast sin horario | **PASS** (antes del fix de underscores) | `503` listando vars faltantes |
| 4c miércoles | **PASS** | 17 bloques, `10:30 → 18:30` |
| 4c jueves | **PASS** | 18 bloques, `09:00 → 17:30` |
| 1 feliz | **PASS** | `200`, Magali (tras Caso 2/7: 16 libres / 1 ocupado en 18:30) |
| 6 id inexistente | **DOCUMENTADO** | Notion valida UUID real → `400` (no “0 resultados = libre”). Propagación actual: error de Notion al API. Validación previa de UUID en backend = **opcional**, no bloquea form Carlos. |
| 6 fix UUID limpio | **IMPLEMENTADO (16-ago)** | Controller rechaza malformados con `400` `"sponsor_notion_id debe ser un UUID válido"` antes de Notion. Smoke local Caso 6 PASS. |

Smoke local (`tests/disponibilidad.local-smoke.js`): 4 / 4b / 4c **PASS** sin Notion.

## Setup Confirmada (Casos 2 + 7) — 14 ago

Hallazgo previo: en `Citas (nueva)` (`df93bc94-…`) la única Confirmada viva era **Infracommerce × ATLEKX** a `2026-10-07T10:00:00-06:00` — **fuera** de la grilla del evento (mié empieza 10:30). Confirmadas viejas de demos (CristalPay/Flow) están soft-deleted y **no** cuentan para `sponsorOcupadoEnBloque`.

Setup mínimo vía `POST /citas/reservar` (Coolify), sin inventar calendar IDs:

| Campo | Valor |
|---|---|
| Sponsor | Magali Parra (CaaS) `3b790fe2-7345-8164-bc7e-ec3c81a07486` |
| Calendario | `c_b506e2cfcbdebd863a846bf75729b3279f4f0f0696e62f908799a489f34cfce0@group.calendar.google.com` (leído de Notion) |
| Asistente | JAZMIN CUENCA (ATLEKX) `3b790fe2-7345-8131-b2c4-dfeabde862e8` |
| Slot | `2026-10-07T18:30:00-06:00` → `19:00` |
| `request_id` | `58ded028-ed01-4041-b2ed-2da7c1b59595` |
| Resultado reserva | **201** `Confirmada` — `notion_page_id` `3bc90fe2-7345-8153-98c4-e12ea4f83ceb`, `evento_id` `0igvil9avdn06h73rimbd4m490` |

## Resultados — cobertura extra

| Caso | Resultado | Evidencia |
|---|---|---|
| 2 sponsor ocupado | **PASS** | Magali mié: 16 libres / 1 ocupado. Bloque `2026-10-07T18:30:00-06:00` → `disponible:false`, `motivo: SPONSOR_YA_OCUPADO`. Script: `argv[3]=Magali`. |
| 7 consistencia vs `reservar_cita` | **PASS** | Misma reserva del setup: tras Confirmada + Calendar, `GET /citas/disponibilidad` refleja el slot ocupado con el mismo motivo que devolvería el conflicto en `POST /citas/reservar`. |
| 3 mesas llenas | **NO CORRIDO** | Opcional; setup ~11 Confirmadas. 2+7 ya cubren happy path de ocupación. |
| 6 fix UUID limpio | **IMPLEMENTADO (16-ago)** | `esUuidCanonico` en `citas.controller.js` → 400 limpio. Test en `disponibilidad.local-smoke.js`. |
| Laura 18:30–19:00 miércoles | **PENDIENTE producto** | El endpoint ya respeta env; ese slot ahora tiene Confirmada de prueba Magali×ATLEKX. |

### Caso 6 (validación UUID) — implementado 16-ago

Antes de llamar a Notion en `disponibilidad`, se rechaza `sponsor_notion_id` que no sea UUID canónico con guiones (`8-4-4-4-12`) con `400` y mensaje `"sponsor_notion_id debe ser un UUID válido"`. Un UUID bien formado pero inexistente sigue llegando a Notion (comportamiento previo).

## Nota script

`correr-tests-disponibilidad.js` ahora marca Caso 2 `ok` solo si hay ≥1 bloque con `motivo === 'SPONSOR_YA_OCUPADO'` (antes no setaba `ok` y el resumen imprimía FAIL falso).

## Cleanup Confirmada de prueba — 14 ago

| Paso | Resultado |
|---|---|
| Notion `Estatus` → `Cancelada` | **OK** — page `3bc90fe2-7345-8153-98c4-e12ea4f83ceb` |
| `GET disponibilidad` Magali mié | **OK** — 17 libres / 0 ocupados; `18:30` otra vez `disponible:true` |
| Cancelar evento Calendar `0igvil9avdn06h73rimbd4m490` | **PENDIENTE** — `POST …/calendar/cancelar-evento` respondió `404 Endpoint no encontrado` vía `calendar-client`. Reintento/probe de paths alternos no corrido (skip). Evento puede seguir en el calendario de Magali. |

## Siguiente paso

- ~~Caso 3 / fix UUID~~ — UUID limpio **hecho** (16-ago). Caso 3 mesas llenas: solo si se pide.
- Borrar a mano el evento huérfano en Calendar de Magali (o corregir path de cancel en `platica-google-docs-api` / cliente).
- Confirmar con Laura el último slot miércoles.
