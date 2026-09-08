# Bitácora 07sep — Pequeña/Micro +20/+10 contra datos reales de Laura
Handoff. Código gana si esto contradice algo.
Lectura del 7-sep-2026. No se escribió Notion ni Coolify. Continúa [bitacora-07sep-jerarquia-tamano.md](bitacora-07sep-jerarquia-tamano.md).

## Pedido

Antes de fijar Pequeña +20 / Micro +10, ver si un Pequeña/Micro con match real (Área y/o 2+ soluciones) queda por debajo del Grande/Mediana más flojo del mismo sponsor. Solo lectura contra Contactos/Citas de Laura.

## Cómo se midió

- 11 sponsors activos no Bronce. Solo 4 piden Pequeña o Micro: **Tiendanube, Reevolution, Envia.com, Leadin**. No hay un quinto.
- 46 asistentes pasan Giro + boleto + opt-in. Tamaños declarados: 9 Grande, 0 Mediana, 5 Pequeña, 3 Micro. El resto es legacy Exa o vacío.
- Pesos locales: Grande 100, Mediana 70, Pequeña 20, Micro 10. Área +40. Soluciones tope +50.
- Capa 1b estricta (incluye `Sugerido`/`Aprobado`) deja **pool 0**: hay 220 pares “activos”, casi todos sugerencias viejas. El ranking de abajo **ignora esas filas** y solo saca reservas reales (20 Confirmada/Pendiente), para ver el efecto de los pesos como si Adler ya hubiera borrado los `Sugerido`.

No hubo Grande/Mediana en el pool **sin** Área ni solución. La referencia es el Grande más bajo que sí entra: **AMAZON** (tiene Área eCommerce).

## Tabla

| Sponsor | Pequeña/Micro con match real (n) | Cuántos quedan bajo el Grande más bajo | Ejemplo concreto |
|---|---|---|---|
| Tiendanube | 2 | **2 / 2** | SKIN SOLUTIONS Pequeña 115 (área Founder, 0 sols) queda **23** pts bajo AMAZON Grande 138 (área eCommerce, 0 sols). ASHLEY POSADAS Pequeña 69, mismo patrón. |
| Reevolution | 3 | **3 / 3** | SKIN SOLUTIONS Pequeña 173 (área + 7 sols, tope) queda **23** pts bajo AMAZON Grande 196 (área + 4 sols). También ASHLEY POSADAS 127 y PROPIA 110 (área Compras + 11 sols). |
| Envia.com | 3 | **2 / 3** | PROPIA Pequeña 90 queda **48** pts bajo AMAZON Grande 138. ASHLEY POSADAS 69 también. **SKIN SOLUTIONS Pequeña 150 sí gana a AMAZON 138** (área + 1 sol vs área y 0 sols). |
| Leadin | 4 | **4 / 4** | SKIN SOLUTIONS Pequeña 161 (área + 2 sols) queda **23** pts bajo AMAZON Grande 184 (área + 2 sols). KRISTILLA Micro 150 (área + 2 sols) también queda abajo. |

## Lectura

El hueco de **80 puntos** (Grande 100 vs Pequeña 20) no lo cubre Área (+40) ni el tope de soluciones (+50) cuando el Grande también trae Área. En tres de cuatro sponsors **todos** los Pequeña/Micro con match real pierden contra el Grande más flojo. En Envia.com solo uno (SKIN SOLUTIONS) se cuela porque ese Grande no trae soluciones.

Eso es exactamente el riesgo del prompt: el sponsor dijo que sí se junta con Pequeña, pero el ranking las deja sistemáticamente detrás de un Grande con la misma (o menos) afinidad de solución.

## Pendiente

Adler confirma si eso es lo que quiere (Grande estructuralmente primero) o si Pequeña/Micro deben poder ganar con Área + 2 soluciones. **No toqué `PESOS` a partir de este reporte.** El working tree local ya tiene 100/70/20/10; `main` publicado sigue en `0c61e15` con +100 parejo.
