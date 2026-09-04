# Bitácora 04sep — Tamaño de candidato según preferencia del sponsor
Handoff. Código gana si esto contradice algo.
4 de septiembre de 2026. Commit de este filtro; deploy Coolify pendiente. Continúa [bitacora-03sep-multiplicador-vip-speaker.md].

## Pedido y decisión

Adler: los candidatos con `Tamaño de Negocio` nuevo ya no deben limitarse globalmente a Grande/Mediana; deben entrar si su categoría aparece en `Etapa Cliente Buscada` del sponsor. Los registros anteriores al catálogo Grande/Mediana/Pequeña/Micro siguen exactamente con el fallback de Madurez Exa.

Decisión explícita de Adler: Presencial VIP y Speaker conservan el bypass de tamaño, incluso cuando tienen tamaño nuevo y el sponsor no lo seleccionó. Giro sigue sin bypass.

## Qué cambió

- Capa 1 recibe `sponsor.etapaClienteBuscada` al evaluar tamaño.
- Tamaño nuevo reconocido: Grande, Mediana, Pequeña o Micro. Solo entra si el sponsor lo eligió; selección vacía no deja pasar tamaños nuevos.
- Registro legacy (`tamanoNegocio=null`): sigue entrando únicamente por Madurez Exa Consolidado/PyME. No se cruza con la selección del sponsor.
- Pequeña/Micro no reciben bono de tamaño y no hacen fallback a Madurez Exa aunque Exa esté poblado. Grande conserva +40; Mediana +15.
- Notas explican que Pequeña/Micro están dentro de los tamaños aceptados por ese sponsor. Para un VIP/Speaker admitido por bypass no afirma falsamente que el sponsor aceptó el tamaño.
- El checklist nombra el campo como “Tamaños de empresa buscados”; el nombre técnico en Notion sigue siendo `Etapa Cliente Buscada`.

## Datos de Laura (REST, solo lectura)

Los 11 sponsors activos tienen selección:

- Tiendanube, Reevolution y Envia.com: Grande, Mediana, Pequeña.
- Leadin: Grande, Mediana, Pequeña, Micro.
- Revie, Platica.mx, Flow, Blip, CaaS, Reversso e Infracommerce: Grande, Mediana.

Pool antes del filtro de tamaño: 45 asistentes. Tamaño nuevo: 8 Grande, 0 Mediana, 5 Pequeña, 3 Micro. Legacy: 4 Consolidado, 1 PyME, 1 Temprano y 23 sin tamaño/madurez. VIP/Speaker pueden estar entre los grupos que conservan bypass.

Impacto frente a la regla anterior:

- Tiendanube: 13 → 18; agrega los 5 Pequeña.
- Reevolution: 13 → 18; agrega los 5 Pequeña.
- Envia.com: 13 → 18; agrega los 5 Pequeña.
- Leadin: 13 → 21; agrega 5 Pequeña + 3 Micro.
- Los otros 7 sponsors siguen en 13; no pierden candidatos.

Los 5 Pequeña agregados son PROPIA, NAJJAT, VALCOBA_MX, ASHLEY POSADAS y SKIN SOLUTIONS. Leadin agrega además MISSANGA, KRISTILLA y ASHLEY POSADAS (otro contacto) como Micro.

## Evidencia

Pruebas PASS: `tamano-negocio`, `vip-tamano-negocio`, `sesion-14ago-diffs`, `tamano-speaker`, `multiplicador-canal`, `matchmaking`, `matchmaking-global`, `matchmaking-2026`, `guardar-sugerencia-individual`, `checklist`, `bloqueo-conferencias`. Los mocks de `guardar-sugerencia-individual` y `bloqueo-conferencias` ahora declaran `Grande`/`Mediana` en el sponsor: con selección vacía o texto legacy de madurez, un Grande ya no entra.

Dry-run local contra Laura, `escribirEnNotion:false`, sin crear filas:

- Reevolution: PROPIA Pequeña sube a 720 por área + 11 soluciones; VALCOBA_MX Pequeña a 690 por 10 soluciones. Esto confirma que tamaño habilita el pool, pero la afinidad decide el ranking.
- Envia.com: VALCOBA_MX y SKIN SOLUTIONS Pequeña quedan en 138, cerca de VIP con afinidad parcial (140).
- Tiendanube: ASHLEY POSADAS y SKIN SOLUTIONS Pequeña quedan en 69 por área; Pequeña sin área/solución queda en 0.
- Las explicaciones nombran el tamaño aceptado y no le asignan puntos.

Esos dry-run excluyen los pares que ya tienen las 64 filas `Sugerido` de la corrida anterior. Al recalcular el ranking completo ignorando esas filas, ningún Pequeña/Micro entra hoy al `topN = cuota + 2`: Reevolution deja PROPIA 720 justo debajo de tres VIP en 728; Envia.com deja sus Pequeña 138 debajo del corte 140. Sí quedan elegibles y podrán subir si cambian afinidades, cupos o pares activos; este cambio no les regala puntos ni garantiza top.

## Operación

No se modificó Notion. No se borraron ni regeneraron las 64 sugerencias actuales. Tras el push: redeploy Coolify; después borrar/regenerar `Sugerido` solo si se quiere reemplazar la corrida anterior. Campañas deben permanecer con simulación `true` y envío real `false`.

Capa 2 no cambió: Grande +40, Mediana +15. Pequeña/Micro siguen en 0 de tamaño. El cron no reordena filas `Sugerido`; la siguiente corrida arma otro `topN` con el pool restante.

## Pendientes

- Redeploy Coolify.
- Tras deploy, dry-run Coolify para Leadin/Reevolution/Envia.com antes de volver a correr `sugerir-todos`.
- La regla sigue pendiente de validación con Laura/Liz.
