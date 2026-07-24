# fdt-notion-api

Backend de citas 1a1, matchmaking y checklist para **Fashion Digital Talks 2026** — Plática.mx.

Repo independiente de `platica-google-docs-api` (el de Ernesto/Adler para Google Docs/Sheets/Calendar). Este servicio **no duplica** ese código — le llama por HTTP cuando necesita Calendar. Ver razones en la sección "Por qué un repo separado" abajo.

## Stack
- Node.js + Express
- Deploy: Coolify — **debe fijarse a 1 sola réplica** (ver advertencia en `booking.service.js`)
- Fuente de verdad: Notion (API REST directa, sin MCP)

## Estructura
```
src/
├── index.js                          # Bootstrap Express
├── middleware/
│   └── auth.middleware.js            # Valida X-API-Key (propio de este repo)
├── routes/
│   ├── citas.routes.js
│   ├── matchmaking.routes.js
│   └── checklist.routes.js
├── controllers/
│   ├── citas.controller.js
│   ├── matchmaking.controller.js
│   └── checklist.controller.js
├── services/
│   ├── citas.service.js              # Queries/escrituras sobre `Citas` en Notion
│   ├── contactos.service.js          # Queries/escrituras sobre `Contactos` en Notion
│   ├── booking.service.js            # Orquesta la reserva (mutex + patrón de rollback)
│   ├── matchmaking.service.js        # Capa 1 (filtros duros) + Capa 2 (ranking)
│   ├── checklist.service.js          # Evaluación de completitud Sponsor/Speaker
│   └── calendar-client.service.js    # Llama por HTTP a platica-google-docs-api
└── utils/
    └── notion-client.js              # Cliente REST de Notion compartido

tests/
├── matchmaking.manual-test.js        # Corre contra datos reales con mocks inyectados
├── checklist.manual-test.js
└── mocks/                            # Mocks usados por los scripts de prueba manual
```

## Endpoints

Todos requieren header `X-API-Key` (excepto `/health`). Body en JSON, no hay `GET` con query params salvo `/checklist/consultar` (por conveniencia, ver nota abajo).

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/health` | Sin auth. Para monitoreo de Coolify. |
| POST | `/citas/reservar` | Reserva una cita 1a1 con protección de concurrencia (mutex + Notion como árbitro). |
| POST | `/matchmaking/sponsors/:sponsorId/sugerir-matches` | Corre Capa 1 + Capa 2 para un sponsor, escribe sugerencias en `Match Sugerido`. |
| GET | `/checklist/consultar?nombre=...` | Consulta bajo demanda — "cómo va fulano". |
| POST | `/checklist/revisar-pendientes` | Barrido completo, pensado para dispararse desde un Cron Job de Coolify. |

**Nota sobre `GET /checklist/consultar`:** el resto del repo de Google usa solo POST/PATCH/DELETE por convención (no por limitación técnica). Aquí se dejó como GET porque es una consulta de solo lectura y es más simple de probar/cachear — si quieres uniformidad total con el otro repo, se puede cambiar a POST sin problema.

## Variables de entorno
Ver `.env.example`. Resumen:
- `API_SECRET_KEY` — clave para llamar a ESTE servicio (propia, no la del repo de Google).
- `NOTION_API_KEY`, `NOTION_CONTACTOS_DATA_SOURCE_ID`, `NOTION_CITAS_DATA_SOURCE_ID`.
- `GOOGLE_API_BASE_URL`, `GOOGLE_API_KEY`, `GOOGLE_API_CLIENTE_ID` — para llamar HACIA `platica-google-docs-api`. `GOOGLE_API_CLIENTE_ID` requiere que la cuenta de Google de los sponsors ya esté conectada por OAuth en ese servicio (Adler lo maneja directamente, no es parte de este repo).

## Por qué un repo separado (no una app más sobre `platica-google-docs-api`)
1. **Separación de responsabilidades** — ese repo es la capa genérica de Google para todos los clientes de Plática. Las reglas de negocio de un evento específico (pesos de matchmaking, requisitos de checklist) no son su lugar natural.
2. **Concurrencia** — `booking.service.js` depende de un mutex en memoria de un solo proceso. Compartir servidor con otro servicio cuya política de réplicas no controlas directamente es un riesgo real de que la protección se rompa en silencio.
3. Nada de esto bloquea reusar el código de Calendar — se llama por HTTP (`calendar-client.service.js`), no se duplica.

## Cómo correr las pruebas manuales
No hay suite automatizada con Jest todavía — son scripts que se corren a mano y muestran resultado en consola, usando datos reales de los contactos de ejemplo en Notion con las llamadas de escritura simuladas:

```bash
node tests/matchmaking.manual-test.js
node tests/checklist.manual-test.js
```

## Pendientes conocidos (no bloquean el primer deploy, sí producción estable)
- Cron de reconciliación para citas que quedan en "Pendiente Calendar" por un crash a media ejecución.
- Confirmar con Laura: lista final de `Nivel de Patrocinio` y tabla de equivalencia de `Etapa de Negocio` ↔ `Etapa Cliente Buscada` (ver `matchmaking-spec-fdt.md`).
- ~~El shape exacto de la respuesta de `/calendar/crear-evento`~~ — **verificado el 22 de julio con una reserva real de punta a punta** (mutex → Notion → Calendar → Notion confirmado), contra el calendario "Prueba FDT" y el cliente_id `adler-calvillo`. `evento_id` sí viene donde se esperaba.
- Envío de alertas por WhatsApp (checklist y prospección) — no construido, es integración aparte.
