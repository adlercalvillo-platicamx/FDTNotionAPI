# Bitácora 17sep — correo Virtual y cierre de mensajes
Handoff. Código gana si esto contradice algo.
Fecha del trabajo: 17 sep 2026. Continúa [bitacora-15sep-agente2-humanizacion.md].

## Pedido y decisión

Luis, a partir de la reunión: separar el correo del asistente por boleto,
preservar mesa para el sponsor, usar el PDF corregido como referencia de tono,
preparar recordatorios para Lizeth y revisar las vistas del flujo manual.

Presencial sigue siendo la prioridad. El Apps Script de Meet ya existe: no se
creó un segundo correo ni un segundo cron.

## Qué cambió

### Correo del asistente Virtual

En `src/services/booking.service.js`, reserva y modificación ahora leen
`Ticket / Tipo Asistencia` del contacto:

- `Virtual`: fecha, hora, modalidad Google Meet y aviso de que la liga llega
  unos 15 minutos antes por WhatsApp + invitación de Google. Sin mesa, sede ni
  instrucción de llegar antes en el cuerpo/`DESCRIPTION`.
- Presencial, Presencial VIP, Speaker o vacío: conserva el copy físico aprobado.
- Sponsor: conserva mesa, sede y datos del asistente.
- La mesa sigue asignada en Notion para capacidad. Cancelación no cambió.

Segunda pasada del mismo día, pedida por Luis: el correo del **sponsor** de una
cita Virtual necesitaba decir las dos cosas a la vez. El sponsor sí está en
piso: toma la reunión por Meet desde su mesa. Ahora `bloqueDetallesCitaSponsor`
recibe `virtual` y, cuando aplica, inserta `💻 Modalidad: Google Meet (el
asistente se conecta en línea)` entre el horario y la mesa, y cierra el bloque
con la nota de que la invitación de Google con el link llega a ese correo ~15
min antes (el Apps Script invita los dos correos, no solo al asistente). Mesa,
sede y la línea de ubicación en piso se conservan intactas. Aplica a
confirmación y a modificación; la cancelación del sponsor no lleva mesa ni sede
y no cambió.
- `LOCATION` del `.ics` sigue en Club France por la regla vigente; solo el
  `DESCRIPTION` del asistente Virtual omite la referencia física.

### Mensajes

`para-lizeth-aprobacion-recordatorios-17sep.md` contiene propuestas, todavía no
aplicadas en Meta, para 24 h, 2 h y 15 min presencial/virtual.

Verificado contra Plática:

- `followup_72hrs` y `lastcall_cita1a1` coinciden con la segunda versión
  (amarilla/aprobada) del PDF. No se tocaron.
- La oferta inicial del backend también coincide con el PDF (20 min).
- 15 min actual tiene `Hola{{1}}` sin espacio y “minutitos”.
- 15 min Virtual tiene el mismo espacio faltante, acentos ausentes y “Por ahí
  nos vemos”, aunque el equipo no entra al Meet.
- 2 h pregunta si comparte el detalle, pero el backend no manda un segundo
  mensaje.
- 24 h (`confirmacion_cita_1_dia_antes`) tiene `{{1}}]` y pide que ya tenga la
  liga, aunque el Meet Virtual se genera 15 min antes.

El prompt vivo del Agente 2 estaba en `OxP9D658SMpptyLBaa72` (17-sep 04:01 UTC)
y ya incorporaba respuesta proporcional, menos negritas y cero preguntas en
lotes exploratorios. No se editó Plática en este trabajo: otra edición sería
redundante y el copy requiere aprobación previa.

Más tarde (versión `KP43tfwZTcU7hQczOqWs`, 18:50 UTC) Luis revisó la
conversación con 4776628968 y rechazó el formato de la lista de sponsors. Causa:
la persona escribió “Quiero otra cita” y el agente leyó el “otra” como lote
exploratorio, así que aplicó la regla de `FORMATO WHATSAPP` — líneas planas, sin
numerar, sin negrita y sin pregunta. El contacto tuvo que responder “¿Quiénes?”.
Decisión de Luis: eliminar el formato exploratorio aparte. Todos los lotes van
numerados, **sin negrita**, hasta 4, y siempre cierran con pregunta; si quedan
sponsors sin mostrar, una sola pregunta cubre ambas cosas (“¿Con quién
empezamos, o te muestro otras?”). Aplicado en Plática (`fhJczSjlkdfjki7m8HVQ`,
17-sep 21:01 UTC).

## Protocolo de marca (17-sep 21:15 UTC)

Prompt activo `7pzm3N6MIoLHpoIiYjQl`. Laura, reunión 17-sep. Luis aprobó el
delta. Tres cambios en Plática:

- `TONO`: personalidad interna (empresaria de moda / RP) y *protocolo*.
- `HUMANO`: antes del 7-oct escala en 1er–2º intento si no resuelve; el 7 y 8
  de octubre intenta agendar y, si falla en 2–3, manda al front desk de
  matchmaking.
- `NUNCA`: no interpretarse como Laura.

Asistencia humana en Plática sigue **desactivada**. El copy de pruebas no
transfiere de verdad hasta reactivarla.

## Vistas y repos externos

- `script_actualizar_recordatorio/actualizar_recordatorio.py` no usa URLs:
  cambia `Estatus Recordatorio` y devuelve variables.
- `at_lista_recordatorios_FDT/at_lista_recordatorios.py` cuenta contactos
  distintos sin confirmar y elige `lista_recordatorios_7_oct` / `_8_oct`.
- Las dos plantillas vivas apuntan todavía a la base de pruebas `9b09e870…`.
  Sus botones son estáticos de Meta; el Python no lleva el URL.
- URLs entregadas por Luis para producción (misma base Citas
  `3b162dda199a803fbd71fb15af9dc9a4`):
  - 7-oct, Sin confirmar:
    `https://app.notion.com/p/3b162dda199a803fbd71fb15af9dc9a4?v=3cf62dda199a81fe86fe000c7806a45f`
  - 8-oct, Sin confirmar:
    `https://app.notion.com/p/3b162dda199a803fbd71fb15af9dc9a4?v=3cf62dda199a81e987e0000cde9e6a1f`
- La comprobación por navegador llegó al login de Notion; se verificó la base
  productiva y que son dos view IDs distintos, pero no el título visible de
  cada vista. Luis las identificó explícitamente como Sin confirmar 7/8.
- El catálogo de Plática disponible solo permite listar/leer plantillas, no
  actualizar botones Meta. El reemplazo debe hacerse en Meta/Plática por quien
  tenga ese permiso; no se intentó automatizar por navegador.
- Las vistas Confirmadas no aparecen en esos scripts ni en las plantillas.
  Falta confirmar con Adler/Liz si son solo operativas o si Meta debe mostrar
  dos accesos.
- Riesgo encontrado en el repo externo: `.env.example` documenta
  `LIZ_TEL`/`LIZ_NOMBRE` y `DRY_RUN=1`, pero el código lee `TEL`/`NOMBRE` y solo
  simula con el string exacto `true`. No ejecutar usando ese ejemplo: podría
  intentar un envío real.

## Evidencia

Pruebas locales con mocks, sin Notion/SMTP/WhatsApp real:

- `node tests/email-notificacion.manual-test.js`: todos pasaron.
- `node tests/modificar-cancelar-cita.manual-test.js`: todos pasaron.
- `node tests/recordatorio-cita-15min.manual-test.js`: pasó.
- `node tests/google-meet-virtual.manual-test.js`: pasó.
- `node tests/recordatorio-cita-2h.manual-test.js`: pasó.

Se ejecutó `npm install` con autorización de Luis porque faltaba
`node_modules`. Reportó 6 vulnerabilidades conocidas (4 moderadas, 2 altas);
no se corrió `npm audit fix` porque sería un cambio fuera del alcance.

## Pendientes y bloqueos

- Lizeth debe aprobar los cuatro copys de
  `para-lizeth-aprobacion-recordatorios-17sep.md` antes de versionar Meta.
- Adler/Liz deben decidir si Confirmadas 7/8 van en los mensajes o son vistas
  operativas separadas. Mientras no haya decisión, conservar solo el botón
  Sin confirmar ya existente.
- Cambiar manualmente en Meta/Plática los botones de
  `lista_recordatorios_7_oct` y `_8_oct` por las URLs productivas de arriba;
  luego releer las plantillas para evidenciar status y destino.
- No se hizo prueba real: primero hay que desplegar este commit y nombrar
  destinatarios de SMTP/WhatsApp. SMTP solo con allowlist:
  `adler.calvillo@platica.mx`, `0257691@up.edu.mx`,
  `adlerero666@gmail.com`.
- La prueba con Liz pedida en reunión contradice la allowlist si su correo es
  externo. Usar contactos de prueba permitidos o ampliar la allowlist de forma
  explícita antes de reservar.
- Restaurar `MEET_VIRTUAL_HABILITADO=false` al terminar cualquier prueba real.
