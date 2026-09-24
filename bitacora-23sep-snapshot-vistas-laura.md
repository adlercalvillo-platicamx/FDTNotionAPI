# Bitácora 23sep — snapshot de vistas y campos de Laura
Handoff. Código gana si esto contradice algo.
Fecha: 23-sep-2026 (corrida ~22:00 CDMX / 04:59 UTC del 24). Commit en el mismo turno que el enganche a R2. Continúa [bitacora-23sep-respaldo-notion-r2.md].

Pedido de Adler: documentar vistas y campos actuales por miedo a perder pestañas, **subir el md a git** y meterlo en el cron de R2.

## Qué hay

- Markdown (legible, en el repo): `snapshot-vistas-campos-laura-23sep.md` — 90 campos Contactos, 58 Citas, **11** vistas de Contactos, **28** de Citas.
- JSON crudo (gitignore): `.local-backups/schema-vistas-laura-23sep.json`.
- Script: `node scripts/one-shots/snapshot-vistas-schema-laura-23sep.js`.
- El gzip de `POST /notion/respaldar` ahora incluye `schema`, `vistas` y `filas`. `conteos` trae `vistasContactos` / `vistasCitas`. No hace falta otro cron.
