# Bitácora 07sep — matchmaking por tamaño y Área
Handoff. Código gana si esto contradice algo.
Trabajo del 7-sep-2026. Commit: este cambio. Continúa [bitacora-03sep-multiplicador-vip-speaker.md](bitacora-03sep-multiplicador-vip-speaker.md).

## Pedido y decisión

Adler pidió que la coincidencia de tamaño pesara más que acumular soluciones, que Área fuera un filtro real y que la cuota cambiante dejara de congelarse en las explicaciones. Confirmó estas decisiones:

- sponsor sin `Puestos Buscados`: Área no filtra;
- Área exacta entra; vacía/`Otro` entra como desconocida; conocida distinta sale;
- VIP y Speaker no saltan Área;
- todos los tamaños solicitados valen lo mismo;
- las 188 filas `Sugerido` existentes las borrará Adler manualmente antes de la primera corrida con el código nuevo.

## Qué cambió y por qué

- Capa 1 ahora cruza `Puestos Buscados` con `Area` antes del ranking.
- Tamaño declarado solicitado suma +100, sin jerarquía Grande/Mediana/Pequeña/Micro.
- Legacy sin tamaño usa Exa: Consolidado +80 / PyME +40.
- VIP/Speaker conservan solo el bypass de tamaño y reciben +100 únicamente si el tamaño sí coincide.
- Área exacta suma +40 para ordenar por encima de Área desconocida.
- Soluciones: +30 la primera, +10 la segunda y tercera, tope +50. La explicación conserva todas las coincidencias.
- Se mantienen oro molido +1000 fijo, ICP +30/−30, web +10, texto libre, fuente y multiplicadores de canal.
- `generarExplicacionNatural` abre con la vía de entrada por tamaño: declarado, fallback Exa o bypass VIP/Speaker.
- `cuota_pendiente` salió de `detalle`, señales y `Notas`; la cuota todavía define `topN = Citas Minimas Prometidas + MARGEN_CANDIDATOS`.
- Las descripciones MCP, README, AGENTS y baselines de pruebas quedaron alineados. No cambió el prompt vivo de Plática ni `reservar_cita`.

## Operación en Notion de Laura

Script idempotente y dry-run por default:

```bash
node scripts/one-shots/actualizar-vistas-faltantes-laura-07sep.js
node scripts/one-shots/actualizar-vistas-faltantes-laura-07sep.js --confirmar
```

Ejecutado en `Citas` de Laura:

- creado rollup `Citas Faltantes (sponsor)` = `Contacto Match → Citas Faltantes`;
- visible junto a `Empresa Sponsor` en `Sugeridos por decidir`, `Aprobados sin agendar`, cinco boards `Top ... por Asistente`, `Cola — Sugeridas por aprobar`, `Aprobadas sin oferta` y `Aprobadas con oferta`;
- `Notas` permanece visible;
- validación posterior confirmó que filtros, sorts y `group_by` no cambiaron.

Reconciliación separada de Aprobados:

```bash
node scripts/one-shots/reconciliar-aprobadas-matchmaking-laura-07sep.js
node scripts/one-shots/reconciliar-aprobadas-matchmaking-laura-07sep.js --confirmar
```

El dry-run mostró los 11 pares nominales y Adler autorizó la escritura. Los 11 conservaron elegibilidad de Área y Tamaño. Solo cambió `Notas`, manteniendo el formato `Score: N. explicación`, Estatus `Aprobado` y ambas relaciones. En una primera pasada se omitió por error el prefijo `Score:`; se corrigió inmediatamente en las mismas 11 filas y la validación final comprobó también `Score (de Notas)`.

## Evidencia

- Comparación Laura, solo lectura: 199 filas evaluadas = 188 `Sugerido` + 11 `Aprobado`.
- 45 `Sugerido` tienen Área conocida no solicitada; 0 `Aprobado` incompatible.
- 0 incompatibles por tamaño en esas 199 filas.
- Reconciliación: 11/11 `Aprobado` actualizados y verificados; ningún mensaje enviado.
- Vistas: 10/10 actualizadas y verificadas; rerun dry-run detecta el rollup existente.
- Pruebas locales pasaron: Área, tamaño, VIP/Speaker, score 2026, multiplicadores, regresiones 14-ago, guardado individual, global, baseline con mocks y bloqueos de conferencia.
- Baseline nuevo con mocks: Carlos 150; Laura 1184.

El comparador reproducible es solo lectura:

```bash
node scripts/one-shots/comparar-ranking-laura-07sep.js
```

## Pendientes y secuencia de despliegue

1. Evitar que el cron de 6 h corra con el backend viejo durante el corte.
2. Redeploy del commit nuevo.
3. Adler borra manualmente las 188 filas `Sugerido`; no hay script de borrado.
4. Ejecutar una corrida nueva de matchmaking.
5. Verificar en las vistas nuevas el score, explicación y `Citas Faltantes (sponsor)`.

No reejecutar los scripts con `--confirmar` salvo que se quiera reparar/verificar expresamente el mismo estado idempotente. El comparador y los modos sin `--confirmar` son de solo lectura.
