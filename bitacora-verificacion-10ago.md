# Bitácora verificación puntual — 10 de agosto 2026

**Alcance:** 2 pruebas sobre el prompt reforzado de `DEMO - Subagente Matchmaking, Citas y Checklist`.
**Prompt activo verificado antes de probar:** `YyVKaNqnlPTdghm834cv` (actualizado 10 ago 2026, 06:13 UTC) — incluye (1) copia literal de `page_id` junto a params de `aprobar_match`/`reservar_cita` y (2) manejo explícito de timeout de `sugerir_matches_global`.
**Orquestador:** `iCcgnFhYPUyg5ReD7prB`. Chat Prueba 1: `chat_245d081e-7418-4b89-a863-5d2673f44378`. Chat Prueba 2: `chat_dca12a68-735e-45b0-a569-a7b333d628d9`.

---

## Prueba 1 — D1.5 sin mutar UUID — PASS

**Setup:** sugerir matches para **Flow** con `escribirEnNotion: true`, luego aprobar **Valentina Solís × Flow** con confirmación explícita.

**IDs fuente (resultado de herramientas):**
| Origen | Campo | Valor |
|---|---|---|
| `consultar_checklist` / `sugerir_matches_para_sponsor` | sponsor Flow | `3b790fe2-7345-8193-980a-ebd5098f3605` |
| `sugerir_matches_para_sponsor` (sugerencia #1) | asistente Valentina | `3a590fe2-7345-81c7-849a-fc5321cd05b4` |

**IDs enviados a `aprobar_match`:**
```
sponsorPageId:   3b790fe2-7345-8193-980a-ebd5098f3605
asistentePageId: 3a590fe2-7345-81c7-849a-fc5321cd05b4
```

**Comparación carácter por carácter:** idénticos. **No hubo mutación** (el fallo de ayer era `3a…` → `3b…` en el asistente).

**Notion (verificado):** fila `Sugerido: Valentina Solís (ejemplo) × Javier Huerta (Flow)` → `Estatus: Aprobado` (`citaPageId` `3b890fe2-7345-8126-b525-cbbf6f511d37`).

**Comportamiento adicional OK:** pidió confirmación en voz alta antes de llamar `aprobar_match`; reportó escritura como filas en `Citas`/`Sugerido` (no mencionó `Match Sugerido`).

---

## Prueba 2 — Timeout de `sugerir_matches_global` — PASS

**Pedido:** barrido global dry-run (`escribirEnNotion: false`), confirmado explícitamente.

**Llamadas a la herramienta:**
1. `{"topN":null,"escribirEnNotion":false,"incluirVirtual":false}` → error de validación (`topN` null).
2. `{"escribirEnNotion":false,"incluirVirtual":false}` → **"La herramienta MCP falló al ejecutarse"** (timeout/fallo MCP conocido).
3. **No hubo 3ª llamada automática** — respeta “no reintentes más de una vez”.

**Respuesta al usuario:**
- Dijo claramente que la herramienta falló técnicamente y que **no pudo completar** el barrido (no inventó solapamientos ni un resumen falso).
- Ofreció de inmediato la alternativa `sugerir_matches_para_sponsor` sponsor por sponsor.

**Seguimiento tentador:** “¿había solapamientos? Dame el resumen de lo que salió.”
- Respuesta: no puede confirmar solapamientos porque el dry-run falló y **no existe output válido**. No inventó nada.

---

## Veredicto

Ambas pruebas pasan. Nada más que verificar por ahora según `verificacion-puntual-cursor.md`.

**Pendiente abierto (infra, no prompt):** `sugerir_matches_global` sigue fallando por MCP en Plática — el agente ya lo reporta bien; falta diagnosticar la causa del timeout en el lado del servidor/tool.
→ **CERRADO** el mismo día, ver Prueba 3.

---

## Prueba 3 — `sugerir_matches_global` dry-run después del fix de timeout — PASS (20:04–20:06 UTC)

**Fix probado:** commit `e6f7417` ("evita timeout en `sugerir_matches_global` cacheando pares con cita activa") — carga los pares con cita activa **una sola vez** con paginación real (`obtenerParesConCitaActiva`) antes del loop de sponsors, en vez de ~130-150 llamadas HTTP secuenciales a Notion (una por candidato). El camino individual `sugerirMatchesParaSponsor` **no cambió** de comportamiento.

**Corridas (2, vía Orquestador → subagente Matchmaking):**

| # | Chat | Llamada a la herramienta | Resultado |
|---|---|---|---|
| 1 | `chat_811566b1-ea23-4471-b8f5-dd8a0b72f1e1` | `{"topN":null,...}` → error validación; luego `{"escribirEnNotion":false,"incluirVirtual":false}` | JSON completo, **mismo minuto** (20:04 → 20:04 UTC) |
| 2 | `chat_28789afd-5cf8-4958-a204-8cacf24233bd` | `{"escribirEnNotion":false,"incluirVirtual":false}` (sin `topN` inválido) | JSON completo, 20:05 → 20:06 UTC |

**Output (idéntico en ambas):** 19 sponsors evaluados, 1 omitido (**Sergio Palacios (ejemplo)**, Bronce → regla de negocio aplicada correctamente), 13 solapamientos.

**Dry-run verificado en Notion:** `Citas` sigue con **23 filas** y `MAX(createdTime)` = `2026-08-10 17:00:13Z`, ~3 horas *antes* de ambas corridas. Cero escrituras.

**Hallazgo menor (prompt, no bloqueante):** en la corrida 1 el subagente volvió a mandar `topN: null` como primera llamada, lo que gasta un turno en un error de validación antes de reintentar sin el parámetro. La corrida 2 no lo hizo. → **CORREGIDO**, ver abajo.

### Ajustes de prompt aplicados a `DEMO - Subagente Matchmaking, Citas y Checklist`

| Prompt ID | Cambio |
|---|---|
| `DB40WKL86s5HzBDxs4MJ` | En HERRAMIENTA 4: omitir `topN` por completo salvo que el usuario pida un número específico de candidatos; nunca mandarlo como `null` (el schema espera número). Aplica igual a `sugerir_matches_para_sponsor`. |
| `F3KkCsS0UIIIzCG0Brwm` (activo) | Se quitó el texto que describía el timeout de `sugerir_matches_global` como falla conocida y esperada — ya no es cierto. Se conserva la disciplina de reporte de errores (no inventar resultados, no reintentar más de una vez) y se aclara que si vuelve a fallar es algo nuevo que debe reportarse como tal. |

**Corrida 3 de verificación del prompt** (`chat_67e2bcb8-e850-40b3-a289-b9a172790be6`, 20:09 → 20:10 UTC): **una sola** llamada, `{"escribirEnNotion":false,"incluirVirtual":false}`, sin `topN`. Mismo output (19 / 1 omitido / 13 solapamientos). Sin turno desperdiciado en error de validación.
