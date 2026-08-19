# Bitácora — confirmar reutiliza la fila Aprobado (19 ago 2026)

Reporte **nuevo**, posterior a `bitacora-sugerencia-individual-19ago.md`.  
Cubre el ciclo de vida de `Citas`, títulos por empresa y presentación del subagente. No cambia scoring ni schema.

**Estado `origin/main`:** `a70f546` (este cambio **aún no está commiteado ni pusheado**).  
**Deploy:** Coolify — **no** redeployar hasta que Adler confirme. Workspace de PRUEBAS intacto desde este cambio (Adler limpia filas huérfanas a mano).

---

## 1. Qué cambió respecto al reporte anterior

Adler, en pruebas: al confirmar una cita se creaba bien la fila `Confirmada`, pero **no se quitaba** la fila `Aprobado` del mismo par. El agente seguía ofreciendo ese match.

Causa en código, no en Notion ni en el prompt:

| Antes | Ahora |
|---|---|
| `crearCitaPendiente` siempre hacía `POST /pages` (fila nueva `Pendiente Calendar`) | Si existe `Sugerido`/`Aprobado` del mismo par, **PATCH** esa fila a `Pendiente Calendar` |
| La `Aprobado` quedaba en “Aprobados sin agendar” | Desaparece de esa vista porque **es la misma fila** que pasa a Confirmada |
| Fallo de Calendar sobre fila nueva → `Fallida` | Si se reutilizó el match: **revierte** a `Aprobado`/`Sugerido` (limpia horario y request_id). Fila nueva sigue yendo a `Fallida` |
| Duplicados de matchmaking del mismo par | Tras `Confirmada` / `Confirmada sin notificar`, se **archivan** hermanas `Sugerido`/`Aprobado` (no la fila confirmada) |

Lo que **no cambió**:
- Dry-run de sugerir, score/explicación en backend, `aprobar_match` humano.
- `reservar_cita` sigue fuera del MCP.
- Falla de correo **nunca** revierte una cita ya confirmada (`Confirmada sin notificar`).
- Mutex de un solo proceso, Calendar por HTTP, Notion REST.
- `Match Sugerido` / `Match Aprobado` en Contactos siguen en desuso.

**Contradicción código vs docs (regla 7):** `09-matchmaking-directo-2026-FINAL.md` y el comentario de `buscarSugerenciasPendientesPorSponsor` ya describían **una** fila `Sugerido → Aprobado → Pendiente Calendar → Confirmada`. `reservar_cita` no usaba esa búsqueda y creaba otra fila. Se alineó el código al documento; no se cambió la regla de negocio.

---

## 2. Commit

Ninguno todavía. Diff local (sin commitear):

| Archivo | Qué |
|---|---|
| `src/services/citas.service.js` | `buscarSugerenciasDelPar`, `crearCitaPendiente` promueve, `revertirCitaPendienteAMatch`, `archivarSugerenciasDelPar` |
| `src/services/booking.service.js` | Compensa fallo (revertir vs Fallida); archiva hermanas **después** de `confirmarCita`, sin tumbar la reserva si el archivo falla |
| `tests/email-notificacion.manual-test.js` | Archivo de Aprobado al confirmar; PATCH no POST; mocks de archive/revert |
| `tests/asignacion-mesa.manual-test.js` | Mocks no-op para las funciones nuevas |
| `src/services/contactos.service.js` | Concatena todos los fragmentos de texto de Notion; evita truncamiento silencioso |
| `src/services/matchmaking.service.js` | Retorna empresa del sponsor, etiqueta por empresa y explicación encabezada por empresa |
| `src/mcp/server.js` | Descripciones por empresa; corrige texto obsoleto de `incluirVirtual` |
| `tests/titulos-empresa.manual-test.js` | Multipart, `Empresa × Empresa`, fallback y explicación sin persona |
| `README.md` | Documenta títulos determinísticos y el test nuevo |

---

## 3. Cómo funciona hoy (resumen operativo)

1. Matchmaking guarda `Sugerido` → humano `aprobar_match` → `Aprobado`.
2. `reservar_cita` busca `Sugerido`/`Aprobado` del par (prioriza `Aprobado`).
3. Si hay: misma page_id, horario + mesa + idempotency, `Pendiente Calendar`.
4. Si no hay (reserva sin match previo): `POST` como antes.
5. Calendar OK + Notion `Confirmada` (o `Confirmada sin notificar` si falla el correo).
6. Archiva otras filas `Sugerido`/`Aprobado` del mismo par, si quedaron.
7. Si Calendar o resolución de contactos fallan **antes** de confirmar: match reutilizado vuelve a `Aprobado`/`Sugerido`; fila nueva → `Fallida`.

Filas `Confirmada` + `Aprobado` **ya existentes** en PRUEBAS no se limpian solas. Adler las borra/archiva en Notion.

---

## 4. Tests corridos (19-ago, local, mocks — sin Notion real)

No se corrió `tests/asignacion-mesa.notion-smoke.js` (escribe en PRUEBAS).

| Test | Resultado |
|---|---|
| `tests/email-notificacion.manual-test.js` | PASS (incluye casos nuevos de archivo + promover) |
| `tests/asignacion-mesa.manual-test.js` | PASS (incl. límite 11 mesas) |
| `tests/aprobar-match.manual-test.js` | PASS |
| `tests/guardar-sugerencia-individual.manual-test.js` | PASS |
| `tests/matchmaking.manual-test.js` | PASS (Carlos 0 candidatos en mock; Laura 2) |
| `tests/matchmaking-global.manual-test.js` | PASS |
| `tests/matchmaking-2026.manual-test.js` | PASS |
| `tests/global-cache-citas.manual-test.js` | PASS |
| `tests/sesion-14ago-diffs.manual-test.js` | PASS |
| `tests/disponibilidad.local-smoke.js` | PASS |
| `tests/checklist.manual-test.js` | PASS (Carlos incompleto speaker; Laura completa) |
| `tests/titulos-empresa.manual-test.js` | PASS (multipart, títulos por empresa, fallback) |

Casos borde cubiertos en este cambio: `Confirmada sin notificar` también archiva; Calendar/resolución no convierten un match promovido en `Fallida`; POST solo si no hay sugerencia.

---

## 5. Qué falta para redeploy

1. Adler revisa Notion PRUEBAS y borra/archiva `Aprobado` huérfanas (queda de su lado).
2. Commit de este diff cuando lo pida (no hay hash todavía).
3. Push a `origin/main` **solo con confirmación explícita**.
4. Redeploy **manual** en Coolify (nunca automático).
5. Smoke post-deploy: aprobar un par en PRUEBAS → `reservar_cita` → una sola fila `Confirmada`; vista “Aprobados sin agendar” sin ese par.

No hace falta refrescar la conexión MCP: `reservar_cita` no está expuesta ahí. El prompt del subagente sí se actualizó directamente en Plática y quedó activo.

---

## 6. Títulos y presentación por empresa (11:40–11:45 CST)

Pedido de Adler:
- Sugerencia en Notion: empresa con empresa, no persona con persona.
- Cita agendada: `Cita — Empresa - Empresa`, no `Cita — <request_id>`.
- Resultados de las dos herramientas de sugerencia: mostrar empresas como etiqueta principal.
- Corregir truncamientos observados.

Implementación:
1. `crearCitaSugerida` escribe `Sugerido: <empresa asistente> × <empresa sponsor>`.
2. `reservar_cita` resuelve ambas empresas desde Contactos y usa el mismo título en Notion, Calendar, correo y response: `Cita — <empresa asistente> - <empresa sponsor>`.
3. Si falta `Empresa`, usa `Nombre` como fallback; nunca deja el título vacío.
4. `parsearContacto` antes leía solo el primer elemento de `title`/`rich_text`. Notion puede repartir texto en varios fragmentos; ahora concatena todos. Esta era una causa real posible del truncamiento, independiente del cambio visual a empresa.
5. Las explicaciones generadas por backend empiezan con la empresa candidata. Los returns conservan `nombre` por compatibilidad y agregan/usan `empresa`/`etiqueta`.

Revisión obligatoria del loop de candidatos: `sugerirMatchesParaSponsor` sigue recorriendo todos los candidatos. Solo usa `continue` para clientes actuales y pares con cita activa; no se encontró `break` ni `return` temprano que corte el conjunto.

**Contradicción encontrada y corregida:** `src/mcp/server.js` todavía describía `incluirVirtual` como “modo de excepción” que agregaba virtuales. El código y los documentos dicen que Virtual entra por default desde el 14-ago y que ese parámetro ya no tiene efecto. Se actualizaron las descripciones de ambas tools; tomarán efecto en el MCP servido por este repo después del redeploy manual.

Prompt de Plática:
- Agente: `Agente 1 — Subagente Matchmaking, Citas y Checklist` (`gZ4oJ84r1JT79zd9AEZg`).
- Versión activa final: `4emKGDi0kFZ7kPfswsJB`.
- Regla nueva: presentar `[empresa asistente] × [empresa sponsor]`, persona solo como fallback.
- Transición segura antes del redeploy: el agente manda `Cita — Empresa - Empresa`; después del redeploy el backend normaliza el mismo formato aunque se omita.
- Confirmación de `guardar_sugerencia_individual`: por empresas.

No se escribió ni consultó Notion real para estas pruebas; no hubo cambio de schema, vista ni dato.
