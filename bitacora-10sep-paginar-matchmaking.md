# Bitácora 10sep — paginar matchmaking (pool >100)

Handoff. Código gana si esto contradice algo.
Fecha del trabajo: 10-sep-2026. Continúa el diagnóstico de volumen contra Notion de Laura (producción vía `.env`, no MCP de pruebas).

## Pedido

Prevenir que, con ~1000–2000 asistentes, el ranking solo vea la primera página de Notion. Adler pidió el plan (paginar pool, cachear en global, pares en memoria también en un sponsor, retry 429) e implementarlo ahora. No cambia reglas de negocio ni `topN`.

## Decisión

Hoy en producción de Laura el pool de matchmaking (boleto + giro) es **55** y cabe en 100. Hay **103** asistentes activos (ya 2 páginas). El arreglo es preventivo: cuando el pool elegible cruce 100, no recortar en silencio.

## Qué cambió y por qué

- `buscarAsistentesCandidatos` y `listarSponsorsActivos` recorren `has_more` (tope 50 páginas).
- `sugerirMatchesGlobal` carga el pool **una vez** y lo pasa a cada sponsor (`_candidatosPoolCache`).
- Un sponsor suelto ya no llama `existeCitaActivaEntre` por candidato: carga `obtenerParesConCitaActiva` una vez (o usa la caché del global).
- `notionFetch` reintenta HTTP 429 (hasta 5, `Retry-After` o backoff, tope 15 s).

Reserva, mesas y WhatsApp no se tocaron: no recorren el universo de asistentes.

## Cómo operarlo

Mismo cron / MCP / REST de matchmaking. Dry-run default igual. Redeploy Coolify para que producción pagina. No reejecutar one-shots. No hace falta cambiar env.

## Evidencia

Consultado Laura (`3b162dda…`): 103 asistentes activos, 55 en filtro de ranking, 11 sponsors. Tests: `matchmaking-paginacion`, `notion-429`, `global-cache-citas`, más la batería de matchmaking que usa `sugerirMatchesParaSponsor`.

## Pendientes

- Checklist `listarSponsorsYSpeakersActivos` sigue en una página de 100 (hoy irrelevante).
- Coolify aún no tiene este commit hasta que Adler redeploye.
