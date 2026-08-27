# Bitácora 27 ago — recordatorio del evento como cron diario

`POST /matchmaking/enviar-recordatorio-evento` ahora es seguro de llamar todos los días. Antes de 14 días del primer día del evento no toca Notion ni Plática.

**Fecha:** primer valor de `CITAS_FECHAS_EVENTO` (hoy `2026-10-07`). Fallback constante `FECHA_EVENTO`. “Hoy” se calcula en `America/Mexico_City`. Ventana abre el **2026-09-23**. `DIAS_ANTES_RECORDATORIO_EVENTO` sigue en 14.

Antes de esa fecha: `{ disparado: false, motivo: 'VENTANA_NO_CUMPLIDA', diasRestantes: N }`. Después: la misma clasificación/reenvío de siempre. Un día caído se recupera solo en la corrida siguiente; el checkbox evita duplicados.

`ahora` existe solo en el service para tests. El HTTP **no** lo acepta.

## Coolify (Adler, no Cursor)

- **Name:** `Recordatorio evento matchmaking`
- **Command:**
  ```
  curl -X POST http://localhost:3001/matchmaking/enviar-recordatorio-evento -H "X-API-Key: <valor real>" -H "Content-Type: application/json"
  ```
- **Frequency:** `0 9 * * *` (todos los días a las 9am)
- **Timeout:** 300 segundos (igual que el cron de sugerencias)
- **Container name:** vacío

Hasta el 23-sep el cron no hace nada útil. El 23 y después procesa; los ya marcados no se vuelven a tocar.
