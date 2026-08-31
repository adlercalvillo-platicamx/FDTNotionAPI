# Bitácora 28-ago — primer envío real de `agendar_cita_inicial`

Handoff. Código gana si esto contradice algo. Escrito 30-ago-2026; el disparo fue el 28-ago. Continúa [`bitacora-28ago-plantilla-oferta-inicial.md`](bitacora-28ago-plantilla-oferta-inicial.md). Commit del cruce de `{{2}}`: `981ef17`. Base Coolify: `https://f8wwwgc0g88wccscww4cccco.appsplatica.site`.

Adler confirmó el 30-ago: el resultado en WhatsApp fue el esperado.

## Qué se probó

`POST /webhooks/notion/enviar-campanas-aprobadas` con header `X-Notion-Campanas-Secret` (no `X-API-Key`). El controller llama `dispararCampanasAprobadas()` **sin body**: no hay override de simulación por request. Las dos banderas salen solo de Coolify.

Cola inspeccionada en Citas FDT (`df93bc94-…`) antes de mandar nada: 13 filas `Aprobado` + `Campaña Enviada` falso, agrupadas en **4 asistentes de prueba**, ninguno con `Última Campaña Enviada`, ningún número externo:

| Asistente | WhatsApp |
|---|---|
| Luis Portugal | +52 4776628968 |
| Liz Melchor | +52 8127332061 |
| Samantha Rivas | +52 3311931454 |
| Adler Calvillo | +52 4492867741 |

No se corrió `marcar-cola-sin-enviar.js`: esa cola era justo la de prueba. Sí hace falta ese script **antes** del primer disparo con asistentes reales.

## Cómo funciona el disparo (las dos barreras)

El default del código es simulación. `modoSimulacionCampanas()` solo deja de simular si `CAMPANAS_MATCHMAKING_MODO_SIMULACION` es exactamente el string `false`. Cualquier otro valor (true, vacío, ausente) simula.

Encima hay una segunda traba: si no está simulando, exige `CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO=true`. Si alguien pone simulación en false y se le olvida el opt-in, el service truena y no llama a Plática.

```
simulación  | envío real | qué pasa
true        | false      | arma payload, no WhatsApp, no escribe Notion
true        | true       | igual: gana la simulación
false       | false      | error, no envía
false       | true       | WhatsApp real + marca Notion
```

En simulación el JSON trae `modoSimulacion: true`, `simuladosOfertaInicial` y el `payload` completo (teléfono, `templateName`, `params`). `enviadosOfertaInicial` queda en 0. Las filas no se marcan: se puede repetir sin efecto.

En envío real, por cada asistente: `Estado Envío Campaña = En curso` → `enviarPlantilla` → `Última Campaña Enviada = Oferta inicial` + `Campaña Enviada` en **todas** las filas del grupo (también las que no caben en los 4 sponsors del mensaje) + `Enviada`. Si Plática falla: `Falló`, `Campaña Enviada` sigue falso, el siguiente disparo las retoma (`esCandidataEnvioCampana` deja pasar `Falló`; bloquea `Enviada` y `En curso` reciente).

Quien ya tiene `Última Campaña Enviada` sale como `sinEnviar` / `CAMPANA_PREVIA`. Un segundo POST no reenvía.

## Orden que se usó el 28-ago

### 1. Simulación (Coolify: `MODO_SIMULACION=true`, `ENVIO_REAL=false`)

HTTP 200. `modoSimulacion: true`, `simuladosOfertaInicial: 4`, `enviadosOfertaInicial: 0`, `errores: []`. Notion intacto.

Los `{{2}}` ya venían del cruce (máx. 2 soluciones que el asistente buscaba y el sponsor ofrece, sin `Otro`):

- Luis: `*Blip* (Estrategia de marketing digital, Inteligencia artificial) · *Envia.com*`
- Liz: `*Revie* … · *Blip* … · *Flow* … · *Platica.mx* (Omnichannel)`
- Samantha: `*Infracommerce* … · *Blip* … · *Revie* … · *Platica.mx* …` (246 caracteres; el catálogo completo habría dejado el cuerpo en 1035 y Meta lo rechaza)
- Adler: `*Revie* (CRM / automatizacion, Customer experience) · *CaaS* (Customer experience, Estrategia de marketing digital) · *Blip* (Estrategia de marketing digital, Inteligencia artificial)`

Envia.com queda solo el nombre porque su `Solucion` es únicamente el comodín `Otro`.

El payload de esa corrida todavía traía `templateName: Agendar_cita_inicial` (A mayúscula). En simulación no importa: no se llama a Plática.

### 2. Primer intento real — falló por nombre de plantilla

Coolify tenía **dos** `PLATICA_TEMPLATE_OFERTA_INICIAL`. Una en minúsculas (`agendar_cita_inicial`, el nombre aprobado en Meta) y otra `Agendar_cita_inicial`. Ganó la mayúscula.

HTTP 200 a nivel webhook (el service no aborta el lote: acumula `errores`). `enviadosOfertaInicial: 0`. Los 4 contactos: `Template "Agendar_cita_inicial" not found`. Las 13 filas quedaron `Falló` / `Campaña Enviada` falso. Nadie recibió WhatsApp. Reintentable.

### 3. Segundo intento real — OK

Adler borró el duplicado, dejó `PLATICA_TEMPLATE_OFERTA_INICIAL=agendar_cita_inicial`, `MODO_SIMULACION=false`, `ENVIO_REAL=true`, redeploy.

HTTP 200, ~24 s. `modoSimulacion: false`, `enviadosOfertaInicial: 4`, `errores: []`.

Notion: 13 filas `Campaña Enviada` + `Enviada`; los 4 contactos `Última Campaña Enviada = Oferta inicial`.

WhatsApp (hilo de Adler en Plática, 28-ago 23:40 UTC): plantilla renderizada con el texto de equipo, 30 minutos, y el `{{2}}` de Revie · CaaS · Blip. Tag `campaign-api`. Ventana de 24 h abierta.

## Estado seguro en Coolify (dejarlo así)

El envío real **no es el default**. Tras la prueba hay que volver a las barreras, o el siguiente POST al webhook manda WhatsApp a quien esté `Aprobado` sin campaña y sin `Última Campaña Enviada`.

```
CAMPANAS_MATCHMAKING_MODO_SIMULACION=true
CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO=false
PLATICA_TEMPLATE_OFERTA_INICIAL=agendar_cita_inicial
```

Una sola variable de plantilla. El Value es minúsculas exactas; Meta no acepta mayúsculas en el nombre aunque la UI de Plática lo muestre capitalizado.

Para un disparo real de nuevo: las dos banderas al revés (`false` / `true`), redeploy, POST al webhook, y **inmediatamente** regresar a true / false.

## Cómo se llama

```powershell
$secret = Read-Host "NOTION_CAMPANAS_WEBHOOK_SECRET"
curl.exe -s -X POST "https://f8wwwgc0g88wccscww4cccco.appsplatica.site/webhooks/notion/enviar-campanas-aprobadas" -H "X-Notion-Campanas-Secret: $secret"
```

El secret vive en Coolify (`NOTION_CAMPANAS_WEBHOOK_SECRET`). No va en git.

## Pendiente (no era de esta prueba)

1. `marcar-cola-sin-enviar.js` con `--confirmar` en el ambiente de Laura **antes** del primer disparo a asistentes reales (limpia cola acumulada sin WhatsApp).
2. Scheduled task en Coolify: `POST /matchmaking/enviar-recordatorio-evento` diario con `X-API-Key`. No envía nada hasta 14 días antes del 7-oct (`CITAS_FECHAS_EVENTO`).
3. Probar en conversación que el Agente 2 no repite la explicación de la plantilla al recibir la respuesta.
