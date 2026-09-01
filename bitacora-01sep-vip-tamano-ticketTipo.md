# Bitácora 01sep — VIP de tamaño lee `ticketTipo`, no el checkbox `Es VIP`

Handoff. Código gana si esto contradice algo.
Fecha: 1 sep 2026. Corrige el fix del 31-ago. Continúa [bitacora-31ago-buscar-contacto-vip-tamano.md](bitacora-31ago-buscar-contacto-vip-tamano.md). HEAD al arrancar: `539ec91`.

## Pedido

Adler corrió matchmaking el 1-sep y ningún boleto Presencial VIP salió sugerido. El filtro de tamaño leía `candidato.esVip` (checkbox `Es VIP`), que está en false en todos los VIP reales. Debía leer `Ticket / Tipo Asistencia = Presencial VIP`, igual que `calcularScore`.

## Qué cambió y por qué

Una condición en `esCandidatoPorTamanoNegocio`: `ticketTipo === 'Presencial VIP'`. Giro no se tocó. El checkbox `Es VIP` sigue en Notion; este filtro ya no lo usa.

## Evidencia tests

vip-tamano-negocio 6/6 (incluye checkbox `Es VIP` sin boleto VIP → fuera). Baselines matchmaking Carlos 260 / Laura 1320. Batería `tests/*.manual-test.js` PASS (no corrí SMTP real ni smoke de mesa contra Notion).

## Notion de pruebas (lectura, código local post-fix)

Query Asistente + `Presencial VIP`: **15** filas (Adler mencionó 13; hay 2 de más vs ese conteo, p. ej. contactos de prueba). Ninguna dada de baja. **Checkbox `Es VIP` = true: 0.** **Pasan el filtro de tamaño: 15/15.**

Giro (no se tocó):
- Elegible poblado: **2** (Adler Calvillo, Samantha Rivas) → entran a Capa 1.
- Vacío: **10**.
- Otro giro: **3**.

Dry-run `sugerirMatchesParaSponsor` Platica.mx, `escribirEnNotion: false`: `totalCandidatosEvaluados=4`, `validos=0`, 0 sugerencias. Los 4 del pool de giro+tamaño son Adler, Sam (ambos Presencial VIP **con Tamaño Grande**, ya pasaban el filtro viejo), Liz y Luis. Los VIP sin giro no aparecen en `evaluados` — es captura de datos, no este bug.

## Operación

Redeploy **manual** Coolify. Hasta entonces el cron sigue con el checkbox. Después del deploy, un `sugerir-todos` no va a “soltar” los ~10 VIP de giro vacío.

## Pendientes

- [ ] Redeploy Coolify (Adler).
- [ ] Giro vacío / no elegible en la mayoría de Presencial VIP: pendiente de captura, no de código.
