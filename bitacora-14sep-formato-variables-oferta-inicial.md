# Bitácora 14sep — negritas y cursivas dentro de las variables de la oferta inicial
Handoff. Código gana si esto contradice algo.
14 de septiembre de 2026. Continúa [bitacora-09sep-plantillas-oferta-por-cantidad.md](bitacora-09sep-plantillas-oferta-por-cantidad.md).

## Pedido y decisión

Adler ya había puesto negritas en el **texto fijo** de las cuatro plantillas aprobadas
(`**Fashion Digital Talks 2026.**`, `**reuniones privadas de 20 minutos con expertos,**`),
pero las variables `{{2}}`…`{{5}}` seguían saliendo en texto plano. Decisión de Adler
(14-sep): **empresa en cursiva, soluciones en negrita, nombre del representante sin marcas**.
El subrayado de los nombres en el Word se descarta — WhatsApp no tiene subrayado.

## Qué cambió y por qué

- `parametrosSugerencias` en [`campanas-matchmaking.service.js`](src/services/campanas-matchmaking.service.js)
  envuelve la empresa en `*…*` y el bloque completo de soluciones (incluidos los ` · `)
  en `**…**`. Formato nuevo:
  `1. Alexandro Huerta de la empresa *Reevolution*, expertos en **Analitica / data · CRM / automatizacion**`.
- Se usa la misma convención que ya tiene el cuerpo aprobado en Meta (`**` negrita,
  `*` cursiva). No es la sintaxis clásica de WhatsApp (`*negrita*`, `_cursiva_`): si en la
  prueba real se ven asteriscos literales, hay que cambiar `MARCA_NEGRITA` / `MARCA_CURSIVA`
  y las plantillas, no solo el código.
- La comparación “persona igual a empresa” sigue contra el texto **sin** marcas; si no, ese
  dedupe dejaba de funcionar y salía `Revie de la empresa *Revie*`.
- `CUERPO_BASE_OFERTA` (y la copia del preview one-shot) estaban desfasados del cuerpo real:
  les faltaban los `**` que Adler ya había aprobado en Meta. Era el hallazgo 1 del 8-sep.
  Ahora el presupuesto de 1024 se calcula contra el texto que de verdad se manda.
- **No requiere reaprobar plantillas en Meta**: solo cambia el valor de las variables.
  Las marcas viajan dentro del parámetro; `limpiarParametroPlantilla` no las borra
  (solo quita saltos, tabs y espacios repetidos, que siguen prohibidos).

## Efecto en el tope de 1024

Las marcas cuestan ~8 caracteres por sponsor y el cuerpo fijo creció 8 más. Con el caso real
de Liz y 4 sponsors, el recorte automático ahora deja **3 coincidencias** por sponsor en vez
de 4: cuerpo 985/1024 (el 9-sep eran 987 con 4 en `{{2}}`). Es la regla de siempre —bajar de
una en una antes de soltar a nadie—, no un cambio de alcance. Nadie se queda fuera.

## Operación

Nada que configurar. Banderas siguen en su default seguro
(`CAMPANAS_MATCHMAKING_MODO_SIMULACION=true`, `CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO=false`).
**Pendiente inmediato: Adler manda una prueba a su propio número** para confirmar que WhatsApp
renderiza las marcas y no las muestra crudas. Hasta esa confirmación, no disparar la cola real.

## Evidencia

- `node tests/campanas-matchmaking.manual-test.js`: 13/13. Se actualizaron las cadenas
  esperadas de 5 casos (formato nuevo), sin cambiar ninguna regla de negocio.
- Cuerpos leídos de Meta con `get_template` (MCP de Plática), no de memoria: las cuatro
  `agendar_cita_inicial_aprobado_1`…`_4` siguen `APPROVED`, categoría MARKETING, idioma `es`.
- Caso Liz (4 sponsors, datos del 9-sep) con el build nuevo: plantilla de 4, cuerpo 985/1024.

  ```
  {{1}} Liz
  {{2}} 1. Alexandro Huerta de la empresa *Reevolution*, expertos en **Analitica / data · CRM / automatizacion · Customer experience**
  {{3}} 2. Magali Parra de la empresa *CaaS*, expertos en **Customer experience · Estrategia de marketing digital · Plataforma eCommerce**
  {{4}} 3. Renata Raya de la empresa *Revie*, expertos en **CRM / automatizacion · Customer experience · Plataforma eCommerce**
  {{5}} 4. Mauricio Ledezma de la empresa *Leadin*, expertos en **Customer experience · Estrategia de marketing digital**
  ```

- No se envió ningún WhatsApp ni se escribió Notion en este turno.

## Pendientes

- Confirmar el render real en el teléfono de Adler. Si sale crudo: `*empresa*` → `_empresa_`
  y `**soluciones**` → `*soluciones*`, y el texto fijo de las cuatro plantillas se reaprueba.
- El preview `preview-oferta-liz-08sep.js` ya no encuentra filas `Aprobado` de Liz en el Notion
  de producción (0 filas). Para volver a usarlo hay que apuntarlo a un asistente con filas
  aprobadas; no es una regresión del código.
