# Contrato — WhatsApp Flow de reserva (asistente) ↔ fdt-notion-api

**Actor:** el **asistente**. El sponsor no llena este Flow; recibe aviso 2.3 + correo/.ics.

**E / F** (abandono, cancelación posterior) son flujos WhatsApp 2.10 / 2.8–2.11, no este formulario.

## Flujo 1–8

1. El agente consulta sugeridas con el **WhatsApp de la conversación** (`consultar_sugeridas_para_asistente`, solo `Aprobado`). `GET /citas/sugeridas` existe como REST pero **no está registrado** en Plática (el único API tool es `api_reservar_cita`).
2. El asistente dice que sí → el agente envía el Flow (`PLATICA_FLOW_ID`).
3. INIT en este backend resuelve el WhatsApp → Notion y arma el dropdown **solo con filas Aprobado** (`listarSugeridasPorAsistente(..., { soloAprobado: true })`, en proceso — no llama `GET /citas/sugeridas`).
4. Elige sponsor + hora (disponibilidad rápida).
5–6. Al confirmar, el webhook **no espera** `reservar`; encola y muestra `RESULTADO_PENDIENTE`.
7. Tras 201: correo/.ics **y** WhatsApp 2.2 (asistente) / 2.3 (sponsor).
8. Error: copy B ≠ C; nunca decir que quedó si no quedó.

## INIT

Lo dispara **Meta** al abrir el Flow. Plática reenvía `whatsapp.flows.init`. Este repo no lo origina. `client` puede ir `null` → `error_message`, no inventar IDs.

## 700 ms

Si el handler tarda, Plática manda `{ "data": { "acknowledged": true } }`. `reservarCita` **nunca** corre dentro del webhook. Timeout interno ~500 ms en lecturas Notion.

## Endpoints

| Qué | Dónde |
|---|---|
| Sugeridas del asistente | MCP `consultar_sugeridas_para_asistente` (solo `Aprobado`). El dropdown del **WhatsApp Flow de reserva** usa `listarSugeridasPorAsistente` en proceso, también solo `Aprobado`. `GET /citas/sugeridas` no tiene cliente HTTP activo en Plática. |
| Disponibilidad | `GET /citas/disponibilidad?sponsor_notion_id=&fecha=` |
| Reservar | `POST /citas/reservar` (cola del Flow llama la función en proceso) |
| Data del Flow | `POST /webhooks/whatsapp-flows` — **sin** `X-API-Key`; HMAC `FLOW_WEBHOOK_SECRET` |

**Registro del webhook:** en **Plática** (no en Coolify). Coolify solo sirve `https://<host>/webhooks/whatsapp-flows`. Suscripción: evento `whatsapp.flows.exchanges`, mismo `secret`.

JSON de pantallas: [`flows/reserva-asistente.json`](flows/reserva-asistente.json). Publicar en Meta/Plática es manual.

## Pantallas

`SPONSOR` → `FECHA` → `HORARIO` → `RESUMEN` → `RESULTADO_PENDIENTE`

Payloads: `sponsor_id`, `fecha` (`YYYY-MM-DD`), `inicio` (ISO). El backend calcula `fin` (+ duración env).

## Casos

| Código | Copy al asistente |
|---|---|
| A | WhatsApp tras 201: sponsor, día, hora. No en el Flow. |
| B `SPONSOR_YA_OCUPADO` | Otro horario **o** otro sponsor |
| C `CAPACIDAD_MESAS_LLENA` | **Otra hora** (no otro sponsor) |
| D | Igual B o C |
| G | Error técnico, reintentar (mismo `request_id` si `Fallida` se reanuda) |
| H `INVALID_INPUT` | No debe verse; bug del cliente |

`request_id` = SHA-256 hex de `flowToken|sponsor_id|inicio`.

BACK refresca listas y **no** encola. Reentrega: `X-Webhook-Event-Id`.

## Handoff post-deploy

1. Redeploy Coolify.
2. Registrar webhook en Plática → URL del servicio + `whatsapp.flows.exchanges` + secret.
3. Publicar el Flow; poner `PLATICA_FLOW_ID` y plantillas 2.2/2.3.
4. Prompt del agente: tras “sí”, mandar el Flow; no llamar `reservar` desde MCP.
