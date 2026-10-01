# Bitácora 01oct — boleto Breakfast entra como Presencial
Handoff. Código gana si esto contradice algo.
1 de octubre de 2026. Sin commit. Continúa
[bitacora-01oct-auditoria-ticketopolis.md](bitacora-01oct-auditoria-ticketopolis.md).

## Pedido y decisión

Adler pidió que el boleto Breakfast participe en matchmaking, reservas,
página QR y Agente 2. Decisión de Adler: mismas reglas que Presencial.
No salta tamaño ni usa el multiplicador VIP.

## Qué cambió y por qué

`TIPOS_BOLETO_CON_CITAS` vive en `contactos.service.js` y lo usan el pool,
la solicitud directa y `BOLETOS_CON_CITAS` de la página QR. Breakfast
entra al pool si `Quiere Citas 1a1` es `Sí` o está vacío. `No` queda
fuera. El tamaño filtra igual que Presencial. Score ×1.15. Reunión en
sitio: el correo, el `.ics` y el Meet siguen viendo solo `Virtual`, así
que Breakfast no recibe liga.

La página QR no tiene lista propia en el frontend. Muestra el boleto y
el copy de Meet solo si es Virtual.

`tipo_de_asistencia` en Plática ya es texto y copia el boleto. No se
hidrataron los 16 contactos: el campo se llena en el próximo mensaje o
plantilla.

## Agente

Agente 2 `c1IYnFsr0Jzfqq4NeLAs`, prompt `jctpej8Vdl3bi1CpBRmC`.
Subagente de match `gZ4oJ84r1JT79zd9AEZg`, prompt `qBK4EfrITzsOU0hWk0zQ`.
Breakfast se trata como reunión en sitio. No es la sesión del jueves
8:00 (Executive Breakfast by SheCommerce).

## Cómo operarlo

No reejecutar `cargar-ticketopolis-laura-01oct.js`. No disparar
`sugerir-todos` desde esta sesión.

Tras el deploy, el cron de cada 6 h a `POST /matchmaking/sugerir-todos`
sí crea `Sugerido` para los Breakfast que pasen giro, Quiere Citas y
tamaño. La oferta de WhatsApp sigue siendo disparo humano y en
simulación.

## Evidencia

Lectura a Contactos Laura, sin PATCH: el select incluye `Breakfast` y
hay **16** contactos con ese valor.

Pruebas locales, sin filas nuevas en Citas: `mas-opciones`,
`tamano-negocio`, `multiplicador-canal`, `sesion-14ago-diffs`,
`reserva-publica`, `perfil-platica`, `google-meet-virtual`,
`agente2-piso`, `email-notificacion`, `modificar-cancelar-cita`. Un
Breakfast Mediana ve primero la Aprobado, luego la Sugerido, y en el
resto solo sponsors que piden Mediana.

## Pendientes

Ninguno de este hilo. El cron de sugerencias, cuando corra después del
deploy, va a escribir `Sugerido` para quien cumpla. No se disparó aquí.
