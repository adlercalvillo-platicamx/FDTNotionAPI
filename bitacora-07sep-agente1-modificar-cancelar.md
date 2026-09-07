# Bitácora 07sep — Agente 1: modificar y cancelar cita

Handoff. Código gana si esto contradice algo.
7 sep 2026. Continúa [bitacora-07sep-reagendar-canceladas.md].

## Pedido

Adler: el Agente 1 (Laura/Liz) debe poder reservar con o sin sugerencia, reagendar una cancelada, y también modificar o cancelar. Si no tenía las tools, agregarlas.

## Qué había

El subagente `gZ4oJ84r1JT79zd9AEZg` ya podía: `buscar_contacto`, `reservar_cita` (con o sin fila `Sugerido`/`Aprobado`), `consultar_sugeridas_para_asistente` (incluye canceladas), `consultar_disponibilidad_cita`, reagendar cancelada con `cita_origen_cancelada_id`. **No** tenía `modificar_cita` ni `cancelar_cita` conectadas (sí existían en el catálogo MCP y las usa el Agente 2).

## Qué cambió

- Conectadas al subagente, activas: `mcp_modificar_cita_xhbrbu` (`jvnJKob8NqnqsUZyq7aY`) y `mcp_cancelar_cita_xhbrbu` (`lpaORidaKLJ7fc7FqgMR`).
- Prompt subagente activo `eeiaqnPI3jeku3p2tLQP`: flujos de mover y cancelar, misma regla de confirmación explícita.
- Orquestador `iCcgnFhYPUyg5ReD7prB` activo `6FyK4SpsZtTnYUOLfwwr`: enruta mover/cancelar al subagente de Citas.
- Snapshots en `prompts-agentes-platica/`.

No se tocó código de backend. Laura/Liz identifican con `citaId` (sin teléfono). El asistente del evento sigue yendo por el Agente 2.

## Pendientes

Probar en un chat de equipo (números de prueba): reservar sin sugerencia, con sugerencia, reagendar cancelada, mover confirmada, cancelar confirmada.

## Reporte nominal de campañas (mismo hilo)

Pedido adicional de Adler: después de `disparar_campanas_aprobadas`, no
informar solo cuántas salieron. El backend ahora agrega en cada detalle
enviado o simulado:

- `destinatario.nombre`
- `destinatario.empresa`
- `sugerenciasInformadas`: texto exacto de `{{2}}`, después de los recortes por
  el límite de Meta. Así no se reporta por error un sponsor que haya quedado
  fuera del mensaje final por longitud.

El prompt vivo del subagente (`uvWydll40ERU5Dx22jVV`) exige mostrar esos datos
y separar simulados/enviados, omitidos y errores. No se disparó ninguna
campaña durante el cambio.
