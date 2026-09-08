# Bitácora 08sep — filtro de soluciones, oro molido y pesos
Handoff. Código gana si esto contradice algo.
Trabajo del 7-sep-2026 (fecha local) / diseño 8-sep del prompt. Continúa [bitacora-07sep-impacto-filtro-soluciones.md](bitacora-07sep-impacto-filtro-soluciones.md). Sin deploy.

## Pedido y decisión

Adler autorizó el prompt: ≥1 solución coincidente en Capa 1, oro molido salta tamaño/área/soluciones, soluciones 20/40/60/80, Pequeña 58 / Micro 30. Sin excepción por sponsor. Micro +30 es la propuesta del prompt; Adler no lo confirmó en un mensaje aparte.

## Qué cambió

- `esCandidatoPorSolucion`: hace falta ≥1 coincidencia real. Sponsor vacío o solo `Otro` = nadie (Tiendanube queda en oro molido o 0 hasta que marque soluciones). VIP/Speaker no se lo saltan.
- Oro molido (`empresaMencionadaEn` × `Clientes Potenciales Deseados`) entra aunque falle tamaño, área o soluciones. Giro sigue en la query de Notion. Capa 1b (cliente actual / cita activa) sigue ganando.
- Notas: si el par entró por nombre y falta área y/o soluciones, lo dice.
- Pesos: Grande 100, Mediana 70, Pequeña 58, Micro 30. Soluciones tope 80.

## Pool Laura (solo lectura, 11 sponsors, 46 asistentes)

Pool hoy = tamaño + Área + no cliente. Pool nuevo = eso + soluciones, con oro molido reentrando. No se restan filas `Sugerido`.

| Sponsor | Pool hoy | Pool nuevo | Pierde |
|---|---|---|---|
| Tiendanube | 18 | 1 (solo FLEXI por oro molido, si el nombre sigue en deseados) o 0 | el resto |
| Reevolution | 20 | 19 | 1 |
| Leadin | 20 | 16 | 4 |
| Envia.com | 19 | 7 | 12 |
| Revie | 14 | 12 | 2 |
| Platica.mx | 6 | 3 | 3 |
| Flow | 15 | 11 | 4 |
| Blip | 17 | 15 | 2 |
| CaaS | 13 | 12 | 1 |
| Reversso | 13 | 11 | 2 |
| Infracommerce | 8 | 6 | 2 |

Ningún sponsor queda en 0 salvo quien no tenga soluciones reales ni oro molido. **Tiendanube** hoy tiene `Solucion=Otro`: el filtro los deja fuera del match normal; FLEXI puede reentrar por nombre. Tienen que marcar soluciones reales en Notion — no hay excepción de código.

## Operación

Sin deploy hasta que Adler lo autorice. Sigue pendiente borrar los 188 `Sugerido` y pausar el cron 6h en el corte. No reejecutar one-shots de escritura.
