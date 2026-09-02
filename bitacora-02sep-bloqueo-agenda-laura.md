# Bitácora 02sep — Contacto ficticio y 7 bloqueos de agenda en Laura
Handoff. Código gana si esto contradice algo.
2 de septiembre de 2026. Continúa [bitacora-02sep-verificar-vistas-laura.md].
No se tocó pruebas ni Coolify.

## Pedido

Antes de apuntar Coolify a Laura hace falta el contacto ficticio de
bloqueo y las 7 filas de conferencia, iguales a las de pruebas. Adler
no configura `NOTION_CONTACTO_BLOQUEO_AGENDA_ID` en Coolify todavía.

## Contacto ficticio (Laura Contactos)

No existía. Creado con los mismos 4 campos que en pruebas; el resto vacío.

- Nombre: `Bloqueo de Agenda (Programa del Evento)`
- Categoria: `Comite/Team`
- Dado de Baja: false
- page_id: **`3cf62dda-199a-81fa-85fc-c32e95485c04`**

Ese es el valor para Coolify cuando Adler haga el switch:
`NOTION_CONTACTO_BLOQUEO_AGENDA_ID=3cf62dda-199a-81fa-85fc-c32e95485c04`

Data sources confirmados por fetch: Contactos
`3b162dda-199a-8029-8d58-000b6d1fed37`, Citas
`3b162dda-199a-8053-8098-000b00916893`.

## Script

`scripts/one-shots/crear-bloqueos-conferencias-laura.js` — copia de la
lógica de `crear-bloqueos-conferencias.js` (ese archivo no se tocó).
Usa `NOTION_API_KEY_LAURA`, aborta si el data source o el page_id son
los de pruebas, mismo `PROGRAMA` de 7 sesiones.

Corrida con `--confirmar`. Las 7 filas se crearon (ninguna existía).
Verificación por refetch: Estatus `Confirmada sin notificar`, horario,
Contacto Match y Contacto Principal exactos.

## Las 7 conferencias

| Sesión | Horario | Sponsor Laura | Fila Citas | Acción |
|---|---|---|---|---|
| Flow Conferencia | 2026-10-07 10:30 | Javier Huerta `3bc62dda-199a-81ec-b616-f4073c5165a7` | `3cf62dda-199a-8112-bdd1-f82314421f5b` | creada |
| Blip Conversatorio | 2026-10-07 12:00 | Zuleyma Chávez Coronado `3bc62dda-199a-81a6-9117-e04e6e317211` | `3cf62dda-199a-81da-9903-e1ddc31be0ea` | creada |
| Infracommerce Conversatorio | 2026-10-07 12:30 | Daniela Guerrero `3bc62dda-199a-81bb-b769-f4ef0eab9a5f` | `3cf62dda-199a-81ba-9ddc-fe5d2e93767d` | creada |
| CaaS Conversatorio | 2026-10-07 15:00 | Magali Parra `3bc62dda-199a-81aa-965e-fa85282ce781` | `3cf62dda-199a-81c5-a8dd-c2b8ed4e1001` | creada |
| Revie Conversatorio | 2026-10-07 15:30 | Renata Raya `3bc62dda-199a-8189-805d-ee8b4fcca080` | `3cf62dda-199a-8193-a6ca-df767d207455` | creada |
| Platica.mx Conversatorio | 2026-10-08 10:30 | Marco Trujillo `3bc62dda-199a-81e4-a8bf-f50195a20176` | `3cf62dda-199a-81ab-bba0-e6c96ba79b67` | creada |
| Reversso Mesa de Diálogo | 2026-10-08 11:00 | Rodrigo Cerda Somoza `3bc62dda-199a-81ce-838f-da1c4686e79f` | `3cf62dda-199a-81f8-ba3d-ec3d455254ae` | creada |

Envia.com no tiene sesión en el programa; no se le creó bloqueo.

## Ocupación vs 11 mesas

Contra Laura, con `sponsorOcupadoEnBloque` + `contarCitasEnBloque` y
`NOTION_CONTACTO_BLOQUEO_AGENDA_ID` del contacto nuevo:

- Blip a las 12:00 del 7-oct: **ocupado**, mesas reales **0**.
- Las otras 6: cada sponsor **ocupado** en su horario; mesas reales **0**
  en los 7 bloques.

Ninguna de las 7 filas suma a las 11 mesas. Envia.com sigue libre en
esos horarios (no está en el programa).

## Reintento de correos (mismo día, Adler)

Las 7 siguen en `Confirmada sin notificar` a propósito (ocupación). El
barrido `POST /citas/reintentar-notificaciones-pendientes` **las
omitía mal**: las listaba y hubiera mandado el .ics al sponsor.

Cambio (Coolify hay que redeployar para que aplique):

- `buscarCitasSinNotificarParaReintentar` filtra Contacto Principal =
  contacto ficticio.
- `reintentarNotificacion` (un id) responde `FILA_BLOQUEO_AGENDA` y no
  toca SMTP ni el Estatus.

`tests/bloqueo-conferencias.manual-test.js` y
`tests/email-notificacion.manual-test.js` pasan.

## Qué no se hizo

- Coolify: no se cambió `NOTION_CONTACTO_BLOQUEO_AGENDA_ID` ni data
  sources ni token.
- Pruebas: intacto.
- No reejecutar el script contra Laura sin revisar: es idempotente, pero
  no hace falta.
