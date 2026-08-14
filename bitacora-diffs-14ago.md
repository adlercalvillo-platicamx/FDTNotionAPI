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

## Pendiente post-commit

1. Push a `main` + **redeploy manual Coolify** + `/health`
2. Prueba MCP real: 2× `sugerir_matches_para_sponsor`, 2× `reservar_cita` (inválida + válida)
3. DIFF-10 / DIFF-11 en prompts Plática
4. Docs: Adler

## Desviaciones del plan

- Ninguna en código.
- Docs fuera de alcance por instrucción explícita de Adler en esta sesión.
