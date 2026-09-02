# Bitácora 02sep — page_id de sponsor inexistente: 404 controlado en disponibilidad y reserva

Handoff. Código gana si esto contradice algo.
Trabajo del 2 de septiembre de 2026. Sin commit al cierre (cambios en working tree).
Continúa [bitacora-01sep-vip-tamano-ticketTipo.md].

## Pedido y decisión

Luis Portugal no podía reservar con Reversso: `POST /citas/reservar` devolvía 500 y en logs
`Could not find page with ID: 3b790fe2-7345-81b0-8fac-ea58d57ef6fe`. Adler pidió causa y arreglo.
Decisión (Adler, 2-sep): arreglar el backend para que el id malo se detecte y se nombre,
y aparte proponer el cambio de prompt del Agente 2.

## Causa

El `sponsor_notion_id` no salió del backend: el Agente 2 lo **armó**, pegando el prefijo que
comparten todos los sponsors del Notion de pruebas (`3b790fe2-7345-81…`) a la cola del
`cita_page_id` de la fila sugerida.

| Dato | Valor |
|---|---|
| `cita_page_id` de la sugerencia (Reversso × Luis) | `3ca90fe2-7345-81b0-8fac-ea58d57ef6fe` |
| `sponsor_notion_id` real de Reversso | `3b790fe2-7345-8145-95ef-e7aac48114f3` |
| Lo que llegó a `/citas/reservar` | `3b790fe2-7345-81b0-8fac-ea58d57ef6fe` |

`consultarSugeridasPorIdentificador` devuelve el id correcto (verificado contra el Notion de
pruebas ese mismo día), y la variable `sponsor_notion_id` de la API tool `api_reservar_cita`
(`DHNtYd1XvPA8IWaKBQxU`) es `mode: ai`, así que el valor lo escribe el modelo.

Lo que lo volvió invisible: `obtenerDisponibilidadSponsor` nunca comprobaba que el sponsor
existiera. Solo compara ids contra las citas confirmadas del día, así que un id inexistente
"no está ocupado" y contestaba **17 de 17 bloques libres**. El agente ofreció esos horarios en
WhatsApp y el 404 de Notion recién saltó al escribir la relación en `crearCitaPendiente`,
como un 500 genérico que no decía cuál de los dos ids estaba mal. Por eso el agente reintentó
con el mismo valor.

## Qué cambió

- `citas.service.js`: `requireSponsorExistente(sponsorPageId)` — nuevo, exportado. Corre dentro
  de `obtenerDisponibilidadSponsor`, después de validar fecha y horario. 404 `SPONSOR_NO_ENCONTRADO`
  si el page_id no existe; 400 `SPONSOR_CATEGORIA_INVALIDA` si existe pero no es `Categoria=Sponsor`.
  El mensaje le dice al agente de dónde copiar el id.
- `booking.service.js`: `errorDeContactoInexistente()` traduce el 404 de Notion al crear la fila
  en `SPONSOR_NO_ENCONTRADO` / `ASISTENTE_NO_ENCONTRADO`, nombrando el campo culpable. Solo actúa
  si el mensaje de Notion menciona uno de los dos ids; cualquier otro 404 sigue su camino tal cual.
  **No** hay pre-validación con GET antes del mutex: eso rompería el caso "falla la resolución de
  contactos → la fila queda Fallida" (`tests/email-notificacion.manual-test.js`) y cobraría dos
  llamadas a Notion en cada reserva.
- `citas.controller.js`: `SPONSOR_NO_ENCONTRADO` → 404 y `SPONSOR_CATEGORIA_INVALIDA` → 400 en el
  mapa de códigos de negocio; `GET /citas/disponibilidad` ya no manda un 404 al 500 genérico.

Costo: `consultar_disponibilidad_cita` sin `fecha` mira los dos días, así que hace 1 GET de
contacto por día consultado. Se aceptó a cambio de no ofrecer horarios de un sponsor fantasma.

## Evidencia (Notion de pruebas)

| Caso | Antes | Ahora |
|---|---|---|
| Disponibilidad con el id inventado | 17/17 bloques libres | 404 `SPONSOR_NO_ENCONTRADO` |
| Disponibilidad con Reversso real | 17/17 libres | 17/17 libres (sin cambio) |
| Disponibilidad con el page_id de Luis (asistente) | bloques como si fuera sponsor | 400 `SPONSOR_CATEGORIA_INVALIDA` |
| `reservarCita` con el id inventado | 500 opaco | `BookingError SPONSOR_NO_ENCONTRADO`, sin fila creada |

Tests manuales en verde, sin cambios en los baselines: `disponibilidad.local-smoke`,
`email-notificacion`, `asignacion-mesa`, `mcp-modificar-cancelar`, `modificar-cancelar-cita`.

## Plática (aplicado el mismo día, con ok de Adler)

- Agente 2 `c1IYnFsr0Jzfqq4NeLAs`, prompt activo **`lJ3mAkEE18hRz7mHxysr`** (2-sep 20:59 UTC).
  Tres ediciones: page_ids opacos que se copian carácter por carácter, bullet de
  `SPONSOR_NO_ENCONTRADO` / `ASISTENTE_NO_ENCONTRADO` en `reservar_cita`, y qué hacer si
  disponibilidad contesta `SPONSOR_NO_ENCONTRADO`. Snapshot al día en
  `prompts-agentes-platica/Prompt y detalles - Citas 1-1 - Gestión de Citas Fashion Digital Talks.md`
  (traía el estado del 28-ago; también quedaron registrados los cambios de recordatorios del 31-ago al 2-sep).
- API tool `api_reservar_cita` (`DHNtYd1XvPA8IWaKBQxU`, versión 5): la **descripción de la
  herramienta** ahora dice que `sponsor_notion_id` no se deriva del `cita_page_id`.

## Pendientes

- Descripciones **por variable** de `api_reservar_cita`: no se tocaron. `update_api_tool` reemplaza
  el arreglo completo de `variables` y el MCP devuelve los `constantValue` como `[REDACTED]`, así que
  reescribirlas dejaría en blanco las 5 constantes (`sponsor_calendario_id`, `titulo`, `descripcion`,
  `zona_horaria`, `asistentes_email`). Hacerlo desde la UI de Plática o pasando esos valores a mano.
- Probar de punta a punta con Luis Portugal × Reversso en pruebas después del deploy.
- Rotar la `X-API-Key` de pruebas que quedó expuesta en el chat del 2-sep.
