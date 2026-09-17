# Propuesta para Lizeth — mensajes de recordatorio Citas 1a1

Fecha: 17 sep 2026. **Propuesta; no está aplicada en Meta.**

Fuente de tono: segunda versión (amarilla/aprobada) de
`CORRECCION DE MSJS CITAS ASISTENTES.pdf`.

## Ya aprobados y sin cambio

- Oferta inicial: `agendar_cita_inicial_aprobado_1`…`_4`.
- Follow-up 5-oct: `followup_72hrs`.
- Last call 6-oct: `lastcall_cita1a1`.

Los textos vivos de estas plantillas coinciden con la versión aprobada del PDF.

## 15 minutos — presencial

Plantilla actual: `notificacion_cita_15min_antes`.

Problemas del texto actual: falta espacio después de “Hola”, usa “minutitos” y
“Por ahí nos vemos” no dice dónde debe presentarse.

Propuesta:

> Hola, {{1}}. Tu cita con {{2}} empieza en 15 minutos.
>
> Te esperamos en el área de Citas 1a1.

Variables actuales, sin cambio:

1. Primer nombre del asistente.
2. Empresa del sponsor.

## 15 minutos — virtual

Plantilla actual: `recordatorio_15min_antes_virtual`.

Problemas del texto actual: falta espacio después de “Hola”, faltan acentos y
“Por ahí nos vemos” sugiere que el equipo entrará a la llamada.

Propuesta:

> Hola, {{1}}. Tu cita con {{2}} empieza en 15 minutos.
>
> Entra aquí: {{3}}

Variables actuales, sin cambio:

1. Primer nombre del asistente.
2. Empresa del sponsor.
3. URL de Google Meet generada por el Apps Script.

## 2 horas

Plantilla actual: `notificacion_cita_2horas_antes`.

Problema del texto actual: termina con “¿Te comparto el detalle?”, pero el
backend no manda ese detalle automáticamente en otro mensaje.

Propuesta:

> Hola, {{1}}. Te recordamos que hoy a las {{2}} tienes una cita con {{3}}.
>
> La invitación de calendario tiene los datos de la reunión.

Variables actuales, sin cambio:

1. Primer nombre del asistente.
2. Hora en formato `3:00 pm`.
3. Encargado y empresa, por ejemplo `Marco Trujillo, de Plática.mx`.

Este texto sirve para Presencial y Virtual: no menciona mesa, sede ni liga. La
liga de Meet se genera y envía 15 minutos antes.

## 24 horas

Plantilla actual identificada: `confirmacion_cita_1_dia_antes`.

Problemas del texto actual: trae un `]` sobrante después de `{{1}}` y pide
confirmar que ya tenga la liga, aunque para Virtual el Meet todavía no existe.

Propuesta:

> Hola, {{1}}. Mañana a las {{2}} tienes una cita con {{3}}.
>
> ¿Nos confirmas tu asistencia?

Variables:

1. Primer nombre del asistente.
2. Hora de la cita.
3. Encargado o empresa del sponsor.

## Aprobación solicitada

Confirmar por cada bloque:

- aprobado tal cual;
- cambio de redacción;
- conservar el texto actual.

Solo después del visto bueno se versionan las plantillas en Meta y se actualizan
los nombres en Coolify si Meta exige nombres nuevos.
