# Página de reserva 1a1 (QR en piso) — contexto vivo

Handoff de producto e infraestructura. Si esto contradice `src/`, gana el código.
Fecha de arranque: 17-sep-2026. Actualizado 22-sep: uso interno, muro de giro,
modificar/cancelar/reagendar. Bitácoras: [bitacora-17sep-pagina-reserva-qr.md](bitacora-17sep-pagina-reserva-qr.md),
[bitacora-22sep-pagina-interna-citas.md](bitacora-22sep-pagina-interna-citas.md).

## Qué es

Página **nueva**, recurso Coolify **aparte** de `fdt-notion-api`. Identificación
por el **correo** de Ticketopolis. Desde 22-sep es de **uso interno**; el flujo
sigue siendo el mismo (correo → citas → catálogo).

## Flujo de producto (22-sep, Adler)

1. Identificación por email. Si dos o más asistentes activos comparten el
   correo, aparece una pantalla para elegir persona antes del catálogo. El
   backend revalida que la selección pertenezca a ese mismo correo.
2. El correo **existe** en Contactos. Si no: copy de no registrado.
3. El boleto **incluye 1a1** (Expo fuera) **y** el giro es uno de los 3
   (`GIROS_ELEGIBLES_MATCHMAKING`). Si el giro no calza, se dice al entrar
   el correo, nombrando el giro registrado. Tamaño, área, soluciones y
   `Quiere Citas 1a1=No` **no** bloquean. VIP / presencial / speaker / virtual: sí.
4. Catálogo de **todos** los sponsors activos no Bronce. Sale de Notion
   (`listarSponsorsActivos`); Mercado Libre / Pikstudio / Optimus Digital
   aparecen solos si están como Sponsor. Logo/copy: `Logo Empresa Speaker` y bio.
5. Citas confirmadas arriba: **Modificar horario** / **Cancelar** (mismas
   reglas que el Agente 2). Canceladas reagendables: botón **Reagendar**
   (fila nueva + `cita_origen_cancelada_id`; la cancelada no revive).
6. Elige sponsor → horarios (grilla completa del día, no tope de 3) → confirma.
7. Éxito: se puede volver a la lista. WhatsApp de soporte queda de respaldo.

## Contrato HTTP

Prefijo `/reserva-publica`. Token HMAC del `contactoId`. CORS de
`PAGINA_RESERVA_ORIGEN`.

| Método | Ruta | Notas |
|---|---|---|
| POST | `/identificar` | `{ email, contactoId? }`. Correo compartido → 409 con opciones; selección validada → boleto + giro, token, confirmadas y canceladas reagendables. |
| GET | `/sponsors` | No Bronce. |
| GET | `/disponibilidad` | `exceptCitaId` al modificar. |
| POST | `/reservar` | Enlaza cancelada reagendable del par. |
| POST | `/citas/:citaId/modificar` | Ownership del token. |
| POST | `/citas/:citaId/cancelar` | Ownership del token. |

## Flujo original (17-sep, histórico)

1. Identificación por email (texto libre).
2. El correo **existe** en Contactos (Notion). Si no: copy de “no estás
   registrado como asistente; usa el correo de Ticketopolis”.
3. El boleto **incluye 1a1**. Expo fuera. **No** se usaba giro ni
   `Quiere Citas 1a1 = No`.
4. Catálogo sin matchmaking.
5. Elige sponsor → horarios → confirma.
6. Modificar/cancelar **no** iban en la página: WhatsApp / Agente 2.


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

CORS: el API **no** tiene `cors` genérico. `/reserva-publica` sí, acotado
al origen de la página. `/citas` no se llama desde el browser.

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
| 1 | `POST …/identificar` `{ email, contactoId? }` | Email compartido devuelve opciones mínimas; al elegir se valida el contacto contra el mismo correo. Después: boleto, giro, token, confirmadas y canceladas reagendables. | `EMAIL_AMBIGUO`, Expo y `GIRO_NO_ELEGIBLE` aquí. |
| 2 | `GET …/sponsors` | Catálogo no Bronce. | `listarSponsorsActivos`. |
| 3 | `GET …/disponibilidad?sponsor=&fecha=&exceptCitaId=` | Horarios; `exceptCitaId` al modificar. | `obtenerDisponibilidadSponsor` |
| 4 | `POST …/reservar` `{ sponsor, inicio, fin }` | Confirmar / reagendar cancelada. | `reservarCita` |
| 5 | `POST …/citas/:citaId/modificar` `{ inicio }` | Mover cita del token. | `modificarCita` |
| 6 | `POST …/citas/:citaId/cancelar` | Cancelar cita del token. | `cancelarCita` |

Errores de identificar que la UI pinta: correo no encontrado; Expo; giro no elegible (nombra el giro); dado de baja / no es asistente.

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
- [x] Muro de giro al identificar (22-sep).
- [x] Modificar / cancelar / reagendar en la página (22-sep).
- [ ] Restaurar correos reales de sponsors cuando dejen de probar SMTP.
- [ ] Fotos y descripciones de sponsors (campo Notion; salen solos si están llenos).
- [ ] Disponibilidad real de dominio propio si se compra.
