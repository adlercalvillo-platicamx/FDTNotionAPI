# Instrucciones para Luis — respaldos de Notion (Contactos + Citas) en Cloudflare R2

Adler ya dejó el código en `fdt-notion-api`. Tú armas **Cloudflare R2**, pegas las keys en **Coolify** y (cuando el deploy ya tenga este commit) creas el **cron**. No pegues las keys en Slack, Notion ni el chat del repo.

## Qué estamos haciendo

Cada madrugada el backend **lee** las dos tablas de producción de Laura (schema, **vistas/pestañas** y filas) y sube un `.json.gz` a un bucket privado. Notion no se escribe. No se bajan fotos/PDFs, solo nombres de archivo si el campo es `files`.

Cloudflare R2 Standard trae **10 GB + 1 millón de escrituras / mes gratis**. Este uso son megas y un PUT al día. Pide tarjeta igual; no uses **Infrequent Access** (no tiene free).

## 1. Bucket en Cloudflare

1. Entra a [dash.cloudflare.com](https://dash.cloudflare.com) con la cuenta de Plática (o la que vayan a usar para FDT).
2. **R2 Object Storage** → si pide tarjeta, ponla. Clase **Standard**.
3. **Create bucket**
   - Nombre: `fdt-respaldos-notion`
   - Acceso: **privado** (no Public access / no custom domain público)
4. En el bucket: **Settings → Object lifecycle rules** (o *Lifecycle*)
   - Abortar uploads incompletos: 1 día (si aparece)
   - **Borrar objetos a los 14 días** (todo el bucket, o prefijo `notion-fdt/`)
   - El código también borra lo viejo; la regla de R2 es el cinturón.

## 2. Token de API (S3)

1. R2 → **Manage R2 API Tokens** → **Create API token**
2. Permisos: **Object Read & Write**
3. Alcance: **solo el bucket** `fdt-respaldos-notion` (no “all buckets”)
4. Copia y guarda en un sitio de secretos (1Password / el gestor de Plática), no en un doc compartido:
   - Access Key ID
   - Secret Access Key
   - Account ID (está en el overview de R2 / la URL del dashboard)
5. Endpoint (reemplaza el Account ID real, sin `< >`):

   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

Si el Secret se filtra: **revoca el token** y crea otro. No recicles el mismo.

## 3. Variables en Coolify

Application **fdt-notion-api** (el backend de citas, no el frontend QR).

Environment Variables, **Available at Runtime**. Nombres exactos:

| Name | Valor |
|---|---|
| `R2_ACCESS_KEY_ID` | Access Key ID |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key |
| `R2_BUCKET` | `fdt-respaldos-notion` |
| `R2_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `R2_RETENCION_DIAS` | `14` (opcional; default 14 si no la pones) |

No hace falta `R2_ACCOUNT_ID` en código. No uses prefijo `VITE_`. No las marques públicas.

Tras guardar: **redeploy** de esa Application (si el commit del respaldo aún no está, espera a que Adler lo deje en `main` y redespliegue).

## 4. Cron en Coolify (después del deploy con este código)

Un Scheduled Task / Cron Job HTTP, **una vez al día**:

- Método: `POST`
- URL: `https://<host-de-fdt-notion-api>/notion/respaldar`
  - Host actual documentado: `https://f8wwwgc0g88wccscww4cccco.appsplatica.site` — confirma en Coolify si cambió.
- Header: `X-API-Key: <API_SECRET_KEY>` (el mismo secret que ya usan los crons de follow-up / recordatorios; **no** el token de R2)
- Body: vacío
- Horario: **03:00 America/Mexico_City** todos los días. Si Coolify solo habla UTC: `0 9 * * *` (03:00 CDMX con offset −06; en horario de verano México a veces es −05 — si el panel tiene timezone `America/Mexico_City`, úsalo y pon `0 3 * * *`).

Sin las vars de R2 el endpoint responde **503** `RESPALDO_NO_CONFIGURADO` (el cron se ve rojo a propósito). Éxito: **200** con `ok`, `key`, `conteos`, `bytesGzip`.

No hace falta dispararlo a mano contra producción el primer día si Adler lo va a probar él; si Luis lo prueba, avisar a Adler (lee las dos tablas de Laura, no las escribe).

## 5. Cómo ver que hay un dump

Dashboard Cloudflare → R2 → bucket `fdt-respaldos-notion` → objetos tipo:

`notion-fdt/2026-09-24T09-00-00-000Z/contactos-citas.json.gz`

Para bajarlo: Download en la UI. Para descomprimir en local: `gzip -d contactos-citas.json.gz`.

## 6. Qué no hacer

- No Infrequent Access
- No bucket público
- No pegar el Secret en el chat / bitácoras / git
- No usar este bucket para videos u otras apps
- No crear un cron cada 5 minutos: es **diario**
- No hay restore automático. Restaurar filas a Notion es otro trabajo, a mano y con Adler.

## Listo cuando

- [ ] Bucket privado Standard + lifecycle 14 días
- [ ] Token acotado a ese bucket
- [ ] 4–5 vars en Coolify + redeploy
- [ ] Cron diario 03:00 CDMX a `POST /notion/respaldar` con `X-API-Key`
- [ ] Un objeto visible en R2 tras la primera corrida (o un 200 de prueba que Adler dispare)
