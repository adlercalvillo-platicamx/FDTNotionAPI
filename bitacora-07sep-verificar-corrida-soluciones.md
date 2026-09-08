# Bitácora 07sep — verificar corrida nueva de sugeridas
Handoff. Código gana si esto contradice algo.
Lectura del 7-sep-2026 contra Notion de Laura, solo lectura. Continúa [bitacora-08sep-filtro-soluciones-oro.md](bitacora-08sep-filtro-soluciones-oro.md). Adler ya borró `Sugerido`, redeploy y ~5 corridas del cron.

## Pedido

¿Quedó coherente con el filtro de soluciones + ranking de tamaño? ¿Qué cambió vs las 188 viejas?

## Qué hay ahora

| Estatus | Filas |
|---|---|
| Sugerido | **105** |
| Aprobado | **0** |
| Confirmada (citas reales de prueba) | 10 |
| Confirmada sin notificar (bloqueos de programa) | 10 |

Cero violaciones de Capa 1. Scores de `Notas` = `calcularScore` actual. Tiendanube sigue en `Solucion=Otro` y solo tiene **FLEXI** por oro molido (nota: pidió por nombre, sin solución en común).

## Vs el plan de una sola corrida

Una corrida debía escribir ~61 (`cuota+2`, Platica.mx 3). Cinco crons llenaron **casi todo el pool** restante: cada corrida vuelve a escribir `topN` de lo que aún no está activo.

| Sponsor | Pool estimado 7-sep | Sugerido ahora | topN de 1 corrida |
|---|---|---|---|
| Tiendanube | 1 | 1 | 6 |
| Reevolution | 19 | 18 | 6 |
| Leadin | 16 | 16 | 6 |
| Envia.com | 7 | 7 | 4 |
| Revie | 12 | 11 | 6 |
| Platica.mx | 3 | 3 | 6 |
| Flow | 11 | 10 | 8 |
| Blip | 15 | 12 | 6 |
| CaaS | 12 | 11 | 6 |
| Reversso | 11 | 10 | 4 |
| Infracommerce | 6 | 6 | 6 |

Los 8 “faltantes” del pool ya tienen **Confirmada** (Adler/Liz/Luismi). No hay más candidatos nuevos que el cron pueda escribir.

## Aprobado

Las 11 `Aprobado` de antes **ya no están**. No pasaron a Confirmada (las 10 Confirmada son citas de prueba Adler/Liz/Luismi + 10 bloqueos). Si el borrado debía ser solo `Sugerido`, esas 11 hay que reponer a mano.

## Columna "Sin Contacto Principal" en los boards por asistente

`Top Sugeridas y Aprobadas por Asistente` (`3cf62dda-199a-81cf-b15d-000cd6d46e41`), `Top Sugeridas por Asistente` (`3d062dda-199a-81e2-9dcf-000cc9af3e38`) y `Top Aprobadas por Asistente` agrupan por la relación `Contacto Principal` con `hide_empty_groups: true`. La columna de "sin valor" solo sale si hay filas sin asistente.

A las 05:08 UTC del 8-sep aparecieron **5 filas huérfanas** (sin `Contacto Principal` ni `Contacto Match`, `Estatus=Sugerido`, sin `Notas`) cuyo título es texto pegado de un chat. Es el efecto de pegar varios párrafos dentro de una vista filtrada por `Estatus = Sugerido`: Notion crea una fila por párrafo y hereda el valor del filtro.

Efecto: los conteos de `Sugerido` pasaron de 105 reales a 110 y las vistas de sugeridas las mostraban. **No** afectaban matchmaking (`obtenerParesConCitaActiva` exige sponsor y asistente) ni capacidad de mesas (no son `Confirmada`). Adler las borró a mano. Relectura 7-sep noche: **0** filas sin `Contacto Principal`, `Sugerido` = **105**, total Citas 126 (105 + 10 Confirmada + 10 bloqueos + 1 Cancelada). La columna de “sin valor” ya no tiene filas.

## Ranking

Grande/VIP de prueba encabezan. Micro/Pequeña (MISSANGA, ASHLEY POSADAS) quedan al fondo de Leadin, como se diseñó. Oro molido (FLEXI) sigue en ~1184–1230.
