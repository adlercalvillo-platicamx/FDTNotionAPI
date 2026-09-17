# Bitácora 15sep — Agente 2: humanización del tono (ANTI-TELLS)
Handoff. Código gana si esto contradice algo.
Fecha del trabajo: 15 sep 2026. Sin cambios de código. Continúa [bitacora-11sep-agente2-meet-expo.md].

## Pedido y decisión

Luis: lo principal ahora es que el Agente 2 **no suene a LLM**. Igualar la
voz personal de Laura queda **después**: no ha compartido chats reales, así
que no hay material para calcar su forma de escribir.

Se revisó la skill pública [blader/humanizer](https://github.com/blader/humanizer)
como **catálogo de tells**, no como runtime. No se instaló nada en el repo ni
se cargó como knowledge en Plática: el agente ya tenía un bloque ANTI-TELLS
desde el 9-sep y lo que faltaba era concreción, no una capa nueva.

Luis aprobó el texto antes de subirlo y pidió explícitamente que **solo** se
tocaran esos dos bloques.

## Qué cambió y por qué

Solo el prompt vivo en Plática, Agente 2 `c1IYnFsr0Jzfqq4NeLAs`. Snapshot
actualizado en el mismo turno:
[prompts-agentes-platica/Prompt y detalles - Citas 1-1 - Gestión de Citas Fashion Digital Talks.md](prompts-agentes-platica/Prompt%20y%20detalles%20-%20Citas%201-1%20-%20Gesti%C3%B3n%20de%20Citas%20Fashion%20Digital%20Talks.md).

1. **ANTI-TELLS ampliado** (`pebyzJZImGQpg8lnKcFi`). Los 6 bullets originales
   eran abstractos y el modelo seguía abriendo con “Perfecto”, encadenando
   tríadas y cerrando con fórmulas de call center. Ahora la sección nombra
   además: palabras de brochure (“potencializar”, “sinergia”, “experiencia
   única”), envoltorio de chatbot (“¡Listo!”, “¡Genial!”, “Gracias por tu
   mensaje”) y cierres tipo “quedamos atentos” / “estoy para ayudarte”. Se
   agregaron tres pares **Mal / Bien** con mensajes reales del flujo (primer
   mensaje con lista, oferta de horarios, confirmación de cita) porque un
   ejemplo pega más que una prohibición.
2. **Mensaje post-confirmación de asistencia** (`0f8TKHmdsP3DW68rmezp`):
   “¡Gracias! Con esto confirmamos tu asistencia al evento.” →
   **“Listo, quedó confirmada tu asistencia.”**

No se tocaron tools, flujos de citas, reglas de page_ids, `copy_sin_mas_opciones`,
knowledge, guardrails ni asistencia humana.

Nota de consistencia: la sección NUNCA prohíbe “¡Listo!” **como mensaje de
relleno antes del contenido**. El copy nuevo dice “Listo,” pegado al hecho, no
solo. Si en pruebas se ve ambiguo, el cambio es quitar esa palabra, no
reescribir ANTI-TELLS.

## Estado del prompt

| Campo | Valor |
|---|---|
| Versión activa | `0f8TKHmdsP3DW68rmezp` (15 sep 2026, 20:37 UTC) |
| Versión previa a esta sesión | `8UbLHEVgk2r1A4R3jPqF` (15 sep, 19:09 UTC) |
| Total de versiones | 104 |

El snapshot del repo estaba **dos tandas atrás**: venía de
`pzj6kAa0zQxtsyE2loQh` (11-sep) y no incluía las 15 ediciones del 14 y 15-sep
que agregaron `opciones_adicionales`, el concepto de *pasada completa* y
`copy_sin_mas_opciones`. Esas ya quedaron reflejadas en el archivo, marcadas
como hechas fuera de esta sesión.

## Cómo operarlo

Nada que desplegar: es prompt, aplica al siguiente mensaje entrante. Sin env
nuevas, sin reinicio de Coolify.

Para revertir solo la humanización: `edit_agent_prompt` contra las dos piezas,
no `write_agent_prompt` — reescribir completo borraría las reglas de opciones
adicionales del 15-sep.

## Evidencia

- `get_agent_prompt` antes y después; ambas ediciones con `editType: exact`,
  `replacementsMade: 1`.
- `list_agent_prompt_versions`: las dos versiones nuevas a las 20:37 UTC.
- Verificación posterior: el prompt activo contiene el bloque nuevo y el copy
  corto de confirmación.

No hubo prueba conversacional real todavía.

## Pendientes

- Probar en una conversación real (o en Plática con un número de prueba) que el
  saludo, los 3 horarios y la confirmación salgan con el ritmo nuevo.
- **Voz de Laura**: sigue bloqueado por falta de muestras. 3 chats son el
  mínimo; 6–8 en situaciones distintas es lo útil. Fallback si no los da: copy
  público de FDT, 15 frases dictadas por ella, o hilos de Plática escritos a
  mano. Cuando lleguen, se sustituyen los ejemplos “Bien:” por los suyos — el
  resto del bloque no cambia.
- Revisar si el Agente 1 (Marketing) necesita el mismo tratamiento; hoy no se
  tocó.
