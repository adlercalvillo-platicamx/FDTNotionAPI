# Bitácora 17sep — página de reserva QR
Handoff. Código gana si esto contradice algo.
17 de septiembre de 2026. Sin tocar Coolify ni Notion real.
Continúa el hilo nuevo de [contexto-pagina-reserva-qr.md](contexto-pagina-reserva-qr.md).

## Pedido

Adler: página para que el asistente en piso (QR) se identifique con correo,
vea sponsors, elija horario y reserve. Recurso Coolify aparte.

Decisión de producto (Adler, corrige la sesión previa): **no** es el funnel
de sugerencias WhatsApp. En piso entra quien esté en Notion y cuyo boleto no
sea Expo, aunque haya dicho que no quería citas o su giro no sea de los tres.

## Qué se hizo

- Backend público `/reserva-publica`: identificar, sponsors, disponibilidad
  y reservar. CORS por origen, rate limit y token HMAC temporal; el browser
  nunca recibe `API_SECRET_KEY`.
- `buscarContactosPorEmail` exacto; duplicado activo falla cerrado.
- Boleto: Presencial, Presencial VIP, Virtual y Speaker. Expo fuera.
  `Quiere Citas 1a1=No` no bloquea este flujo de piso.
- Sponsors activos excepto Bronce; sin filtros de matchmaking.
- Reserva reusa `booking.service.js` y su mutex. Sugerido/Aprobado se
  promueven; sin fila crea una. `Rechazado` se conserva como historial.
  Una Cancelada reagendable se enlaza como origen de la fila nueva.
- Frontend React/Vite móvil en `frontend/`, Dockerfile nginx y health.
  Diseño inspirado (no copiado) en FDT: fondo editorial navy,
  magenta/morado, CTA coral, encabezados Raleway y tarjetas.
- Copy aprobado por Adler, incluida la corrección “correo que utilizaste
  en tu registro” (sin nombrar Ticketopolis).
- Docs actualizados: README, AGENTS, `.env.example`, contexto y README del
  frontend.
- **No** se creó el Application en Coolify: desde Cursor no hay URL ni sesión
  del panel ( commos `coolify.appsplatica.site` / `appsplatica.site` /
  `coolify.platica.mx` no resolvieron). El backend sigue en
  `https://f8wwwgc0g88wccscww4cccco.appsplatica.site`. Adler redeploya ese
  recurso a mano; este agente nunca tuvo API Coolify.

## Cómo operarlo

Frontend Coolify: mismo repo, Base Directory `/frontend`, Dockerfile,
puerto 80, health `/health`, build var `VITE_API_BASE_URL` = backend.

Backend Coolify (después de conocer dominio frontend):

- `PAGINA_RESERVA_ORIGEN=https://dwooskg8gk0cwccso444o8ck.appsplatica.site`
- `PAGINA_RESERVA_TOKEN_SECRET=<aleatorio, 32+ caracteres>`
- `PAGINA_RESERVA_TOKEN_TTL_SECONDS=28800`

Orden de deploy: commit/push → backend con env y redeploy → frontend.

## Pendientes

- Commit/push: `frontend/` y `/reserva-publica` **no están en GitHub todavía**.
- En el recurso **frontend** Coolify: Ports Exposes 80 y **Port Mappings
  vacío** (un `80:80` al host da `port is already allocated`: ese puerto es
  del proxy). ARG/build
  `VITE_API_BASE_URL=https://f8wwwgc0g88wccscww4cccco.appsplatica.site`.
- En el recurso **backend** (después del push): las tres env de arriba +
  redeploy. No tocar el resto de env del API.
- Preguntar a Laura el DNS de fashiondigitaltalks.com.
- Imágenes y descripciones definitivas de sponsors.

## Evidencia

- `node tests/reserva-publica.manual-test.js`: 15 casos, sin Notion/SMTP
  (incluye CORS preflight, email inválido y Bearer requerido).
- `npm run build` en `frontend/`: Vite OK, 30 módulos.
- Smoke de carga de `src/index.js`: OK.
- Verificación visual local de la portada: OK.
