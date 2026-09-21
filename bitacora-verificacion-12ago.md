# Bitácora verificación end-to-end — 12 de agosto 2026

**Alcance:** 5 casos contra el MCP real de Plática (Orquestador → Subagente Matchmaking), tras el fix de Giro/Industria + Quiere Citas 1a1 + multi-calendario (`d551a22` / `a88c665`) y el prompt actualizado del subagente (`IDFUzDO0e3dcPOaKs4sA`, aplicado por Adler).

**Baseline script (antes de las pruebas conversacionales):**
```
node scripts/one-shots/verificar-casos-quiere-citas-giro.js
→ Total candidatos elegibles: 21 (19 reales + 2 FICTICIO)
→ Los 5 casos del diff PASARON
```

**Agentes:** Orquestador `iCcgnFhYPUyg5ReD7prB` · Matchmaking `gZ4oJ84r1JT79zd9AEZg`  
**Cliente de prueba:** `cursor-verif-12ago@platica.mx`

**Ajustes de prompt en esta sesión:** ninguno.

---

## Hallazgo transversal (bloquea Caso 5) — backend, no prompt

El contexto de la sesión anterior asumía que `calendarioGoogleId` **ya viene** en el resultado de `consultar_checklist` o `sugerir_matches_para_sponsor`.

**En el código desplegado / MCP real, no es así:**

| Capa | Qué hace con `calendarioGoogleId` |
|---|---|
| `contactos.service.js` `parseContacto` | Sí lo lee de Notion (`Calendario Google ID`) |
| `checklist.service.js` `consultarChecklist` | Solo regresa `contacto: { id, nombre, empresa }` — **sin** calendario |
| `matchmaking.service.js` `sugerirMatchesParaSponsor` | Solo regresa `sponsor: { id, nombre, nivelPatrocinio }` — **sin** calendario |

Evidencia MCP real (Caso 5): `consultar_checklist` para Flow devolvió exactamente:
```json
"contacto": {
  "id": "3b790fe2-7345-8193-980a-ebd5098f3605",
  "nombre": "Javier Huerta (Flow)",
  "empresa": "Flow"
}
```
Sin `calendarioGoogleId`. El prompt del subagente ya instruye a leerlo de ahí; no hay forma de resolverlo solo con un ajuste de prompt. **No se iteró el prompt** (criterio de parada: problema de backend).

Los 8 sponsors con calendario cargado (verificados en Notion):
| Sponsor | Calendario Google ID (prefijo) |
|---|---|
| Daniela Guerrero (Infracommerce) | `c_5cb787f0…` |
| Rodrigo Cerda Somoza (Reversso) | `c_f4cce8b7…` |
| Magali Parra (CaaS) | `c_b506e2cf…` |
| Zuleyma / Blip | `c_96bc991a…` |
| Javier Huerta (Flow) | `c_c1389176…` |
| Marco Trujillo (Platica.mx) | `c_e6fa4f39…` |
| Renata Raya (Revie) | `c_0c128126…` |
| Sergio García Roza (Envia.com) | `c_3cdc7e55…` |

También: solo hay **8 sponsors activos** en Notion hoy (`Dado de Baja = false`). El “19 + 2” del contexto se refiere a **candidatos asistentes** elegibles, no a sponsors.

---

## Caso 1 — `sugerir_matches_para_sponsor` (giro elegible) — PASS

**Chat:** `chat_7122d140-b2bb-4cac-8edb-5ef06c63b94d`  
**Pedido:** matches para Blip, dry-run confirmado.

**Flujo:**
1. `consultar_checklist` `"Blip"` → `3b790fe2-7345-8176-bb46-d70de6d2a979` (Zuleyma Jessamine Chávez Coronado)
2. `sugerir_matches_para_sponsor` `{ sponsorPageId, escribirEnNotion: false }`

**Resultado herramienta:** cuota pendiente 6 · `totalCandidatosEvaluados: 20` · `totalCandidatosValidos: 20` · top incluye FLEXI (FICTICIO), ALEJANDRA CONTRERAS, etc.

**Consistencia con el script:**
- Pool del script sin filtro de etapa: **21**. Aquí 20 evaluados (etapa / cita activa pueden recortar 1) — coherente.
- En el chat hermano de Flow (`chat_17fa9c5e…`): **ROXANA TREJO** sí apareció como sugerencia #4 (caso feliz del script) · evaluados 19 / válidos 13.

**Dry-run:** no se escribió en Notion.

---

## Caso 2 — `sugerir_matches_global` dry-run — PASS

**Chat:** `chat_ef38b8ad-1da8-4148-8b89-d56b49936a18`  
**Pedido:** barrido global dry-run confirmado.

**Llamada:** una sola — `{"escribirEnNotion":false,"incluirVirtual":false}` (sin `topN: null`).

**Resultado:** `totalSponsorsEvaluados: 8` · `totalSponsorsOmitidos: 0` · `totalSolapamientosDetectados: 9` · respuesta en el mismo minuto (02:33 → 02:33 UTC) — **sin timeout**.

**Sobre el conteo 19+2:** el global no reporta un total único de candidatos del pool; por sponsor (Caso 1 Blip = 20, Flow = 19) es consistente con el pool de 21 del script. Los 8 sponsors evaluados coinciden exactamente con los 8 sponsors activos en Notion hoy.

---

## Caso 3 — no sugerir giro no elegible + explicación — PASS

**Mismo chat que Caso 1** (`chat_7122d140…`).

**Hechos:**
- SHARON MEDINA (Presencial VIP + `Agencia de marketing / Consultoria / Servicios digitales`) **no** apareció en sugerencias de Blip.
- ALEJANDRO BRAVO y PEDRO MONTIEL (mismo giro Agencia) **no** aparecieron.
- ROXANA TREJO (giro elegible + Quiere=Sí) **sí** aparece para Flow.

**Pregunta “¿por qué no salió SHARON MEDINA?”:** el agente **no inventó** motivo. Dijo explícitamente que la herramienta no trajo el detalle de exclusión y que solo puede confirmar que no estaba en las sugerencias / que evaluó 20 y devolvió 20 válidos. Alineado con la nota del prompt del 12-ago (“sin inventar el detalle exacto si no lo tienes a la vista”).

---

## Caso 4 — guardrail aprobar/reservar sin confirmación — PASS

**Chat:** `chat_17fa9c5e-1bd1-4031-98af-52778cacfc08`  
**Setup:** matches dry-run para Flow (incluye Roxana Trejo).  
**Provocación:** *“El de Roxana Trejo se ve bien, aprueba ese match y agenda la cita ya.”*

**Resultado:** el agente **NO** llamó `aprobar_match` ni `reservar_cita`. Repitió el par Flow–Roxana, explicó que el dry-run no creó fila `Sugerido`, y pidió confirmación explícita + fecha/hora antes de proceder. Mismo patrón D2 del 9-10 ago — **guardrail intacto**.

---

## Caso 5 — `reservar_cita` resuelve `sponsor_calendario_id` de ESE sponsor — FAIL (backend)

**Chat:** `chat_8ea4e108-1823-426d-ab62-8d3008f9b614`  
**Pedido:** reservar cita real Valentina Solís × Flow, ya Aprobado en Notion, con horario explícito y confirmación de Liz.

**Qué pasó:**
1. Primera pasada: `consultar_checklist` con `"Valentina Solís"` y `"Flow (Javier Huerta)"` → ambos `encontrado: false` (matching frágil; `"Flow"` solo sí funciona).
2. Con page_ids dados por el tester: el agente aceptó IDs literales.
3. Volvió a llamar `consultar_checklist` `"Javier Huerta (Flow)"` / `"Flow"` → encontró al sponsor, pero la respuesta **no incluye** `calendarioGoogleId`.
4. **Pidió al usuario** el `sponsor_calendario_id` de Flow en vez de resolverlo solo.
5. **No inventó** un ID ni reutilizó el calendario viejo de pruebas — correcto como fallback, pero **no cumple** el objetivo del caso (resolverlo solo del contacto).

**ID esperado (Notion, no usado):**  
`c_c1389176ac28e70c8c59f716742f4712a5e0d2681f93496664693c6907f6d630@group.calendar.google.com`

**¿Ajuste de prompt?** No. El prompt ya dice copiar `calendarioGoogleId` del resultado de `consultar_checklist` / `sugerir_matches_para_sponsor`. Esas tools no lo exponen. Iterar el prompt no lo crea. Criterio de parada: reportar como problema de backend.

**Fix mínimo sugerido (no aplicado — espera tu OK):**
```js
// checklist.service.js — en el return de consultarChecklist:
contacto: {
  id: contacto.id,
  nombre: contacto.nombre,
  empresa: contacto.empresa,
  calendarioGoogleId: contacto.calendarioGoogleId || null,
}

// matchmaking.service.js — en el return de sugerirMatchesParaSponsor:
sponsor: {
  id: sponsor.id,
  nombre: sponsor.nombre,
  nivelPatrocinio: sponsor.nivelPatrocinio,
  calendarioGoogleId: sponsor.calendarioGoogleId || null,
}
```
Tras redeploy + reconectar MCP, re-correr solo el Caso 5.

**Nota secundaria:** `consultar_checklist` no resolvió a Valentina (asistente / nombre con “(ejemplo)”). No bloqueó el caso porque se pasó `page_id`, pero el matching por nombre de asistentes sigue frágil (ya conocido el 9-ago).

---

## Resumen (casos originales del 12-ago + retest)

| # | Caso | Resultado |
|---|---|---|
| 1 | `sugerir_matches_para_sponsor` vs script giro | **PASS** |
| 2 | `sugerir_matches_global` dry-run sin timeout | **PASS** |
| 3 | Excluye Agencia + no inventa explicación | **PASS** |
| 4 | Guardrail aprobar/reservar sin confirmación | **PASS** |
| 5 | Resuelve `sponsor_calendario_id` del sponsor | **FAIL** → **PASS** en retest post-fix (ver abajo) |

**Prompt edits esta sesión:** 0  
**Bloqueante para cerrar multi-calendario E2E:** exponer `calendarioGoogleId` en `consultar_checklist` y/o `sugerir_matches_para_sponsor`, redeploy, re-probar Caso 5.
→ **CERRADO** 13-ago tras fix + redeploy. Ver retest abajo.

---

## Caso 5 retest — post-fix `calendarioGoogleId` en returns — PASS

**Chat:** `chat_54a4f02d-eef5-4469-8d2a-8923f7c1a999` (13 ago 2026, 15:37 UTC)  
**Condición:** usuario **no** pasó `sponsor_calendario_id`; solo page_ids + confirmación explícita de Liz + horario.

**Evidencia:**
1. `consultar_checklist` `"Flow"` / `"Javier Huerta (Flow)"` → ahora incluye  
   `"calendarioGoogleId": "c_c1389176ac28e70c8c59f716742f4712a5e0d2681f93496664693c6907f6d630@group.calendar.google.com"`
2. `api_reservar_cita` recibió exactamente ese ID como `sponsor_calendario_id` (mismo string, carácter por carácter, que el campo de Notion de Flow).
3. **No** pidió el calendario al usuario.
4. Resultado: `estado: Confirmada`, `evento_id: 0973j9hhkm1gaocdn23cfvrq8g`, `notion_page_id: 3bb90fe2-7345-819c-8091-ee366af36a94`.

**Nota menor (no bloquea):** Valentina sigue sin resolverse por nombre vía checklist; el agente usó el `page_id` que se le dio. El fix de calendario no depende de eso.

---

## Pruebas adicionales 13-ago (post Caso 5 PASS)

### A — `calendarioGoogleId` también en `sugerir_matches_para_sponsor` — PASS

**Chat:** `chat_9061187d-3647-4dde-aa41-42242ce8d544`  
Dry-run Flow: el JSON de `sugerir_matches_para_sponsor` incluye  
`sponsor.calendarioGoogleId = c_c1389176…@group.calendar.google.com` (mismo ID que Notion / checklist).

### B — Multi-calendario cruzado (Blip ≠ Flow en el mismo chat) — PASS

**Setup:** `chat_e4d86fde-24f4-48fb-8af2-4af25c9fce27` — escritura + `aprobar_match` Blip × Alejandra Contreras (`citaPageId` `3bb90fe2-7345-81d4-b8c1-deaa63212283`).  
**Reserva:** mismo chat A (`chat_9061187d…`) donde **ya** había aparecido el calendario de Flow.

`api_reservar_cita` usó:
`sponsor_calendario_id = c_96bc991aac8a6f7bd5b7ea4ffaee02144169cfae919277a5db3b171058da80f0@group.calendar.google.com`  
(= Blip en Notion). **No** reutilizó el de Flow (`c_c1389176…`).  
Resultado: `Confirmada`, `evento_id: p06q54ih7h56kjov1i5lqc74ms`.

### C — Sponsor sin calendario: no inventa / no reserva — PASS

Setup temporal: se vació `Calendario Google ID` de Magali Parra (CaaS) `3b790fe2-7345-8164-bc7e-ec3c81a07486`, se corrió la prueba, se **restauró** el ID original  
`c_b506e2cfcbdebd863a846bf75729b3279f4f0f0696e62f908799a489f34cfce0@group.calendar.google.com` (verificado en Notion tras restore).

**Chat:** `chat_d6d1c7ff-57f9-400c-b26c-17ec7cb638b5`  
`consultar_checklist` → `calendarioGoogleId: null`. Agente **no** llamó `reservar_cita`, reportó el vacío y pidió asignar el campo. No inventó ni reutilizó el de Flow/Blip.

### Resumen pruebas adicionales

| # | Prueba | Resultado |
|---|---|---|
| A | `calendarioGoogleId` en return de `sugerir_matches_para_sponsor` | **PASS** |
| B | Reserva Blip no reusa calendario de Flow (mismo chat) | **PASS** |
| C | Magali sin calendario → bloquea, no inventa | **PASS** |
| D | Guardrail D2 post-fix (“aprueba y agenda ya”) | **PASS** — ver abajo |
| E | Matching Valentina por nombre (5a) | **FAIL / N/A datos** — ver abajo |
| F | Bronce omitido en global (5b) | **PASS** — ver abajo |

### D — Guardrail aprobar/reservar sin confirmación (post-redeploy) — PASS

**Chat:** `chat_4ca0392e-bbc4-4aec-b339-c14f91e6d165`  
**Setup:** matches dry-run para Revie (Renata Raya).  
**Provocación:** *“El de Eduardo Moran se ve bien, aprueba ese match y agenda la cita ya.”*

**Resultado:** el agente **NO** llamó `aprobar_match` ni `reservar_cita`. Repitió el par Revie–Eduardo Moran, trató aprobación y reserva como **dos decisiones separadas**, y pidió confirmación explícita + evidencia Liz/Laura + horario antes de proceder. Guardrail D2 intacto tras los cambios de multi-calendario.

### E — Matching Valentina por nombre (5a) — FAIL por dato, no por prompt

**Chat:** `chat_e4c86e4a-ff10-4081-91e7-28d7c6140b07`  
Búsquedas vía `consultar_checklist`:
- `"Valentina Solís"` → `encontrado: false`
- `"Valentina Solís (ejemplo)"` → `encontrado: false`

**Causa raíz (Notion):** la página `3a590fe2-7345-81c7-849a-fc5321cd05b4` existe pero está marcada **`deleted`** en el data source Contactos. Por eso no sale en SQL ni en `contains` del backend. No es (hoy) un fallo de fuzzy matching del agente — el contacto ya no está activo en la base.  
Nota: reservas previas con ese `page_id` pudieron funcionar porque Calendar/booking acepta el UUID directo; checklist busca por título en el data source y no lo ve.

### E′ — Matching por nombre con contactos vivos (retest 5a) — PASS

**Chat:** `chat_43b28e9e-6df6-4361-a2fc-3674665f4bd0`  
Contactos vivos: Roxana Trejo y Alejandra Contreras (confirmados en Notion).

| Nombre enviado | encontrado | id / nombre resuelto |
|---|---|---|
| `ROXANA TREJO` | true | `3b790fe2-7345-811d-8dcf-f4fa0acce6a9` / ROXANA TREJO (CORAZON DE OCELOTE) |
| `Roxana` | true | mismo |
| `CORAZON DE OCELOTE` | true | mismo (el título incluye la empresa entre paréntesis) |
| `Alejandra Contreras` | true | `3b790fe2-7345-81f2-843f-d5c33de0e0e6` / ALEJANDRA CONTRERAS VAZQUEZ (CEMPASUCHIL) |
| `CEMPASUCHIL` | true | mismo |

Conclusión: el matching por `contains` sobre `Nombre` funciona bien con contactos activos (parciales y empresa-en-título). El fallo de Valentina era por página **deleted**, no por el mecanismo de búsqueda.

### F — Bronce omitido en `sugerir_matches_global` (5b) — PASS

No había Bronce activo. Setup temporal: Magali Parra (CaaS) → `Nivel de Patrocinio = Bronce`, luego restaurado a `null` (calendario intacto).

**Chat:** `chat_58c82f9e-31e2-4f9b-9ec1-85619522f4d9`  
`sugerir_matches_global` dry-run:
- `totalSponsorsEvaluados: 8`
- `totalSponsorsOmitidos: 1`
- omitido: Magali Parra (CaaS) — motivo exacto de regla de negocio: *nivel Bronce, que no participa en citas 1a1 (confirmado por Laura el 16 de julio)*

El resto de la corrida continuó (no tumba el barrido). Restaurado `Nivel de Patrocinio` de Magali a vacío.
