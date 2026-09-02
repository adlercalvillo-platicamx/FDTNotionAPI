# Bitácora 02sep — Verificar vistas de Contactos en Laura
Handoff. Código gana si esto contradice algo.
2 de septiembre de 2026. Continúa [bitacora-01sep-tamano-speaker-carga-laura.md].
2 de septiembre de 2026. Continúa [bitacora-01sep-tamano-speaker-carga-laura.md].
Verificación en lectura; Adler autorizó después borrar las 13 pestañas viejas.

## Pedido

Adler creó a mano las 3 fórmulas de Contactos. Pedido: verificar que las 15
vistas de pruebas sigan útiles en Laura con `Tamaño de Negocio` (texto),
`Incluye Entrada Evento` (select Sí/No), ticket `Speaker` y esas fórmulas.

Método: `GET /v1/views?database_id=` de Contactos Laura
(`3b162dda-199a-80a5-831e-efa14b9748bf`), retrieve de cada vista, query de
cada filtro contra el data source, y muestreo de páginas. Script de un solo
uso: `scripts/one-shots/verificar-vistas-laura-02sep.js`. Dump con PII en
`.local-backups/verificar-vistas-laura-02sep.json` (ignorado, no subir).

## Inventario (no es el mismo que las 15 de pruebas)

Al verificar había **15 nombres únicos** y **28 pestañas** (13 duplicadas).
Tras el borrado autorizado quedan **15 pestañas**, una por nombre. `Default
view` y `Enriquecimiento (Exa)` no tenían copia.

| Frente a las 15 de pruebas | En Laura |
|---|---|
| Falta | **Board — Sponsors por Faltantes** |
| Extra (también está en `create-fdt-views.js`) | **Revisión manual (enriquecimiento agotado)** |
| Extra no pedido | 13 pestañas duplicadas con el mismo nombre y el mismo filtro |

Los duplicados respondían igual al query. Adler pidió quitar las más
antiguas: se borraron las 13 del **4-ago** (`3b26…`) y se dejaron las del
**14-ago** (`3bc6…`). Confirmado con listado posterior: 15 pestañas, 0
nombres repetidos. Default view y Enriquecimiento (Exa) no se tocaron.
El DELETE de vistas no se deshace por API.

Ningún filtro de las 28 pestañas apunta a `Tamaño de Negocio` ni a
`Incluye Entrada Evento`. Notion no dejó un `checkbox_is` sobre el select
nuevo. Los filtros que sí hay (`Categoria`, `Formato Registro`, `Es VIP`,
`Es Speaker`, `Dado de Baja`, `Checklist Completado`, `Estado Funnel`)
siguen siendo del tipo actual y el query no devolvió error.

## Fórmulas (Adler, UI)

Expresiones iguales a las de pruebas. Sobre los 8 sponsors:

| Sponsor | Min | Count | Faltantes | Rango | Coherente |
|---|---|---|---|---|---|
| Daniela Guerrero (Infracommerce) | 4 | 1 | 3 | 1-3 faltantes | sí (`rel:7`) |
| Sergio García Roza (Envia.com) | 2 | 0 | 2 | 1-3 faltantes | sí |
| Rodrigo Cerda Somoza (Reversso) | 2 | 0 | 2 | 1-3 faltantes | sí |
| Renata / Marco | 4 | 0 | 4 | 4+ faltantes | sí |
| Javier / Zuleyma | 6 | 0 | 6 | 4+ faltantes | sí |
| Magali Parra (CaaS) | vacío | 0 | 0 | Al día | n/a (sin cuota) |

Hay al menos un sponsor con citas reales y números coherentes. Las columnas
de fórmula **sí se ven en Default view**. **No están visibles en ninguna de
las dos pestañas Sponsors** — ahí solo se ve `Citas Minimas Prometidas`.
Sin el board, `Rango Faltantes` no se usa para agrupar.

## Las 15 pedidas

1. **Default view** — **OK**. Tabla, sin filtro, 105/105 filas. Muestra
   `Tamaño de Negocio` (texto, p. ej. `Grande - mas de 250 empleados` y
   textos de etapa del CSV), `Incluye Entrada Evento` (`Sí`/`No`, no
   checkbox), `Ticket / Tipo Asistencia` (incluye `Speaker`) y las 3
   fórmulas (números, no error).
2. **Asistentes** — **OK**. Filtro `Categoria = Asistente`, 96 filas.
   Pascaline Leon entra (`Categoria=Asistente`, ticket `Speaker`, checkbox
   `Es Speaker=false`). Columna `Ticket` visible; **`Tamaño de Negocio` no
   está visible** en esta pestaña (el valor sí existe en la página).
3. **VIP** — **OK (vacía, esperado)**. Filtro `Es VIP = true` (checkbox), 0
   filas. 0 checkboxes true en Laura; 13 `Presencial VIP` no aparecen, igual
   que el patrón ya confirmado. Filtro no se rompió. `Ticket` sigue visible.
4. **Asistentes Ticketópolis 2026** — **OK con hueco de columnas**. Filtro
   `Asistente` AND `Formato Registro=2026`, 96 filas, query sin error.
   `Incluye` en datos es select `Sí`/`No`. `Ticket` visible e incluye
   `Speaker`. **`Tamaño de Negocio` e `Incluye Entrada Evento` no están
   visibles** (al recrear el select, el id nuevo `>Byg` no quedó en el
   display; el id actual de Tamaño `PG[K` tampoco). Hay 5–6 columnas
   huérfanas (property_id que ya no existe: `sjfM`, `vEAq`, `>tWY`, `\=OG`,
   `Zw=d`, y en una copia `Tf\j`). No las quité.
5. **Enriquecimiento (Exa)** — **OK con hueco de columnas**. Sin filtro,
   105 filas. No muestra `Tamaño de Negocio`. 2 columnas huérfanas
   (`Dq{O`, `OeRh`), coherente con campos Exa de tamaño que no existen en
   el schema de Laura.
6. **Legacy pre-2026** — **OK (vacía por datos)**. Filtro
   `Formato Registro = Legacy pre-2026` sigue siendo select y funciona. 0
   filas: la carga del 1-sep sobrescribió `Formato Registro` a `2026`.
   `Ticket` visible. No hay Speaker en legacy porque no hay filas.
7. **Sponsors** — **OK con hueco de columnas**. Filtro `Categoria=Sponsor`,
   8 filas. Fórmulas calculan (Daniela 4−1=3). **Las columnas Count /
   Faltantes / Rango no están en el display** de ninguna de las dos
   pestañas. 5 columnas huérfanas por pestaña.
8. **Board — Sponsors por Faltantes** — **NO EXISTE EN LAURA**. No hay
   ninguna vista `board`. `Rango Faltantes` sí calcula (`Al día` /
   `1-3 faltantes` / `4+ faltantes`), así que un board nuevo sí tendría
   grupos; no lo creé.
9. **Speakers** — **OK**. Filtro checkbox `Es Speaker=true`, 1 fila: Sergio
   García Roza (sponsor). Pascaline **no** sale aquí (ticket Speaker ≠
   checkbox). Distinción ya señalada.
10. **Aliados** — **OK (vacía por datos)**. Filtro `Categoria=Aliado`, 0 filas.
11. **Prensa** — **OK**. 1 fila: Elizabeth Salinas.
12. **Comite/Team** — **OK (vacía por datos)**. 0 filas.
13. **Dados de Baja** — **OK (vacía por datos)**. Checkbox, 0 filas.
14. **Checklist Pendiente** — **OK**. Sponsor o `Es Speaker`, checklist
    incompleto; 8 filas (los 8 sponsors).
15. **Prospección (Agente 3)** — **OK**. Filtro de funnel/baja intacto. 105
    filas porque `Estado Funnel` vacío cumple `does_not_equal Registrado`.

## Extra (no de las 15)

- **Revisión manual (enriquecimiento agotado)** — queda 1 (la del 14-ago).
  Filtro `Intentos Enriquecimiento (Exa) ≥ 3`, 0 filas. No rota.

## Limpieza de duplicados (Adler, 2-sep)

`DELETE /v1/views/{id}` sobre las 13 del 4-ago; HTTP 200 las 13. Quedan 15
pestañas, una por nombre. No se tocó pruebas.

## Qué sigue abierto

- Crear el board por `Rango Faltantes`.
- Mostrar Count / Faltantes / Rango en Sponsors.
- Mostrar `Tamaño de Negocio` e `Incluye Entrada Evento` en Asistentes /
  Ticketópolis / Exa.
- Columnas huérfanas en las vistas que quedan.

Nada de WhatsApp, SMTP ni Coolify.
