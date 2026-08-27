# Bitácora 26 ago — bloqueo de horarios de conferencias

Pendiente de Adler: ocupar al sponsor en el bloque de su charla sin restar una de las 11 mesas.

## Datos (workspace de pruebas de Adler)

Contacto ficticio ya existente: `Bloqueo de Agenda (Programa del Evento)` (`3c990fe2-7345-8121-92a6-f9e09a540d2e`), `Categoria = Comite/Team`. No se recreó.

7 filas en `Citas (nueva)` (`df93bc94-…`), `Estatus = Confirmada sin notificar`, `Contacto Principal` = el ficticio, `Contacto Match` = el sponsor por **empresa** (no por el nombre del ponente del programa). Envia.com no tiene charla: sin fila.

Horarios (inicio ISO `-06:00`, fin = +30 min, misma grilla que booking):

| Empresa | Inicio |
|---|---|
| Flow | 2026-10-07 10:30 |
| Blip | 2026-10-07 12:00 |
| Infracommerce | 2026-10-07 12:30 |
| CaaS | 2026-10-07 15:00 |
| Revie | 2026-10-07 15:30 |
| Platica.mx | 2026-10-08 10:30 |
| Reversso | 2026-10-08 11:00 |

Script: `node -r dotenv/config scripts/one-shots/crear-bloqueos-conferencias.js --confirmar` (idempotente). No toca producción de Laura.

## Código

- `contarCitasEnBloque`, `cargarIndiceCitasConfirmadas`, `obtenerDisponibilidadSponsor` y la cuota de `contarCitasConfirmadasPorSponsor` **excluyen** el contacto de bloqueo.
- `sponsorOcupadoEnBloque` **no** lo excluye: el sponsor queda `SPONSOR_YA_OCUPADO`.
- Env: `NOTION_CONTACTO_BLOQUEO_AGENDA_ID` (default = el page_id de pruebas). Cadena vacía desactiva la exclusión, solo fuera de producción.
- Fail-fast (26 ago, seguimiento): si los data sources apuntan al workspace de Laura (prefijo `3b162dda`, mismo criterio que ya usaba el one-shot) y la variable falta, está vacía o trae el default de pruebas, `requireContactoBloqueoAgenda` lanza error 503. Se llama en `src/index.js` antes de `listen` (revienta en el deploy, no en la primera consulta del evento) y desde `contactoBloqueoAgendaId`, así que ninguna ruta puede seguir en silencio. Contra pruebas no cambia nada.
- Matchmaking: `esCandidatoAsistenteReal` — `categoria !== 'Asistente'` no entra, aunque el tamaño sea Grande.

## Pruebas

- `node tests/bloqueo-conferencias.manual-test.js`: 10 citas reales + bloqueo de Blip a las 12:00 → Blip ocupado, 10 mesas, un 11.º sponsor distinto sí puede; Comite/Team no sale en sugerencias.
- Tras crear las filas (26 ago, Contactos/Citas nueva): `sponsorOcupadoEnBloque(Blip, 2026-10-07T12:00:00-06:00)` = true; `contarCitasEnBloque` en ese horario = **0** (la fila ficticia no suma mesa). El caso 10 citas reales + 11.º sponsor se cubrió en el test local (no se llenó Notion con 10 Confirmadas de relleno).

Notion a veces persiste `Fecha y Hora` con `.000`; el índice de disponibilidad ahora normaliza eso para que coincida con la grilla de 30 min.
