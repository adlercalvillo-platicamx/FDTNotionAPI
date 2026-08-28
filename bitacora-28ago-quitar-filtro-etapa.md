# Bitácora 28-ago — Etapa deja de filtrar el pool de matchmaking

Adler: Ticketópolis ya no captura `Etapa de Negocio` en asistentes nuevos. Los 8 sponsors reales tienen `Etapa Cliente Buscada` llena, así que Capa 1 los dejaba fuera del pool (diagnóstico Luis/Liz / Adler-Sam × ficticios).

## Qué cambió

- `sugerirMatchesParaSponsor` ya no llama `getEtapasValidas`. Se eliminaron esa función y `ALIAS_ETAPA_SPONSOR_A_ASISTENTE` (solo servían al filtro).
- `buscarAsistentesCandidatos({ etapasValidas })` conserva el parámetro (no-op, igual que `incluirVirtual`) y **no** manda el `or` de etapa a Notion.
- Campos en Notion intactos. Filtro de `Tamaño de Negocio` / Madurez Exa intacto.

## Tests

- `tamano-negocio.manual-test.js`: sponsor tipo Blip + Grande sin etapa entra; Micro/Pequeña/Temprano/vacío siguen fuera.
- `matchmaking.manual-test.js`: Carlos ya no deja a Ana en 0 por etapa.
