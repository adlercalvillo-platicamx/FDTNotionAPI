# Bitácora tests GET /citas/disponibilidad — 14 ago 2026

**Base:** `https://f8wwwgc0g88wccscww4cccco.appsplatica.site`  
**Commit desplegado:** `74d9727` (health OK)  
**Sponsor de prueba:** Magali Parra (CaaS) `3b790fe2-7345-8164-bc7e-ec3c81a07486`

## Hallazgo bloqueante (antes de completar 1/2/3/6/7)

| Variable | ¿La ve el proceso? |
|---|---|
| `CITAS_FECHAS_EVENTO` | **Sí** — Caso 4 lista `2026-10-07, 2026-10-08` |
| `CITAS_HORA_INICIO_2026-10-07` | **No** |
| `CITAS_HORA_FIN_2026-10-07` | **No** |

Respuesta real al pedir disponibilidad para `2026-10-07`:

```json
{
  "error": "Service Unavailable",
  "message": "Horario de citas 1-a-1 no configurado para \"2026-10-07\". Faltan las variables de entorno: CITAS_HORA_INICIO_2026-10-07, CITAS_HORA_FIN_2026-10-07. No se puede calcular disponibilidad sin esto — servir un horario de ejemplo daría una respuesta falsa, no una respuesta incompleta."
}
```

**Interpretación:** Coolify aceptó (o el redeploy corrió con) `CITAS_FECHAS_EVENTO`, pero **no** está inyectando los nombres con guiones en la fecha (`…_2026-10-07`). El 503 es el fail-fast correcto (equivale a Caso 4b en ambiente “sin horario de esa fecha”).

**Causa confirmada (Adler pegó los Names de Coolify):** las vars SÍ estaban en la UI con guiones. Coolify **no soporta guiones en Names de env** ([issue #3639](https://github.com/coollabsio/coolify/issues/3639)) — las muestra pero no las inyecta al contenedor. `CITAS_FECHAS_EVENTO` funciona porque su Name no lleva `-`.

**Fix en código (pendiente push):** `fechaEnvKey()` convierte `2026-10-07` → `2026_10_07` al leer env. Query param del API **sin cambio**.

**Acción para Adler en Coolify — borrar las 4 con guiones y crear estas:**

| Name (nuevo) | Value |
|---|---|
| `CITAS_HORA_INICIO_2026_10_07` | `10:30` |
| `CITAS_HORA_FIN_2026_10_07` | `19:00` |
| `CITAS_HORA_INICIO_2026_10_08` | `09:00` |
| `CITAS_HORA_FIN_2026_10_08` | `18:00` |

Dejar igual: `CITAS_FECHAS_EVENTO`, `CITAS_DURACION_BLOQUE_MINUTOS`, `CITAS_ZONA_HORARIA_OFFSET`. Luego push del fix + redeploy.

## Resultados parciales

| Caso | Resultado | Evidencia |
|---|---|---|
| 5 falta param | **PASS** | `400` + mensaje `sponsor_notion_id` requerido |
| 4 fecha fuera | **PASS** | `400` + fechas válidas `2026-10-07, 2026-10-08` |
| 4b fail-fast sin horario día | **PASS (de facto en Coolify)** | `503` explícito listando vars faltantes — no inventó bloques ni cayó en 500 |
| 4c límites de bloques | **BLOQUEADO** | necesita vars de hora |
| 1 feliz | **BLOQUEADO** | idem |
| 2 sponsor ocupado | **PENDIENTE** | |
| 3 mesas llenas | **PENDIENTE** | setup pesado (11 Confirmadas) |
| 6 id inexistente | **BLOQUEADO** | solo vimos 503 de config, no el comportamiento Notion |
| 7 vs reservar | **PENDIENTE** | |

Smoke local previo (`tests/disponibilidad.local-smoke.js`): 4 / 4b / 4c **PASS** sin Notion.

## Siguiente paso

1. Adler confirma/corrige env en Coolify + redeploy si hizo falta.  
2. Re-correr script `node scripts/one-shots/correr-tests-disponibilidad.js` y completar 1, 4c, 6, 2, 7.
