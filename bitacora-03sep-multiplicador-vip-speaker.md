# Bitácora 03sep — Multiplicador VIP/Speaker en ranking
Handoff. Código gana si esto contradice algo.
3–4 de septiembre de 2026. Commit `a075cf9` en `main`. Continúa [bitacora-01sep-tamano-speaker-carga-laura.md].

## Pedido

Adler: rediseñar Capa 2 para que VIP/Speaker/Presencial dejen de sumar +500/+150 y pasen a multiplicar la afinidad. Prompt v3 (calibración ×1.4, ICP No sin amplificar). **No confirmado por Laura/Liz.** No desplegar a Laura ni escribir `Sugerido` hasta que Adler revise.

## Decisión

El boleto amplifica match real; no compra score. Oro molido (+1000) se suma al final, sin multiplicar. Virtual se queda en ×1.0 (Adler descartó ×0.9). Multiplicador solo si `scoreBase > 0`.

## Qué cambió

`calcularScore` en `matchmaking.service.js`: `MULTIPLICADOR_CANAL` Virtual 1.0 / Presencial 1.15 / VIP y Speaker 1.4. Redondeo en centésimas enteras (`(base × 115) / 100`) porque 370×1.15 en IEEE caía a 425 y la calibración pide 426. Filtros de Capa 1, booking, MCP y campañas no se tocaron. Texto del reporte: “su match se prioriza sobre otros candidatos con un perfil similar”.

`tests/matchmaking-2026.manual-test.js`: se **invirtió** la aserción “VIP le gana a un Presencial con match equivalente”. No era equivalente (VIP vacío vs Presencial con área+Pagos); era el bug. Ahora gana el Presencial.

## Cómo operarlo

Antes del push, Adler borró las sugerencias viejas en Laura. Coolify: `CAMPANAS_MATCHMAKING_MODO_SIMULACION=true`, `CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO=false`. El primer auto-deploy no tomó el commit; Adler hizo **redeploy manual** (4-sep). El cron de `sugerir-todos` **sí escribe** `Sugerido` si corre.

El workspace de Laura **no** está en Notion MCP: lectura/escritura va por REST + `NOTION_API_KEY`. Coolify y el `.env` local apuntan a Contactos `3b162dda`. Dry-run de ranking: `POST /matchmaking/sponsors/:id/sugerir-matches` con `escribirEnNotion: false` (si omites el flag, REST escribe). No llamar `sugerir-todos` ni el webhook de campañas.

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

### Coolify Laura (4-sep, post-redeploy manual)

Host `https://f8wwwgc0g88wccscww4cccco.appsplatica.site`. `GET /health` 200. Tres dry-run, **sin escribir Notion**, 13 evaluados / 13 válidos cada uno. Fingerprint del código nuevo: línea `canal: … ×1.4` / `×1.15`. Antes del redeploy Blip daba Samantha **840** (500+340) y no traía esa línea.

| Sponsor | 1º | Notas |
|---|---|---|
| Blip | Sam VIP **476** (antes 840) | Ximena Presencial **460** (5 soluciones) queda 2ª, por encima de Laura/Carlos/Adler VIP **392**. Luis Presencial **391**. |
| **CaaS** | Laura/Carlos/Adler VIP **476** | **Adler 476 > Luis 460** — misma calibración ×1.4. |
| Infracommerce | Sam VIP **560** | Luis y Ximena Presencial **460** le ganan a Adler VIP **308** (match más claro). |

Luiz Damasceno (VIP + ICP No), que en el código viejo salía 5º de Blip con 640, ya no entra al top 8.

### Cron `sugerir-todos` en Laura (Adler, 4-sep ~06:17 UTC)

Adler lo disparó a mano tras el redeploy. Query REST a Citas (solo lectura, token Laura): **64** filas `Sugerido`, todas creadas en ese minuto. 11 sponsors (Blip 6, CaaS 6, Infracommerce 6, Flow 8, …). Scores de Blip/CaaS/Infracommerce coinciden con el dry-run (Sam×Infracommerce 560, Adler×Infracommerce 308, etc.). **0** notas con el texto viejo “tiene prioridad”; **40** con “perfil similar” (VIP/Speaker). No se tocó el webhook de campañas.

## Pendientes

- Validar con Laura/Liz el ×1.4 en demo; no marcarlo confirmado.
- El cron de 6h puede volver a llenar `Sugerido` en Laura con este ranking. Campañas siguen en simulación.
- No escribir sugerencias ni disparar webhook hasta que Adler lo pida.
