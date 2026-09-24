# Middleware de enriquecimiento FDT

Application de Coolify separada que hace polling de Notion y entrega tareas al
subagente de enriquecimiento de Plática.

Procesa dos universos:

- Contactos con `Webhook enviado = false` (flujo existente).
- Filas reales de Citas pendientes de `Estado Enriquecimiento Match`.

El segundo flujo está apagado por default (`MATCHES_HABILITADO=false`). No lo
enciendas hasta:

1. configurar el `NOTION_CONTACTO_BLOQUEO_AGENDA_ID` de Laura;
2. probar una fila nombrada;
3. revisar cuántas filas históricas están pendientes;
4. decidir el lote de backfill.

## Estado de un match

Vacío → `En curso` → `Completado`. Un rechazo de Plática deja `Falló`. Un
`En curso` de más de `MATCH_STALE_MINUTES` vuelve a ser elegible, hasta
`MATCH_MAX_ATTEMPTS`.

`Ambiguo` es un resultado de negocio válido y termina en `Completado`; no se
reintenta automáticamente.

## Coolify

Usar la Application de enriquecimiento que ya existe, cambiando su repositorio
al de Adler cuando se haga el corte:

- Build Pack: Nixpacks.
- Base directory: `/middleware-enriquecimiento`.
- Start command: `python notion_platica_middleware.py`.
- Una sola réplica.
- Conservar las variables actuales del flujo de Contactos. Los nombres legacy
  `NOTION_DATABASE_ID`, `MAX_PER_CYCLE`, `BACKFILL_GUARD_MAX`,
  `SKIP_BACKFILL_GUARD` y `PLATICA_CLIENT_NAME` siguen soportados.
- Añadir las variables nuevas de `.env.example` con
  `MATCHES_HABILITADO=false` en el primer deploy.

No hay Docker, cron HTTP ni cambios en la Application del backend Node. Este
proceso conserva su propio loop de polling y no reutiliza `API_SECRET_KEY`.

## Local

```bash
cd middleware-enriquecimiento
python -m pip install -r requirements.txt
copy .env.example .env
python notion_platica_middleware.py
```

Nunca guardar `.env` ni tokens en git.
