# Bitácora 05nov — diseño de sincronización, sin código
Handoff. Código gana si esto contradice algo.
Fecha: 5 nov 2026. Sin implementación. Continúa [bitacora-05nov-enojo-asesor.md](bitacora-05nov-enojo-asesor.md).

## Pedido y decisión
Adler pidió cerrar el diseño antes de construir. La baja entra ya, en los dos sentidos. El espejo de todos los campos no se construye: es frágil y no hace falta. Lo que sí vale es la baja, las etiquetas y el alta de filas nuevas con reglas. Nada de esto está en código.

## Qué quedó decidido
- La llave es el teléfono.
- Notion marca `Dado de Baja` → bloquear en Plática. Plática bloquea → marcar la baja. Desbloquear o desmarcar también se refleja.
- Si está bloqueado o dado de baja, no se le manda WhatsApp: ni campaña, ni recordatorio, ni mensaje del agente. El correo de la cita sí sale. Decisión de Adler, 5 nov.
- Quien escribe por WhatsApp y no está en Notion no se crea allá.
- Una fila nueva, asistente o sponsor, sube a Plática solo si ya tiene nombre y WhatsApp, y nunca si `Teléfono válido` es `no`.
- Lo que ya falló por teléfono no se reintenta. Hace falta seguimiento en la misma fila: `Estado Sync Plática`, intentos, fecha y notas. `Duplicado`, `Teléfono inválido` y `Omitido` no se vuelven a intentar solos.
- Si el número se repite, manda el formato más nuevo (2027 cuando exista, si no 2026, si no Histórico). Luego quien tiene nombre y correo. Luego la fila más vieja. La opción 2027 no se agrega ahora.
- `Etiquetas` en Notion sería multi_select, para ver las de Plática. La API de Plática agrega etiquetas y no las quita, así que una etiqueta solo se puede quitar desde Plática.
- `Motivo Baja` no existe en Contactos, aunque el código lo lee. Si se crea, las opciones son cortas: No recibir mensajes, Contacto equivocado, Moderación, Manual. No el texto del mensaje.
- Los campos no se llaman igual. El par está abajo. Los selects de matchmaking solo viajan de Notion a Plática.

## Par de campos
| Notion | Plática | Dirección |
|---|---|---|
| Dado de Baja | `status` blocked / active | Las dos |
| Motivo Baja (no existe) | motivo del bloqueo o la etiqueta | Plática → Notion |
| Etiquetas (no existe) | etiquetas del contacto | Plática → Notion. Al revés solo agrega |
| Nombre | `name`, `firstname`, `lastname` | Notion → Plática. Al revés solo si lo editó una persona |
| Email, Empresa, Ciudad, Estado, País | `email`, `company`, `city`, `state`, `country` | Las dos |
| Rol / Puesto | `role_puesto` | Las dos |
| Area | `area` | Notion → Plática. Al revés solo si es una opción válida |
| Giro / Industria | `giro_industria` | Notion → Plática |
| Ticket / Tipo Asistencia | `tipo_de_asistencia` | Notion → Plática |
| Tamaño de Negocio | `tamano_de_negocio` | Notion → Plática |
| Categoria | `tipo_de_contacto` | Notion → Plática |
| Formato Registro | `formato_de_registro` | Notion → Plática |
| Tipo de usuario (histórico) | `tipo_de_usuario` | Notion → Plática |
| Eventos | `eventos` | Notion → Plática |
| Temas | `temas` | Notion → Plática |
| Página web, sitio o redes | `web_o_facebook` | Solo si el otro lado está vacío |
| LinkedIn/Instagram y Web / Redes | `redes_sociales` | Notion → Plática |
| Soluciones Buscadas | `soluciones_buscadas` | Notion → Plática, solo si allá está vacío |
| Citas del asistente | `citas_confirmadas_del_asistente`, `numero_de_citas_confirmadas` | Notion → Plática. No en sponsors |
| WhatsApp | teléfono del cliente | No se copia: es la llave |
| Teléfono válido | (no hay campo) | `no` no se crea en Plática |

## Cómo detectar cambios
El webhook de la integración de Notion sí entra en el plan gratis. Lo prende quien administra la integración `FDT2026`, en la pestaña Webhooks. El botón "enviar webhook" de una automatización de la base es de plan de pago.

Si esa pestaña no está a la mano, el respaldo es revisar cada 10 minutos qué filas se editaron. También funciona en gratis. Es un cron y no se prende sin ok.

De Plática a Notion no hace falta nada de eso: se agregan eventos al webhook que ya está. En la interfaz sigue "FDT respuestas oferta inicial" (`message.created`, ruta `/webhooks/platica/mensajes`). El conector de la API no lo lista. No se borró.

## Costo
No pide otra aplicación ni otra réplica. Vive en el backend que ya corre. Notion no cobra la consulta. Actualizar un cliente en Plática no gasta mensajes de WhatsApp.

## FAQ
No se construye un cron. Laura edita el artículo de Conocimientos en Marketing y, cuando avise, ese texto se copia a Citas. Los dos PDF siguen activos hasta revisarlos. La tabla de Notion queda para cuando las preguntas cambien seguido; hoy no está en su workspace.

## Ruta de verificación (5 nov, tarde)
Adler pidió solo la ruta para que mañana Laura cree la suscripción y no tenga que volver. No hay sincronización.

`POST /webhooks/notion` guarda el `verification_token` en memoria y responde 200 a cualquier otro evento sin procesarlo. `GET /webhooks/notion/verificacion` con `X-API-Key` lo devuelve para pegarlo en Notion en la misma llamada. Un reinicio lo olvida; Notion puede reenviarlo.

`node tests/notion-webhook.manual-test.js` OK. Falta desplegar este código en Coolify. Sin ese deploy, la dirección de mañana sigue sin existir en producción.

Los clics siguen en [guia-webhooks-notion-laura.md](guia-webhooks-notion-laura.md).

## Pendiente
Su ficha de Plática no se corrigió: en Notion no hay una fila "Adler Calvillo" y la búsqueda de clientes no filtró por nombre. No se tocó otra ficha.
