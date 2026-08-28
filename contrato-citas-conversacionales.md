# Contrato — citas 1a1 100% conversacionales

**Decisión de Laura (27-ago-2026):** el asistente agenda, reagenda y cancela
hablando con el agente. No se usan botones ni WhatsApp Flows en el camino
activo.

**Opciones en el chat:** como máximo **4** sponsors a la vez (`sugeridas_para_ofrecer`)
y como máximo **3** horarios o citas a elegir. Si `hay_mas_sugeridas` /
`hay_mas` / `hay_mas_citas`, pregunta si quiere ver más. Nunca pegues
la grilla completa ni una lista larga.

## Camino de reserva

1. El agente identifica al asistente con el WhatsApp de la conversación.
2. `consultar_sugeridas_para_asistente` devuelve:
   - `sugeridas`: únicamente pares `Aprobado`;
   - `sugeridas_para_ofrecer`: las primeras 4;
   - `citasConfirmadas` / `citas_para_ofrecer`: compromisos reales.
3. Presenta como máximo 4 sponsors (nombre/empresa). Si `hay_mas_sugeridas`
   y pide más, nombra las siguientes de `sugeridas`.
4. Cuando elige uno, llama `consultar_disponibilidad_cita` con el
   `sponsorPageId` exacto y el `whatsapp` de la conversación. Si no manda
   `fecha`, mira los dos días. No ofrece un bloque donde esa persona ya
   tiene cita confirmada.
5. Ofrece **solo** `opciones_para_ofrecer` (máximo 3), **en el mismo orden**
   que llega (no reordenar cronológicamente). En el primer ofrecimiento sin
   fecha, el backend llena 3 casillas: Día 1 Mañana, Día 1 Tarde y Día 2
   (si una casilla no tiene cupo, rellena con lo más próximo que quede, sin
   repetir). Si la persona pide un día específico, vuelve a consultar con
   `fecha=YYYY-MM-DD` y se limita a ese día. Si `hay_mas` y pide otras horas,
   vuelve a llamar con `excluirInicios` = los `inicio` ya dichos. Nunca
   inventa horarios ni ofrece bloques que ya superaron el margen temporal
   permitido.
6. Antes de reservar repite sponsor, fecha y hora y pregunta explícitamente
   si confirma.
7. Solo ante un sí inequívoco llama la API tool `reservar_cita`.
8. `reservar_cita` vuelve a validar dentro del mutex (sponsor, mesas y
   que el asistente no choque). La foto de disponibilidad no garantiza el
   bloque.

## Parámetros de `reservar_cita`

- `sponsor_notion_id`: copiar de la sugerencia elegida.
- `asistente_notion_id`: copiar del resultado de la consulta por WhatsApp.
- `inicio` / `fin`: copiar del mismo bloque de `opciones_para_ofrecer`.
- `request_id`: estable para el mismo intento:
  `wa:<telefono>:<sponsor_notion_id>:<inicio>`.
- `asistentes_email`: `[]` si no hay correos adicionales.
- `sponsor_calendario_id`, `zona_horaria`, `titulo` y `descripcion` no son
  necesarios. Google Calendar propio se retiró.

No reconstruir UUIDs, no calcular `fin`, no transformar un horario visible de
vuelta a ISO: copiar los campos exactos de las tools.

## Después de reservar

- `Confirmada`: decir que la cita quedó y que llegará el correo con `.ics`.
- `Confirmada sin notificar`: la cita sí quedó; informar que el correo está
  pendiente.
- `SPONSOR_YA_OCUPADO` / `ASISTENTE_YA_OCUPADO` / `CAPACIDAD_MESAS_LLENA`: no insistir con el mismo
  bloque; refrescar disponibilidad y ofrecer otras 3.
- Cualquier respuesta ambigua o error técnico: no afirmar que quedó.

## Reagendar (`modificar_cita`)

1. `consultar_sugeridas_para_asistente` y mirar `citasConfirmadas`.
2. Si hay varias, ofrece máximo 3 (`citas_para_ofrecer`) y pregunta cuál.
   Si `VARIAS_CITAS_ACTIVAS`, misma regla: no elijas tú.
3. Con el `sponsor_notion_id` de esa cita, `consultar_disponibilidad_cita`
   y ofrece 3 horarios nuevos (mismo tope; `excluirInicios` si pide más).
4. Repite sponsor y horario nuevo; pide confirmación explícita de **mover
   esa cita a esa hora**.
5. Solo entonces `modificar_cita` con `citaId` (o teléfono +
   `sponsorEmpresa`) y `nuevaFechaHora` = el `inicio` ISO de la opción.
6. Si el correo falla: `exito_parcial` — el horario nuevo sí quedó; no
   digas que el aviso ya salió.

No hay ventana mínima de anticipación sobre la cita original. El destino no
puede estar más de 5 minutos en el pasado. Una cita original ya pasada solo
se mueve si `Check-in Realizado` es falso.

## Cancelar (`cancelar_cita`)

1. Identifica la cita igual que al reagendar (máximo 3 en el chat).
2. Repite con quién y a qué hora; pide un sí claro de **cancelar esa cita**.
3. Solo entonces `cancelar_cita`.
4. Si el correo falla: la cita **sigue cancelada**; avisa que el `.ics` de
   baja quedó pendiente. Nunca la trates como confirmada de nuevo.

Frases como “ya no va a poder” o “se le complicó” no bastan: confirma la
acción.

## Recordatorio de asistencia (campaña)

Si el mensaje viene de un recordatorio con Confirmar / Reagendar / Cancelar:

- **Confirmar asistencia** no reserva ni mueve la cita: solo registra que
  va a llegar. No prometas recordatorios de 2 h / 15 min si no hay tool.
- **Reagendar** y **Cancelar** siguen los caminos de arriba, no se escalan
  a humano por default.

## Componentes retirados del camino activo

- `send_message` interactivo tipo `flow`;
- Flow `1326390853881897`;
- `POST /webhooks/whatsapp-flows`;
- `flows/reserva-asistente.json`.

Pueden permanecer desplegados temporalmente por rollback, pero el Agente 2 no
debe tener `send_message` conectado ni instrucciones para abrir el Flow.
