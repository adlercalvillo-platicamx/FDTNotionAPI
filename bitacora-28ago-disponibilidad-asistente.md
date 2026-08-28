# Bitácora 28-ago — ocupación del asistente, 4 sponsors, excluirInicios

Prueba en vivo con Luis: `consultar_disponibilidad_cita` ofreció el miércoles 11:00 de Flow aunque ya tenía cita Confirmada a esa hora con Platica.mx. El backend solo preguntaba si el **sponsor** estaba libre.

## Disponibilidad bidireccional

`Confirmada` / `Confirmada sin notificar` en el mismo `inicio` ocupan también al asistente (`Contacto Principal`).

- Foto: `obtenerDisponibilidadSponsor({ asistentePageId })` → motivo `ASISTENTE_YA_OCUPADO`. MCP exige `whatsapp` o `asistentePageId`.
- Escritura: `asistenteOcupadoEnBloque` en `reservarCita` / `modificarCita` (este último con `exceptPageId`).
- Casillas Día 1 Mañana / Tarde / Día 2 no cambian: el bloque ocupado simplemente no entra a la selección.
- No hay tope de cuántas citas puede tener una persona; solo se bloquea el traslape.

## 4 sponsors en el primer lote

`sugeridas_para_ofrecer` pasa de 3 a 4. `hay_mas_sugeridas` sigue siendo el respaldo si hay más de 4. Horarios y citas a mover/cancelar siguen en tope 3.

## `excluirInicios`

Ya estaba implementado de verdad (no solo el aviso). Confirmado con test: segundo llamado no repite los `inicio` del primero.

## Prompt del agente

Pendiente de aplicar en Plática **después** del deploy de este backend. El texto activo todavía dice “máximo 3” sponsors y pide reordenar horarios cronológicamente.
