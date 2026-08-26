# Bitácora — rediseño de plantillas de Laura (26-ago-2026)

## Resultado

El ejecutor de campañas conserva sus entradas webhook/MCP, pero ahora solo prepara una
`Oferta inicial`. Por asistente:

- bloquea el envío si `Última Campaña Enviada` ya tiene valor;
- ordena las filas `Aprobado` por score y ofrece hasta cuatro sponsors distintos;
- hidrata `Empresa || Nombre` y `Solucion`;
- calcula una sola foto paginada de citas confirmadas por disparo;
- selecciona hasta tres bloques disponibles para todos los sponsors, respetando 11 mesas;
- no envía ni marca si no existe un horario común;
- después de éxito marca todo el grupo, incluidas las filas omitidas del top 4, para evitar
  un segundo mensaje automático.

El payload de Plática tiene cinco strings estables: nombre, lista de sponsors/soluciones y
tres horarios. Las posiciones de horarios inexistentes se mandan vacías.

## Decisiones conservadas

- Simulación sigue siendo el default y no escribe Notion ni llama a Plática.
- Envío real conserva el doble candado de ambiente.
- Send-state permanece `En curso → Enviada/Falló`.
- La persistencia Notion posterior a un WhatsApp exitoso conserva 3 intentos con backoff
  de 300 y 600 ms.
- `soloMarcar` sigue procesando toda la cola sin WhatsApp y sin exigir horarios.
- Los valores A/B/C1/C2 y `Reactivaciones Enviadas` permanecen en Notion como historia,
  pero el flujo activo no los consulta, selecciona ni incrementa. El código histórico quedó
  aislado en `campanas-matchmaking.legacy.js`, sin imports de producción.

## Horarios

El corte Mañana/Tarde se configura con `CITAS_CORTE_MANANA_TARDE=14:00`. Se lee la hora
directamente del ISO local para no desplazarla por la zona horaria del servidor. La fecha
legible también preserva el día local.

El copy de referencia menciona citas de 20 minutos, pero no se cambió booking: la grilla
operativa continúa en `CITAS_DURACION_BLOQUE_MINUTOS` y actualmente es de 30 minutos.

## Fuera de alcance

No se implementó el recordatorio del evento: no hay endpoint, cron, clasificación,
variables nuevas ni propiedad `Recordatorio Evento Enviado`. Falta definir una señal
conversacional confiable de interacción.

## Verificación local

- `node tests/campanas-matchmaking.manual-test.js`
- `node tests/horarios-oferta.manual-test.js`
- `node tests/marcar-cola-sin-enviar.manual-test.js`
- smoke/regresiones relacionadas descritas en el cierre de esta bitácora

Las pruebas usan mocks o lógica local. En esta implementación no se tocó el workspace de
producción de Laura, no se hicieron escrituras reales en Notion y no se enviaron WhatsApps
reales.
