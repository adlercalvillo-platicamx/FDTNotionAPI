# Frontend — reserva QR FDT 2026

SPA móvil en React/Vite. Recurso Coolify **separado** del backend, aunque
comparte este repositorio.

## Local

```bash
npm install
$env:VITE_API_BASE_URL="http://localhost:3001" # PowerShell
npm run dev
```

No pongas `API_SECRET_KEY`, tokens de Notion ni secretos en variables `VITE_*`:
Vite las publica dentro del JavaScript del navegador.

## Coolify

1. Application nueva conectada al mismo repo/rama del backend.
2. Base/Root Directory: `/frontend`.
3. Build Pack: Dockerfile (`/Dockerfile`, relativo a esa carpeta).
4. Puerto del contenedor: Ports Exposes `80`. **Port Mappings vacío**: mapear
   `80:80` al host choca con el proxy de Coolify (`port is already allocated`).
5. Build Variable: `VITE_API_BASE_URL` = URL pública de `fdt-notion-api`,
   sin slash final
   (`https://f8wwwgc0g88wccscww4cccco.appsplatica.site`).
6. Dominio autogenerado (17-sep):
   `https://dwooskg8gk0cwccso444o8ck.appsplatica.site`.
6. Opcional: `VITE_EVENT_DATES=2026-10-07,2026-10-08`.
7. Health check: `/health`.

Cuando Coolify asigne el dominio del frontend, agregar en el **recurso del
backend**:

```text
PAGINA_RESERVA_ORIGEN=https://<frontend>.appsplatica.site
PAGINA_RESERVA_TOKEN_SECRET=<secreto aleatorio de 32+ caracteres>
PAGINA_RESERVA_TOKEN_TTL_SECONDS=28800
```

Después redeploy del backend. El frontend nunca conoce
`PAGINA_RESERVA_TOKEN_SECRET`.

## Assets

Las tarjetas usan logo/biografía de Contactos cuando existen y muestran
iniciales como fallback. Adler proporcionará las imágenes y descripciones
definitivas de sponsors; no se copiaron assets del Wix.
