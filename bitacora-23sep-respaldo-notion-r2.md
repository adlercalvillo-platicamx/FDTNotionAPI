# Bitácora 23sep — respaldo diario Contactos/Citas a Cloudflare R2
Handoff. Código gana si esto contradice algo.
Fecha del trabajo: 23-sep-2026. Sin commit aún. Continúa el hilo de backups de Notion (conversación; no había bitácora previa de R2).

Pedido de Adler: dump diario de las dos tablas de producción de Laura, cron en Coolify, archivos en R2 (no el disco del contenedor). Cloudflare y credenciales las arma **Luis**; el backend ya queda en el repo.

## Decisión

- Solo lectura a Notion (`GET` schema + `POST` query paginado). No PATCH.
- Un gzip por corrida: schema + filas de Contactos y Citas. Campos `files` guardan el nombre, no la URL.
- Destino S3-compatible: `PutObject` a `R2_BUCKET` con key `notion-fdt/<ISO>/contactos-citas.json.gz`.
- Rotación 14 días en código (`LastModified`) **y** lifecycle que Luis pone en el bucket.
- Sin tool MCP. Sin restore automático.

## Qué cambió

- Paquete `@aws-sdk/client-s3` (autorizado al pedir implementar).
- `POST /notion/respaldar` (`X-API-Key`). Sin R2 → **503** `RESPALDO_NO_CONFIGURADO`. Fallo Notion/R2 → **502**.
- Envs: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`, opcional `R2_RETENCION_DIAS` (default 14).
- Test: `node tests/notion-respaldo.manual-test.js`
- Instructivo para Luis: `instrucciones-luis-r2-respaldos-notion.md` (sin secretos).

## Cómo operarlo

1. Luis: bucket + token + vars Coolify + lifecycle 14 días (ver el md).
2. Redeploy con este código.
3. Cron Coolify diario ~03:00 CDMX: `POST /notion/respaldar` + `X-API-Key` del backend. No crear el cron antes del deploy o fallará 404.
4. Primera corrida: 200 con `conteos` y `key`. Revisar el objeto en el dashboard de R2.

No reejecutar one-shots. No hace falta apagar campañas.

## Pendientes

- [ ] Luis termina Cloudflare + Coolify env.
- [ ] Adler redeploy + cron (o Luis el cron cuando el host ya sirva la ruta).
- [ ] Primera corrida real y anotar `bytesGzip` / conteos (sin keys) aquí o en un follow-up.
- Restore a Notion: no está en el alcance.
