# Bitácora 02-sep — oferta inicial: primer nombre en `{{1}}`, viñetas en `{{2}}`

Handoff. Código gana si esto contradice algo.
Trabajo del 2-sep-2026. Continúa [bitacora-28ago-plantilla-oferta-inicial.md](bitacora-28ago-plantilla-oferta-inicial.md).

Pedido de Adler: el saludo llegaba con nombre completo y en mayúsculas ("Hola ANA MARIA PEREZ LOPEZ") porque Ticketópolis vuelca así el campo `Nombre` al actualizar Notion. Decisión: mandar **solo el primer nombre**, en capitalización normal.

## Qué cambió

`src/services/campanas-matchmaking.service.js`:

- `primerNombreParaSaludo()` nueva (exportada). Sanea con `limpiarParametroPlantilla`, toma **el primer token** y lo pasa a minúsculas dejando la inicial en mayúscula. Respeta guion y apóstrofo (`ANA-MARÍA` → `Ana-María`) y los acentos (`JOSÉ` → `José`).
- `payloadPara()` la usa para `{{1}}`; si no queda nada usable sigue el genérico `Asistente`.
- `payloadRecordatorio()` también la usa. Antes mandaba `contacto.nombre` **crudo**, sin siquiera sanear saltos de línea: eso habría sido un rechazo de Meta el día que se active `PLATICA_TEMPLATE_RECORDATORIO_EVENTO` (esa plantilla todavía no existe).

No se intenta adivinar nombres compuestos: "ANA MARIA" saluda "Ana". Adivinar (lista de "maría/josé/juan…") se descartó porque falla en ambos sentidos y el costo de equivocarse es un saludo raro en un envío masivo.

Contrato de la plantilla actualizado en `README.md` y `AGENTS.md`. **No requiere recrear ni reaprobar `agendar_cita_inicial` en Meta**: cambia el valor de la variable, no el cuerpo.

## Evidencia

`node tests/campanas-matchmaking.manual-test.js` → 12 casos, todos pasan.

- `casoSaludoSoloPrimerNombre` nuevo: `ANA MARIA PEREZ LOPEZ` → `Ana`, `JOSÉ  DE LA CRUZ` → `José`, `  adler  ` → `Adler`, `ANA-MARÍA SOTO` → `Ana-María`, nombre en blanco → `Asistente`.
- `casoParametroSaneadoParaWhatsApp` ajustado: `Ana\nMaría` ahora espera `Ana` (antes `Ana María`). Es el cambio pedido, no regresión.

## Viñetas con saltos de línea en `{{2}}` — no se puede hoy

Adler preguntó si los sponsors pueden ir como bullets en renglones separados. **Meta rechaza el envío** (no la aprobación) si el valor de una variable trae `\n`, `\t` o más de 4 espacios seguidos: `(#100) Invalid parameter`, `Param text cannot have new-line/tab characters or more than 4 consecutive spaces`. Es la misma restricción que obligó al renglón único el 28-ago; sigue vigente (verificado 2-sep).

Salidas posibles:

1. **Viñetas en línea** — `• *Blip* (Omnichannel) • *Flow* (Pagos)` en el mismo renglón. Sin tocar Meta, sin reaprobación. **Elegida por Adler y ya aplicada** (ver abajo).
2. **Un renglón por sponsor** — exige un cuerpo nuevo con `{{2}}`…`{{5}}`, cada uno en su línea con la viñeta **en el texto fijo** de la plantilla. Como Meta no acepta parámetros vacíos y casi nadie tiene exactamente 4 sponsors, salen 4 plantillas (1, 2, 3 y 4 sponsors) que el código elige por conteo. 4 aprobaciones y `PLATICA_TEMPLATE_OFERTA_INICIAL` pasaría a ser un juego de envs.
3. **`\r` en vez de `\n`** — **probado y descartado** (ver abajo).

## Prueba real del `\r` (2-sep, 15:20 UTC)

Dos envíos de `agendar_cita_inicial` **solo** a Adler (+52 449 286 7741), canal `wb-1167456423128610` (agente default `c1IYnFsr0Jzfqq4NeLAs`), directo por MCP de Plática: **no** pasó por `/webhooks/notion/enviar-campanas-aprobadas`, no se tocaron las banderas de Coolify y ninguna fila de Notion cambió de estado. `{{1}}` = `Adler` en los dos (primera vez que el saludo nuevo se ve en vivo; el 28-ago decía "Hola Adler Calvillo").

| # | `messageId` | `{{2}}` | Resultado |
|---|---|---|---|
| 1 | `kJiXMaA4006s3aKMxpQ7` | 3 viñetas separadas por `\r` | Aceptado (`sent`), pero **se perdió contenido**: en el historial de la conversación solo quedó `• *Revie* (…)`; CaaS y Blip desaparecieron |
| 2 | `s9WvDNC0RrP7WYONRGSh` | 3 viñetas en un solo renglón, separadas por ` ` | Aceptado y **completo**, las 3 empresas |

`\r` pasa el filtro de Meta pero no produce salto de línea: es un retorno de carro, así que lo que sigue se pisa o se corta. Un asistente con 4 sponsors habría recibido uno. **No se usa.**

## `{{2}}` con viñetas en línea (aplicado)

Adler eligió la opción 1 después de ver los dos mensajes en su teléfono.

- `SEPARADOR_SUGERENCIAS` pasa de ` · ` a ` • ` y `textoSugerencias()` prefija la viñeta del primer sponsor, así que **todos** la llevan. Antes: `*Blip* (…) · *Flow* (…)`. Ahora: `• *Blip* (…) • *Flow* (…)`.
- Costo en caracteres: +2 sobre el formato anterior (la viñeta inicial). El resguardo de 400 caracteres y el recorte a 1 solución por sponsor no cambian, así que el margen contra el tope de 1024 de Meta sigue igual.
- Tampoco requiere reaprobar la plantilla: el cuerpo fijo no se toca.

`casoTopCuatroYParamsEstables` ahora exige que `{{2}}` empiece con `• ` y traiga exactamente una viñeta por sponsor; los dos casos con texto exacto (`casoParametroSaneadoParaWhatsApp`, `casoSolucionesCruzadasConLoQueBusca`) se actualizaron al formato nuevo. 12 casos, todos pasan.

## Pendientes

- Si más adelante se quiere un renglón por sponsor de verdad: opción 2 (4 plantillas con la viñeta en el cuerpo fijo y `PLATICA_TEMPLATE_OFERTA_INICIAL` convertido en juego de envs). Opción 3 (`\r`) queda cerrada por la prueba de arriba.
- Sigue abierto de la bitácora del 28-ago: `marcar-cola-sin-enviar.js` antes del primer disparo a asistentes reales, y verificar en conversación que el Agente 2 no repite la explicación al recibir la respuesta.
