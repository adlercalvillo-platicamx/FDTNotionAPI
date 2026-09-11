# Bitácora 11sep — Agente 2: Meet virtual y boleto Expo
Handoff. Código gana si esto contradice algo.
Fecha del trabajo: 11 sep 2026. Continúa [bitacora-10sep-meet-virtual.md].

## Pedido y decisión

Adler: el Agente 2 debe usar `tipo_de_asistencia` de la ficha de Plática
(hidratado desde Notion). Virtual pregunta por el link de Meet; Expo no
entra a citas 1a1. El `sendUpdates: all` de Calendar (invitación con Meet
al correo ~15 min antes) se queda.

Adler agregó el caso no-show: una cita pasada sin check-in puede moverse a
un horario posterior; deben volver a aplicar los recordatorios y, si es
Virtual, debe generarse otra liga de Meet.

## Qué cambió y por qué

Prompt vivo en Plática, Agente 2 `c1IYnFsr0Jzfqq4NeLAs`. Versión activa
`IYNgn2CXcSc6HoKNsSK5` (11 sep 2026, 18:00 UTC). Snapshot:
[prompts-agentes-platica/Prompt y detalles - Citas 1-1 - Gestión de Citas Fashion Digital Talks.md](prompts-agentes-platica/Prompt%20y%20detalles%20-%20Citas%201-1%20-%20Gesti%C3%B3n%20de%20Citas%20Fashion%20Digital%20Talks.md).

- Lee `tipo_de_asistencia` antes de ofrecer citas.
- Virtual: Meet ~15 min antes por WhatsApp + invitación de Google al
  correo. No inventar URL. El .ics de confirmación no es el Meet.
- Expo: no agendar; copy de piso; escala si insiste o pide cambiar boleto.
- Presencial / VIP / Speaker: zona Citas 1a1, pasillo. Sin Meet.

No se tocaron tools, knowledge ni guardrails.

Backend:

- `modificarCita` conserva la regla: una cita pasada se mueve solo sin
  check-in. El destino ahora debe ser estrictamente futuro.
- `reprogramarCita` limpia siempre 15 min + Meet. El de 2 h solo si el
  destino queda a más de 2 horas.
- El Event ID de Meet es determinista por fila + horario. Reintentar la
  misma ocurrencia reusa sala; otra hora crea otra sala. El Apps Script
  desplegado es compatible porque sigue recibiendo una clave hex en
  `citaId`; no requiere redeploy por este cambio.
- El `.ics` de modificación conserva su UID y secuencia como antes.

## Cómo operarlo

El agente ya tiene las reglas. `MEET_VIRTUAL_HABILITADO` sigue apagado
hasta la prueba nombrada (bitácora 10-sep).

Tras desplegar el backend: el de 15 min siempre queda vacío y el cron
vuelve a tomarlo (Meet nuevo si es Virtual). El de 2 h solo se vacía
si el destino queda a más de 2 h; si ya está dentro, no se manda otra
vez el aviso “2 horas antes”.

## Evidencia

- `node tests/modificar-cancelar-cita.manual-test.js`: todos pasaron; el
  no-show reinicia recordatorios y Meet.
- `node tests/recordatorio-cita-15min.manual-test.js`: pasó.
- `node tests/recordatorio-cita-2h.manual-test.js`: pasó.
- `node tests/google-meet-virtual.manual-test.js`: Event ID por ocurrencia.
- `node tests/horarios-oferta.manual-test.js`: solo futuros.

## Pendientes

- Encender Meet en Coolify tras prueba nombrada (Luis / Adler).
- `reservar_cita` sigue sin rechazar Expo en código; el filtro está en el
  prompt y en matchmaking.
