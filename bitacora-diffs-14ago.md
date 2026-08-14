# Bitácora — sesión 14 ago (Cursor): DIFF-1, DIFF-2, DIFF-13

Fecha: 2026-08-14  
Repo: `adlercalvillo-platicamx/FDTNotionAPI` @ `main`  
Base verificada antes de aplicar: `f23b948`

## Alcance ejecutado

- Código: DIFF-1 (`contactos.service.js`), DIFF-2 (`matchmaking.service.js`), DIFF-13 (`booking.service.js`)
- Tests: `tests/sesion-14ago-diffs.manual-test.js` (nuevo) + batería existente
- Docs (DIFF-3…9, 12, 14): **no aplicados** — Adler se encarga
- Prompts Plática (DIFF-10, DIFF-11): ver sección abajo / siguiente paso

## DIFF-1 — `contactos.service.js`

**Qué lo disparó:** Madurez Negocio (Exa) ya existía en Notion y no se leía; Virtual debe entrar por default.

**Cambios aplicados (sin desviación del diff consolidado):**
- A: `madurezNegocioExa: select(p['Madurez Negocio (Exa)'])` en `parsearContacto`
- B.1–B.3: comentario de elegibilidad, `tiposBoletoElegibles` incluye Virtual siempre, post-filtro `Presencial || Virtual` con `quiereCitas1a1 !== 'No'`
- `incluirVirtual` deprecado (firma conservada, sin efecto)

**Verificación:** bloques ANTES coincidían 1:1 con `main` (fix 12-ago de Quiere Citas ya estaba).

## DIFF-2 — `matchmaking.service.js`

**Qué lo disparó:** fusión Presencial (150) + Madurez Negocio (40/15) en un solo diff.

**Cambios:** `PESOS`, `senales`, cuerpo de `calcularScore`, `generarExplicacionNatural`, docstring `incluirVirtual` en `sugerirMatchesParaSponsor` y `sugerirMatchesGlobal`.

**Orden de inserción:** Presencial antes que Madurez (como pedía el consolidado).

**Nota sobre scores existentes:** candidatos Presencial/VIP suben **+150** respecto a antes (diseño intencional). El “caso dominante” de madurez vacía suma **0** por madurez; el +150 de presencial es independiente.

## DIFF-13 — `booking.service.js`

**Qué lo disparó:** punto 2.7 — duración 30 min + rango 7–8 oct 2026.

**Cambios:** constantes + `validarDuracionYFecha` (antes del chequeo de idempotencia) + export para tests.

**Sin desviación** del texto del diff. `BookingError` queda declarado después de la función; OK en runtime (throw al llamar).

## Tests

### Nuevos (`node tests/sesion-14ago-diffs.manual-test.js`) — TODOS PASARON

Prioridades del prompt:
- Madurez null + Presencial → solo +PRESENCIAL, sin línea madurez ✅
- Nancy/ZAGIS patrón (Capa 2 no bypasea Capa 1) ✅
- Cruce medianoche 7→8 oct ✅
- Duración ≠ 30 → `INVALID_INPUT` ✅

### Batería existente — sin roturas

- `matchmaking.manual-test.js` — Ana Sofía score ahora 1310 (= previo +150 presencial)
- `matchmaking-global.manual-test.js`
- `aprobar-match.manual-test.js`
- `global-cache-citas.manual-test.js`
- `checklist.manual-test.js`
- `disponibilidad.local-smoke.js`
- `matchmaking-2026.manual-test.js` (VIP 690 = 500+150+…; Presencial nombrado 1310)

## Commit / push

- Commit: `e542694` — `feat: Madurez Negocio + Virtual en matchmaking y validacion 30min/fechas en booking`
- Push: `main` → `origin/main` OK (`f23b948..e542694`)

## DIFF-10 / DIFF-11 — prompts Plática (aplicados)

| Agente | ID | Qué se hizo |
|---|---|---|
| Orquestador (ya se llamaba Agente 1 en UI) | `iCcgnFhYPUyg5ReD7prB` | Prompt: quitó DEMO, nota nomenclatura 14-ago, numeración Agente 1/2/3 actualizada, TONO sin "demo" |
| Subagente Matchmaking | `gZ4oJ84r1JT79zd9AEZg` | Prompt: rename identidad + dataset sin "demo" + notas Virtual/Presencial y Madurez Negocio; **nombre UI** → `Agente 1 — Subagente Matchmaking, Citas y Checklist` |
| Enriquecimiento Exa | `vhmqfLCnNLKsBDh2HEd2` | **No tocado** (fuera de alcance) |

## Post-redeploy Coolify (Adler redeployó; verificación Cursor)

Base: `https://f8wwwgc0g88wccscww4cccco.appsplatica.site`

| Prueba | Resultado | Evidencia |
|---|---|---|
| `GET /health` | **PASS** | `{"status":"ok","service":"fdt-notion-api",...}` |
| `sugerir_matches` Blip (Cristal) | **PASS** | HTTP 200 — 24 eval / 8 top; todas con línea `presencial:` (+150 vivo) |
| `sugerir_matches` Magali Parra | **PASS** | HTTP 200 — 7 eval / 2 top; `presencial:` presente; madurez 0 en top (campo vacío dominante) |
| `reservar_cita` 45 min | **PASS** | HTTP **400** `INVALID_INPUT` — duración exacta 30 min |
| `reservar_cita` 6 oct | **PASS** | HTTP **400** `INVALID_INPUT` — fuera de rango 7–8 oct |
| `reservar_cita` válida 30 min 8-oct 10:00 | **PASS** | HTTP **201** Confirmada — `request_id` `defba09c-…`, Notion `3bc90fe2-7345-8106-9309-e683aa9cc625`, Calendar `ok51n1eiinn67gt2dag42gbmj4` |

Cleanup de la Confirmada de prueba: Notion `Estatus` → `Cancelada` en `3bc90fe2-7345-8106-9309-e683aa9cc625`; `GET disponibilidad` Magali jueves vuelve a marcar `10:00` como libre.

## Iteración — horario operativo también en `reservarCita` (mismo día)

Pedido de Adler tras el redeploy: el cruce de medianoche no debía pasar; solo
bloques de las env (igual que `/citas/disponibilidad`).

**Cambio:** `validarDuracionYFecha` ahora exige mismo día, día ∈ `CITAS_FECHAS_EVENTO`,
horario env presente (si no → `HORARIO_NO_CONFIGURADO` / 503), y `inicio` ∈
`generarBloquesParaFecha(día)` (misma grilla). Controller mapea el código nuevo a 503.

**Tests:** `tests/sesion-14ago-diffs.manual-test.js` — medianoche rechazada; 09:00 mié
rechazado; 18:30 mié / 09:00 jue OK; fail-fast sin env. Smoke disponibilidad intacto.

**Pendiente:** commit + push + redeploy Coolify para que producción lo tome.

## Desviaciones del plan

- Ninguna en código.
- Docs fuera de alcance por instrucción explícita de Adler en esta sesión.
- No existe ya un agente llamado literalmente "DEMO - Agente Orquestador FDT"; el orquestador vivo es `Agente 1 | Fuente de Verdad y Matchmaking` (`iCcgnFhYPUyg5ReD7prB`) — se aplicó DIFF-10 ahí.
