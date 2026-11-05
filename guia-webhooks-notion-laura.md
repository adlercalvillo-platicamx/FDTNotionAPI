# Guía — prender el webhook de Notion con Laura

Para la llamada. Laura hace los clics. Tú le dictas la dirección y las dos casillas. No se manda WhatsApp. No se crea una integración nueva.

Esto avisa al backend cuando cambia un contacto. Entra en el plan gratis. No es el botón "Enviar webhook" de una automatización de la base: ese es de pago y no lo vamos a usar.

## Qué decirle al empezar

"Vamos a prender un aviso para que, cuando cambie un contacto, Notion le avise solo al sistema. Usamos la conexión que ya existe, FDT2026. No hay que cambiar de plan."

## Antes de la llamada

La dirección es `https://f8wwwgc0g88wccscww4cccco.appsplatica.site/webhooks/notion`.

Ese código tiene que estar desplegado en Coolify. Si no, Notion no puede verificar y Laura se queda a medias. Un `POST` a esa dirección tiene que responder 200 antes de crear la suscripción.

## En la llamada

1. Laura entra a Notion con la cuenta dueña de la integración `FDT2026`.
2. Abre [https://www.notion.so/profile/integrations](https://www.notion.so/profile/integrations).
3. Elige la conexión `FDT2026`. Es la que ya ve Contactos FDT y Citas FDT2026. Si el nombre en pantalla es otro, que sea esa, no una nueva.
4. Pestaña **Webhooks**.
5. **+ Create a subscription**.
6. En Webhook URL pega la dirección del paso de antes.
7. Marca solo estas dos:
   - `page.created` — fila nueva
   - `page.properties_updated` — cambió un campo, incluida la baja
8. **Create subscription**.

En la misma llamada, sin que Laura vuelva otro día:

1. Tú consultas `GET /webhooks/notion/verificacion` con la `X-API-Key` del backend.
2. Copias `verification_token`.
3. En la misma pantalla, **Verify**, pegas el token y **Verify subscription**.

Si el GET dice `recibido: false`, en el formulario de Notion pulsa **Resend token** y espera unos segundos. Si el proceso de Coolify reinició entre el aviso y la consulta, el token se pierde: reenvíalo. No queda guardado en disco.

## Qué no marcar

Comentarios, esquema de la base, contenido de la página, páginas movidas o borradas. Esos avisos no los vamos a usar, y se pueden agregar después sin borrar la suscripción. La dirección, en cambio, no se puede cambiar después de verificar: habría que borrarla y crearla otra vez.

Mañana el aviso ya queda prendido. Copiar los cambios a Plática todavía no: un evento se recibe y no se procesa. La prueba de que llegó es el log `Evento recibido sin procesar`.

## Si algo falla

| Qué se ve | Qué hacer |
|---|---|
| No aparece la pestaña Webhooks | Está en otra conexión, o en otra cuenta. Volver al paso 2. |
| La URL no se puede guardar | Tiene que empezar con `https://`. Localhost no sirve. |
| El GET dice `recibido: false` | **Resend token** y consultar otra vez. Si el proceso reinició, el token anterior ya no está. |
| Verify no acepta el token | Es un token viejo. Reenviar y copiar el último. |
| No llega nada al editar un contacto | La suscripción sigue en pendiente, o la conexión no tiene acceso a esa base. |
