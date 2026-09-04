# Bitácora 03sep — Multiplicador VIP/Speaker en ranking
Handoff. Código gana si esto contradice algo.
3 de septiembre de 2026. Sin commit todavía. Continúa [bitacora-01sep-tamano-speaker-carga-laura.md].

## Pedido

Adler: rediseñar Capa 2 para que VIP/Speaker/Presencial dejen de sumar +500/+150 y pasen a multiplicar la afinidad. Prompt v3 (calibración ×1.4, ICP No sin amplificar). **No confirmado por Laura/Liz.** No desplegar a Laura ni escribir `Sugerido` hasta que Adler revise.

## Decisión

El boleto amplifica match real; no compra score. Oro molido (+1000) se suma al final, sin multiplicar. Virtual se queda en ×1.0 (Adler descartó ×0.9). Multiplicador solo si `scoreBase > 0`.

## Qué cambió

`calcularScore` en `matchmaking.service.js`: `MULTIPLICADOR_CANAL` Virtual 1.0 / Presencial 1.15 / VIP y Speaker 1.4. Redondeo en centésimas enteras (`(base × 115) / 100`) porque 370×1.15 en IEEE caía a 425 y la calibración pide 426. Filtros de Capa 1, booking, MCP y campañas no se tocaron. Texto del reporte: “su match se prioriza sobre otros candidatos con un perfil similar”.

`tests/matchmaking-2026.manual-test.js`: se **invirtió** la aserción “VIP le gana a un Presencial con match equivalente”. No era equivalente (VIP vacío vs Presencial con área+Pagos); era el bug. Ahora gana el Presencial.

## Cómo operarlo

Antes del push, Adler borró manualmente del workspace de Laura todas las sugerencias creadas con el ranking anterior. En Coolify dejó `CAMPANAS_MATCHMAKING_MODO_SIMULACION=true` y `CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO=false`, y ejecutó redeploy. Estas banderas protegen el envío de campañas, pero el cron de `sugerir-todos` sí puede volver a crear filas `Sugerido`.

`.env` local sigue en data source `3b162dda` (Laura). Dry-run de esta bitácora usó `.env-pruebas.txt` (prefijo `9f335308`), `escribirEnNotion: false`.

## Evidencia

Mocks (`tests/multiplicador-canal.manual-test.js` A–G) PASS. Baseline mock Ana: Carlos **127**, Laura **1196** (antes 260 / 1320).

| Caso | Resultado |
|---|---|
| A VIP vacío vs Presencial área+3 sol | 14 vs 288, gana Presencial |
| B mismo match VIP vs Presencial | 350 vs 288 (~22%) |
| C Presencial 5 sol vs VIP 4 sol | 426 vs 434, gana VIP (calibración ×1.4) |
| D oro molido no se multiplica | delta canal = solo afinidad |
| E Speaker = VIP | mismo score ×1.4 |
| F solo Declarado | 10 / 12 / 14 |
| G ICP No VIP vs Virtual | ambos −20 |
| H batería | 2026, sesion-14ago, tamano-*, vip-tamano, matchmaking mock PASS |

Dry-run pruebas: `sugerirMatchesParaSponsor` Blip/Infracommerce/Reversso/CaaS → 4 evaluados, **0 válidos** (ya tienen cita activa con el sponsor). Ranking del pool Capa 1 **sin** excluir pares (solo lectura, 4 asistentes hoy — no los 18 del diseño):

| Sponsor | 1º | CaaS Adler vs Luis |
|---|---|---|
| Blip | Sam 476 VIP, Adler 392, Luis 391, Liz 322 | — |
| Infracommerce | Sam 560, Luis 460, Adler 308, Liz 253 | Luis gana: match claramente mayor |
| Reversso | Sam 308, Luis 253, Adler 224, Liz 184 | igual |
| **CaaS** | **Adler 476 > Luis 460** | coincide con la calibración ×1.4 |

Miranda Ayala / Eduardo Moran no están en el pool Capa 1 de pruebas hoy (giro/tamaño), así que un VIP vacío no aparece en el top. El caso estructural queda cubierto por el mock A.

## Pendientes

- Confirmar que el deploy de Coolify tomó el commit del multiplicador y probar el ranking sin disparar campañas.
- Validar con Laura/Liz el ×1.4 en demo; no marcarlo confirmado.
- El `.env` de esta máquina es Laura: no correr matchmaking con escritura desde aquí salvo pedido explícito.
