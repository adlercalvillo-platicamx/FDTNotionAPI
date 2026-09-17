# Página de reserva 1a1 (QR en piso) — contexto vivo

Handoff de producto e infraestructura. Si esto contradice `src/`, gana el código.
Fecha de arranque: 17-sep-2026. Bitácora: [bitacora-17sep-pagina-reserva-qr.md](bitacora-17sep-pagina-reserva-qr.md).
Contrato HTTP de la página: implementado localmente el 17-sep; pendiente
commit/push, variables y redeploy.

## Qué es

Página **nueva**, recurso Coolify **aparte** de `fdt-notion-api`. El asistente
en el evento (QR en pantallas) agenda una cita 1a1 **sin WhatsApp**.

No es login con contraseña ni magic link: escribe el **correo** con el que
se registró en Ticketopolis.

## Flujo de producto (decidido 17-sep, Adler)

1. Identificación por email (texto libre).
2. El correo **existe** en Contactos (Notion). Si no: copy de “no estás
   registrado como asistente; usa el correo de Ticketopolis”.
3. El boleto **incluye 1a1**. Expo fuera, con copy de por qué. VIP,
   presencial con citas, speaker, virtual: sí. **No** se usa
   `Quiere Citas 1a1 = No` como muro en piso.
4. Catálogo de **sponsors** (descripción + imagen: Adler las pasa después).
   **No** son las sugerencias de matchmaking. Giro / tamaño / área /
   soluciones / ranking **no** aplican. Una agencia/cámara/fintech con
   boleto que no sea Expo **sí** puede agendar desde el QR.
5. Elige sponsor → horarios libres de ese sponsor → confirma.
6. Éxito: mensaje con WhatsApp de soporte para modificar/cancelar
   (hoy en correos del asistente: `+52 33 3236 1963`).

Orden del flujo: **correo primero** (Adler, 17-sep). Luego sponsors →
horario → confirmar.

Modificar/cancelar **no** van en esta página: WhatsApp / Agente 2.

## Qué hace ya el backend (septiembre, código)

Sirve **tal cual** para horario y escritura, una vez que la página tenga
`contactoId` + `sponsor_notion_id` + `inicio`/`fin`:

| Paso | Qué hay | Qué no hay |
|---|---|---|
| Identificar por email | Campo `Email` en Contactos. `buscarDadoDeBajaPorEmailOTelefono` filtra por `Email equals`. | **No** hay REST de “buscar asistente por email”. `GET /contactos/buscar` es `nombre` / `telefono` / `empresa`. WhatsApp: `buscarAsistentePorWhatsApp`. |
| Boleto Expo | `reservarCita` rechaza Expo con `BOLETO_EXPO_NO_PERMITE_CITAS` (400). | La página igual necesita copy **antes** de mostrar sponsors; eso implica leer `Ticket / Tipo Asistencia` al identificar. |
| Lista de sponsors para el QR | Interno: `listarSponsorsActivos()` (Categoria=Sponsor, no Dado de Baja). Bronce se omite en matchmaking, no en esta lista. | **No** hay REST público de catálogo. **No** hay fotos ni copy de stand en Notion pensados para esta página. |
| Sugerencias WhatsApp | `GET /matchmaking/sugerencias-asistente?telefono=` o `contactoId=`. `GET /citas/sugeridas?whatsapp=` o `asistente_notion_id=`. | Ninguno acepta `email`. **No usarlos como catálogo del QR** (son Aprobado / capas de matchmaking). |
| Citas ya confirmadas | Sí, REST: ambos GET de arriba traen `citasConfirmadas`. MCP `consultar_sugeridas_para_asistente` también. Clave: teléfono o `contactoId`, no email. | — |
| Horarios | `GET /citas/disponibilidad` (sponsor; opcional `asistente_notion_id`). 11 mesas, ocupación, bloqueos de programa. | — |
| Reservar | `POST /citas/reservar` (mutex, mesa, `.ics`). Promueve fila `Sugerido` o `Aprobado` del par; si no hay, **crea fila nueva**. Par ya con cita real → `CITA_PARA_YA_ACTIVA`. Cancelada **no revive**: nueva fila + `cita_origen_cancelada_id`. | **No** promueve `Rechazado` (solo Sugerido/Aprobado). Un `Rechazado` + reserva directa hoy **crea otra fila**. Si el QR debe “levantar” un Rechazado, eso es cambio de negocio a diseñar, no asumir. |

CORS: el API **no** tiene `cors` hoy. Toda ruta de negocio exige `X-API-Key`.
El contrato propuesto abajo es la capa pública; `/citas` no se llama desde el browser.

## Infraestructura (decidido 17-sep)

- Recurso Coolify **nuevo**, no metido en `fdt-notion-api`.
- Mientras no haya DNS de `fashiondigitaltalks.com`: subdominio autogenerado
  `*.appsplatica.site`. Ejemplo del backend actual:
  `https://f8wwwgc0g88wccscww4cccco.appsplatica.site` — **no reutilizar ese
  host**; es otro recurso.
- DNS de `citas.fashiondigitaltalks.com`: pendiente preguntar a Laura
  (Wix / Livent / registrador original). Cambiar dominio en Coolify →
  pestaña Domains; no se pierde el trabajo.
- Alternativa: dominio barato tipo `citasfdt.com` (precio no verificado).
- Stack del frontend: Vite + React en carpeta `frontend/` (mismo repo).
  Coolify Base Directory = `/frontend`; Dockerfile sirve la SPA con nginx.
- Recurso Coolify (Adler, 17-sep): Application aparte, repo público
  `adlercalvillo-platicamx/FDTNotionAPI`, rama `main`, Build Pack
  Dockerfile. FQDN autogenerado:
  `https://dwooskg8gk0cwccso444o8ck.appsplatica.site`

## Contrato HTTP de la página QR

Prefijo nuevo, **aparte** de `/citas` y `/contactos` (esos siguen con
`X-API-Key` para Plática/Liz). El browser **nunca** lleva `API_SECRET_KEY`.

Tras identificar, un token corto (HMAC, ~unas horas) con el `contactoId`.
Las demás llamadas de la página llevan ese token. El email es la “llave”
débil de piso; no se reserva con un UUID suelto.

CORS solo del origen Coolify de esta página (`PAGINA_RESERVA_ORIGEN`).

| # | Método | Para qué | Reusa |
|---|---|---|---|
| 1 | `POST …/identificar` `{ email }` | Buscar Contactos por Email, boleto, baja, categoría. Devuelve token + nombre + citas confirmadas. | Nuevo query Notion (`Email equals`). Expo aquí, no hasta reservar. |
| 2 | `GET …/sponsors` | Catálogo QR (nombre, empresa, copy, imagen). Sin giro/ranking. | `listarSponsorsActivos`; **excluir Bronce** (no hacen 1a1). Copy/foto: estáticos o env hasta que Adler los pase. |
| 3 | `GET …/disponibilidad?sponsor=&fecha=` | Horarios del sponsor (y empalme del asistente del token). | `obtenerDisponibilidadSponsor` |
| 4 | `POST …/reservar` `{ sponsor, inicio, fin }` | Confirmar. Backend resuelve Sugerido/Aprobado, par activo, cancelada (`cita_origen_cancelada_id`). | `reservarCita` |

Errores de identificar que la UI pinta: correo no encontrado; Expo; dado de baja / no es asistente.

`Rechazado` se conserva como historial y se crea una fila nueva. No se
redefine ni se promueve una decisión humana previa.

## Repo y Coolify

Mismo git (`FDTNotionAPI`), carpeta `frontend/` (nombre habitual en
monorepos; no `Frontend` ni `cliente`). Recurso Coolify **nuevo** con
Base Directory `frontend`. No se mete el build en el recurso del API.

## Pendientes

- [x] Application Coolify + FQDN `dwooskg8gk0cwccso444o8ck.appsplatica.site`.
- [ ] Commit/push de `frontend/` y `/reserva-publica` (aún no está en `main`).
- [ ] Preguntar a Laura quién tiene el DNS de fashiondigitaltalks.com.
- [x] Contrato HTTP y criterio de `Rechazado`.
- [ ] Copy Expo / no encontrado (Adler aprueba texto antes de implementar).
- [ ] Fotos y descripciones de sponsors.
- [ ] Disponibilidad real de dominio propio si se compra.
