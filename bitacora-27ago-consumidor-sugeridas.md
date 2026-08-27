# Bitácora 27-ago — Quién consume `GET /citas/sugeridas`

Sigue de `bitacora-27ago-mcp-modificar-cancelar.md` y del filtro MCP
solo-`Aprobado`. Había que confirmar el consumidor real del REST antes de
cambiarlo.

**“Flow” aquí = WhatsApp Flow de reserva del asistente**
(`POST /webhooks/whatsapp-flows`, `flow-reserva.service.js`). **No** es
el sponsor Flow (Javier Huerta / Flow Pagos).

## Hallazgo

**Nadie llama `GET /citas/sugeridas` por HTTP hoy.**

| Candidato | Qué hace de verdad |
|---|---|
| WhatsApp Flow de reserva (`POST /webhooks/whatsapp-flows`) | **No pega esa ruta.** El INIT arma el dropdown con `listarSugeridasPorAsistente` **en el mismo proceso** (`flow-reserva.service.js`). |
| Agente de Carlos / Laura | Usa MCP `consultar_sugeridas_para_asistente` (`faEGlRzfgrD0s2bBcuLL`). |
| Catálogo de API REST en Plática (workspace Fashion Digital Talks, 27-ago) | Una sola tool: `api_reservar_cita` (`POST /citas/reservar`). **No hay** tool apuntando a `/citas/sugeridas`. |

El contrato `contrato-whatsapp-flow-citas.md` listaba GET y MCP como
equivalentes para el paso 1 del agente. Eso era documentación, no un
caller real.

## Decisión

- **`GET /citas/sugeridas`:** se deja igual (Sugerido + Aprobado +
  `citasConfirmadas`). Redundancia intencional / endpoint huérfano, mismo
  criterio que mantener REST y MCP en paralelo. Si algún día se registra
  como API tool cara al asistente, hay que pasarle `soloAprobado: true`.
- **WhatsApp Flow de reserva:** sí es cara al asistente. Adler: si ese
  formulario lo usa, filtrar. Se le pasó `{ soloAprobado: true }` a las
  tres llamadas de `listarSugeridasPorAsistente` (INIT/dropdown, resumen,
  confirmar). No se tocó `citasConfirmadas` (el formulario no las usa).
  No tiene nada que ver con el contacto sponsor “Flow”.

## Tests

```
node tests/flow-reserva.manual-test.js
node tests/sugeridas-empresas.manual-test.js
```

El INIT del WhatsApp Flow afirma `soloAprobado: true`. El GET default del
service sigue pidiendo Sugerido+Aprobado.
