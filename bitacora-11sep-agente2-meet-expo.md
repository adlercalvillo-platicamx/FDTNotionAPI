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
  check-in. El destino sigue con el margen de
  `CITAS_MARGEN_MODIFICACION_MINUTOS` (5 min) — ver corrección abajo.
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

Todo lo anterior es con mocks. No se hizo un reagendamiento real.

### Post-redeploy (11-sep, commit `920f8d0`)

- Schema de Citas en Laura (`3b162dda`), lectura REST: existen los 10
  campos que ahora escribe `reprogramarCita` (`Estado/Fecha/Notas
  Recordatorio 15min` y `2h`, `Google Meet Event ID` / `URL` / `Intentos` /
  `Notas`). Un PATCH con un nombre inexistente sería 400, así que se
  verificó antes de mover nada.
- `GET /health` 200 en `f8wwwgc0g88wccscww4cccco.appsplatica.site`.
- Probe de solo lectura: `POST /citas/modificar-cita` con destino
  `2026-09-10T10:00` → **400 `HORARIO_EN_PASADO`** con el texto nuevo
  ("ya empezó o quedó en el pasado"). El rechazo ocurre antes de Notion,
  así que no escribió nada. El build viejo habría respondido "ya pasó
  hace N minutos".

## Pendientes

- Prueba real del no-show (mover una cita pasada sin check-in y ver los
  campos en Notion + los dos crons). Requiere ok de Adler y destinatarios
  SMTP en allowlist: `modificar_cita` manda correo a sponsor y asistente.
- Encender Meet en Coolify tras prueba nombrada (Luis / Adler).
- `reservar_cita` sigue sin rechazar Expo en código; el filtro está en el
  prompt y en matchmaking.

## Corrección 11-sep — un solo umbral de 5 min

Adler: ofrecer, reservar y modificar tienen que validar lo mismo, con los
5 minutos de gracia. `reservar_cita` no lo hacía; tras `920f8d0` la
disponibilidad quedó más estricta que la escritura.

Ahora `CITAS_MARGEN_MODIFICACION_MINUTOS` (default 5) es el umbral único:

| Camino | Qué pasa si el bloque ya empezó hace más de 5 min |
|---|---|
| REST `GET /citas/disponibilidad`, Flow, oferta inicial | `disponible: false`, `motivo: HORARIO_EN_PASADO` |
| MCP `consultar_disponibilidad_cita` / casillas | no se ofrece |
| `POST /citas/reservar` | 400 `HORARIO_EN_PASADO` (salvo reintento idempotente de una Confirmada) |
| `POST /citas/modificar-cita` | 400 `HORARIO_EN_PASADO` |

A las 11:04 las 11:00 siguen válidas; a las 11:06 no.

Agente 2 en vivo: prompt `MFoUs9YwNTf1ez1LJQtX`. Si preguntan por una hora
que ya pasó, dice que esa hora ya no está y ofrece las de la tool. No
explica los 5 minutos. Si `HORARIO_EN_PASADO`, vuelve a consultar.

Evidencia (mocks): `node tests/horarios-oferta.manual-test.js`,
`node tests/asignacion-mesa.manual-test.js`,
`node tests/modificar-cancelar-cita.manual-test.js`.
