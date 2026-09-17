# Bitácora 17sep — página de reserva QR
Handoff. Código gana si esto contradice algo.
17 de septiembre de 2026. Frontend y backend desplegados por Adler.
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
- Recurso Coolify del frontend: Adler lo creó. FQDN
  `https://dwooskg8gk0cwccso444o8ck.appsplatica.site`. Primer deploy falló
  por Port Mappings `80:80` (`port is already allocated`). Segundo deploy
  healthy: healthcheck `GET http://localhost:80/health`.
- Tras integrar el merge `5661374` de Luis, el frontend muestra
  `Modalidad: Presencial VIP` (o el boleto correspondiente). Para Virtual,
  horarios, citas existentes y confirmación dicen Google Meet y explican que
  la liga llega aproximadamente 15 minutos antes por WhatsApp y como
  invitación de Google al correo. No muestran mesa ni sede al asistente
  Virtual. Copy aprobado por Adler.
- El merge de Luis no tocó `frontend/` ni `/reserva-publica`; sí hizo
  coherente el correo/ICS del asistente Virtual con esta presentación.
- Ajustes de la primera reserva real (Adler, 17-sep): `/reserva-publica/reservar`
  ahora devuelve `mesa` como etiqueta `Mesa N`. `reservarCita` entrega el
  número crudo y la pantalla imprimía “en 1”. `identificar` ya usaba la
  etiqueta de Notion, así que las dos rutas quedan con el mismo formato.
- Copy de confirmación: “Guarda estos datos” en vez de “Guarda esta
  pantalla”. Botón **Agendar con otro sponsor**: reidentifica con el mismo
  correo (token nuevo) y recarga catálogo y citas confirmadas.

## Cloudflare y dominio

Las notas del standup del 17-sep registran la propuesta de Carlos de usar
Cloudflare Workers. Hospedaje y dominio son decisiones separadas: un dominio
propio puede apuntar al recurso Coolify actual. Para no introducir una
migración antes del lanzamiento del viernes, recomendación: mantener Coolify
y conectar primero un subdominio como `citas.fashiondigitaltalks.com`.
Cloudflare Pages es una alternativa posterior para el frontend estático
(assets sin límite de requests en Free); Workers/Functions no son necesarios
para esta SPA y tienen cuota separada. El backend sigue en Coolify por el
mutex de una sola réplica.

## Cómo operarlo

Frontend Coolify: mismo repo, Base Directory `/frontend`, Dockerfile,
puerto 80, health `/health`, build var `VITE_API_BASE_URL` = backend.

Backend Coolify (después de conocer dominio frontend):

- `PAGINA_RESERVA_ORIGEN=https://dwooskg8gk0cwccso444o8ck.appsplatica.site`
- `PAGINA_RESERVA_TOKEN_SECRET=<aleatorio, 32+ caracteres>`
- `PAGINA_RESERVA_TOKEN_TTL_SECONDS=28800`

Orden de deploy: commit/push → backend con env y redeploy → frontend.

## Pendientes

- Commit/push y redeploy del frontend para publicar el manejo visual Virtual.
- Definir con Lis el dominio; recomendación:
  `citas.fashiondigitaltalks.com` sobre el Coolify actual.
- Imágenes y descripciones definitivas de sponsors.

## Evidencia

- `node tests/reserva-publica.manual-test.js`: 15 casos, sin Notion/SMTP
  (incluye CORS preflight, email inválido y Bearer requerido).
- `npm run build` en `frontend/`: Vite OK, 30 módulos.
- Smoke de carga de `src/index.js`: OK.
- Verificación visual local de la portada: OK.
- Frontend en vivo 17-sep 11:30 CDMX: `GET /health` 200 y `GET /` 200
  en `https://dwooskg8gk0cwccso444o8ck.appsplatica.site`. Title
  `Citas 1 a 1 · Fashion Digital Talks`. Commit `59ce2ca`.
- Backend 17-sep 11:47 CDMX tras Runtime + redeploy: `GET /health` 200;
  OPTIONS identificar 204 con CORS del FQDN frontend; email inventado
  `EMAIL_NO_ENCONTRADO` 404; origen ajeno `ORIGEN_NO_PERMITIDO` 403;
  sponsors sin Bearer `SESION_REQUERIDA` 401. Identificar
  `jenimfv1@gmail.com` (Jenny Marketing, prueba) 200 + token; catálogo
  11 sponsors (sin Bronce). No se reservó.
- Notion Laura: Adler (`adlerero666@gmail.com`) es Presencial VIP, sin citas
  reales ni canceladas. Reevolution es sugerencia score 308 y coincide con
  sus siete soluciones buscadas. Destinatarios verificados para prueba:
  asistente `adlerero666@gmail.com`, sponsor
  `adler.calvillo@platica.mx`. No se reservó todavía.
- Tras merge de Luis: pruebas `reserva-publica`, correo y
  modificar/cancelar pasaron. El frontend con modalidad también compila
  (Vite, 30 módulos).
- Primera reserva real desde la página (17-sep, prueba): Adler × Reevolution,
  7-oct 16:30, `Mesa 1`, `Confirmada`, sin notas de fallo de correo.
  Cita `3dd62dda-199a-8181-9515-fc2325f4bbbf`; promovió la fila `Sugerido`
  existente en vez de crear otra. Correos a `adlerero666@gmail.com` y
  `adler.calvillo@platica.mx`, ambos de Adler.
