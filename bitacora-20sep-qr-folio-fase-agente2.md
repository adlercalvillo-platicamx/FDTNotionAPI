# Bitácora 20sep — QR por sponsor, folio y fase del evento
Handoff. Código gana si esto contradice algo.
Trabajo 20–21 sep 2026. Continúa
[bitacora-20sep-programa-conferencias-agente2.md](bitacora-20sep-programa-conferencias-agente2.md)
y ejecuta el plan de
[bitacora-20sep-plan-piso-agente2.md](bitacora-20sep-plan-piso-agente2.md).

## Pedido y decisiones

Adler pidió cerrar el flujo de piso del Agente 2:

- Cada QR abre WhatsApp con una empresa nombrada. El texto no tiene que
  coincidir carácter por carácter con Notion.
- Para ese par directo respetar boleto, los tres giros y tamaño asimétrico.
  Saltar `Quiere Citas 1a1=No`, área y soluciones.
- Si el WhatsApp no coincide, identificar por `Folio Reservacion` o
  `Folio Boleto` del correo que recibió el día del registro.
- Mostrar todas las citas confirmadas juntas, con día y hora.
- Frontdesk solo durante 7–8 oct; después del evento no agendar.
- El saludo con nombre va solo en el primer mensaje, no a media conversación.

## Backend

### Identificación por folio

`contactos.service.js` ahora parsea ambos campos de folio. La búsqueda:

- acepta folio de reservación o boleto;
- soporta varias claves en una celda separadas por coma;
- normaliza mayúsculas y espacios;
- post-filtra por token completo (`RES-100` no encuentra `RES-1000`);
- devuelve `FOLIO_NO_ENCONTRADO` o `FOLIO_AMBIGUO`, nunca elige entre dos.

`consultarSugeridasPorIdentificador` intenta WhatsApp y usa el folio como
fallback. Si identifica por folio, devuelve nombre, empresa, boleto y correo, e
hidrata **el número de la conversación actual** en Plática mediante
`telefonoDestino` (no el WhatsApp histórico que no coincidió).

### Empresa nombrada por QR

El mismo contrato acepta `sponsorEmpresa`. `resolverSponsorPorEmpresa` carga
sponsors activos y compara nombre normalizado (acentos, puntos, guiones y
espacios), similitud conservadora y aliases conocidos (`Meli`,
`Mercadolibre`, `TiendaNube`, `Platica`, `Flow Pagos`). Un empate devuelve
`ambiguo`; una empresa desconocida devuelve `no_encontrado`.

`sponsor_solicitado` devuelve:

- `elegible`: `sponsor_notion_id` listo para consultar disponibilidad;
- `no_elegible`: motivo explícito;
- `ambiguo`: candidatos para preguntar;
- `no_encontrado`: el agente no inventa.

Filtros directos: Expo fuera; giro obligatorio; Bronce fuera; Grande /
Consolidado entra con cualquier sponsor; Mediana/Pequeña/Micro solo si el
sponsor la pidió; VIP/Speaker saltan tamaño. `Quiere Citas=No`, área y
soluciones no bloquean este camino.

La reserva sigue pasando por `reservarCita` y su mutex. Este cambio no crea
una ruta paralela ni expone `reservar_cita` como MCP.

### Tiempo, copys y confirmadas

El payload trae `fase_evento=antes|durante|despues`, calculada en
`America/Mexico_City` con `CITAS_FECHAS_EVENTO`.
`CITAS_FASE_EVENTO_SIMULADA` existe solo para pruebas manuales y debe quedar
vacía en producción.

También viajan los copys aprobados de giro, Expo, tamaño, folio y post-evento.
No llevan `Hola`; el prompt decide el saludo únicamente en el primer mensaje.

`citas_para_ofrecer` ya no se corta en tres: trae todas las confirmadas,
ordenadas, y cada una incluye `horario_legible` con día, fecha y hora.

Contrato extendido:

`GET /citas/sugeridas?whatsapp=&folio=&sponsor_empresa=`

La tool MCP existente `consultar_sugeridas_para_asistente` recibe los mismos
campos; no se creó otra tool ni se expuso reserva.

## Notion — escritura real

Se creó en Citas de Laura el rollup `Tipo boleto (asistente)`:

`Contacto Principal → Ticket / Tipo Asistencia (show_original)`.

Quedó visible en las tarjetas de cinco boards:

- Top Aprobadas por Asistente
- Top Confirmadas por Asistente
- Top Rechazadas por Asistente
- Top Sugeridas por Asistente
- Top Sugeridas y Aprobadas por Asistente

Script:
`scripts/one-shots/tipo-boleto-vistas-top-laura-20sep.js`.
El primer PATCH de vista falló 400 por la propiedad huérfana `HXck`; no había
tocado tarjetas. Se corrigió el script para omitir IDs borrados, se ejecutó de
nuevo y la verificación posterior reportó las cinco como `ya visible`.
No reejecutar sin revisar.

## Evidencia

- Folio real de Laura probado: `1123E9` resolvió de forma única la página
  `3df62dda-199a-8122-942c-e9b7e28a05eb`.
- Teléfono sintético de Plática: `5215500002099`, cliente temporal
  `iyvIHraZPPidxYUnb3bg`.
- La prueba leyó 0 citas y creó **0 reservas**.
- La hidratación real se valida post-deploy con la tool MCP; después se borra
  el cliente temporal.

Pruebas locales:

- `tests/contactos-folio-sponsor.manual-test.js`
- `tests/agente2-piso.manual-test.js`
- `tests/mas-opciones.manual-test.js`
- `tests/perfil-platica.manual-test.js`
- `tests/mcp-modificar-cancelar.manual-test.js`
- `tests/sugeridas-whatsapp.manual-test.js`
- `tests/disponibilidad.local-smoke.js`
- `tests/email-notificacion.manual-test.js`

Todas pasan. Sin SMTP real, WhatsApp ni reservas.

## Operación pendiente en este hilo

1. Push/deploy del backend.
2. Refrescar el MCP `fdt-notion-api` en Plática para sincronizar el schema de
   `folio` y `sponsorEmpresa`.
3. Probar la tool con el cliente/folio sintético de arriba, sin llamar
   `reservar_cita`.
4. Borrar el cliente sintético de Plática.
5. Actualizar prompt vivo y snapshot completo con las reglas QR/folio/fase,
   saludo solo en primer mensaje y confirmadas completas.
