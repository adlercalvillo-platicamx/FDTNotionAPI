# Bitácora 28-ago — las 15:00 “no disponibles” (Platica.mx)

Prueba en vivo: Adler preguntó miércoles/jueves a las 3 con Platica.mx. El agente dijo que 15:00 no estaba. Notion no tenía nada a esa hora.

## Qué no era

- **Fila DINUS 27-ago 13:30:** residuo de prueba. `listarCitasConfirmadasEnFecha` filtra por `inicio.startsWith('2026-10-07'|'2026-10-08')`. No entra. Sí conviene archivarla, pero no era la causa.
- **`ASISTENTE_YA_OCUPADO`:** el contacto de Adler `3ca90fe2-7345-8127-b267-f9feb0539c0f` no tiene citas confirmadas el 7 ni el 8 oct. 15:00 no se marcó ocupado para él.
- **Zona horaria:** Notion API devolvía `-06:00` alineado con la grilla (`2026-10-07T11:00:00-06:00` = Luis). No hay corrimiento de 11:00 → 15:00.

## Qué sí era

Corrida read-only contra el data source de pruebas (`df93bc94…`, no Laura):

| Día | 15:00 Platica+Adler | Ocupado real | Primer lote de 3 casillas |
|---|---|---|---|
| 7-oct | `disponible: true`, 0 mesas | 11:00 `SPONSOR_YA_OCUPADO` (Luis) | 10:30, **14:00**, 11:30 |
| 8-oct | `disponible: true`, 0 mesas | 10:30 bloqueo conferencia | 09:00, **14:00**, 09:30 |

`CITAS_CORTE_MANANA_TARDE=14:00` → casilla Tarde = el **primer** bloque ≥ 14:00. Si 14:00 está libre, 15:00 nunca entra a `opciones_para_ofrecer`. El agente solo puede ofrecer esas 3 y negó las 15:00 aunque `total_libres` era 16/17 y `hay_mas=true`.

El 7-oct sí hay un 15:00 ocupado, pero es otro sponsor (`3b790fe2-7345-8164-bc7e-ec3c81a07486`, Magali) + contacto de bloqueo — no toca a Platica.

## Fix

`consultar_disponibilidad_cita` acepta `hora=HH:MM`. Si está libre, esa hora entra primero en las 3. `horario_solicitado` dice si la hora pedida está libre o no. El agente no debe negar una hora solo porque no salió en las casillas.
