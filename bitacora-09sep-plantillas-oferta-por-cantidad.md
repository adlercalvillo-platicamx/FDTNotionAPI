# Bitácora 09sep — oferta inicial con plantilla por cantidad de sponsors
Handoff. Código gana si esto contradice algo.
9 de septiembre de 2026. Sin commit. Continúa [bitacora-08sep-preview-plantillas-liz.md](bitacora-08sep-preview-plantillas-liz.md).

## Pedido y decisión

Adler preparó cuatro plantillas para un renglón por sponsor. Después: mandar **todas** las
coincidencias, no topar en 2. El 1024 sigue como red (todas → 2 → 1 → nombres → soltar
sponsor). El tope de 2 no era de Meta por variable.

## Qué cambió

- Plantillas verificadas como `APPROVED` en el workspace Fashion Digital Talks:
  `agendar_cita_inicial_aprobado_1`, `_2`, `_3` y `_4`.
- `{{1}}` conserva el primer nombre normalizado.
- Cada sponsor ocupa una variable propia (`{{2}}`…`{{5}}`) y usa:
  `1. Persona de la empresa Empresa, expertos en Solución 1 · Solución 2`.
- Las soluciones son **todas** las coincidencias entre lo ofrecido y lo buscado, sin `Otro`.
  El tope de 2 era un recorte nuestro contra 1024, no un límite de Meta por variable. El
  representante conserva nombre + apellido paterno.
- Los saltos de línea viven en el cuerpo fijo aprobado. Cada parámetro se sanea para no mandar
  saltos ni tabs. Aunque el ejemplo guardado en Meta muestra tab después del número, el backend
  manda un espacio normal para evitar el error `#100`.
- El resguardo de 1024 prueba primero todas las coincidencias y luego baja el tope por sponsor
  **de una en una** hasta dejar solo nombres; como último recurso quita al sponsor de menor
  score y cambia a la plantilla correspondiente. Bajar directo de "todas" a 2 desperdiciaba
  espacio: con Liz y 4 sponsors, 2 soluciones daban 885 y 3–4 caben en 987.
- El reporte `sugerenciasInformadas` une con saltos las variables realmente enviadas; esos
  saltos son solo para el reporte, no viajan dentro de un parámetro.
- El preview de Liz se actualizó al contrato de variables separadas; sigue siendo solo lectura
  y no se reejecutó en este turno.

## Operación

Configurar en Coolify, sin duplicados:

```env
PLATICA_TEMPLATE_OFERTA_INICIAL_1=agendar_cita_inicial_aprobado_1
PLATICA_TEMPLATE_OFERTA_INICIAL_2=agendar_cita_inicial_aprobado_2
PLATICA_TEMPLATE_OFERTA_INICIAL_3=agendar_cita_inicial_aprobado_3
PLATICA_TEMPLATE_OFERTA_INICIAL_4=agendar_cita_inicial_aprobado_4
CAMPANAS_MATCHMAKING_MODO_SIMULACION=true
CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO=false
```

Primero redeploy y simulación nominal. No se hizo ningún envío ni escritura en Notion en este
turno. Para envío real se mantienen las dos barreras habituales; no reejecutar el one-shot de
limpieza sin revisar su historial y la cola.

## Evidencia

- Las cuatro plantillas: categoría `MARKETING`, idioma `es`, origen Meta, estado `APPROVED`.
- `node tests/campanas-matchmaking.manual-test.js`: pasa selección 1–4, formato, saneamiento,
  todas las coincidencias cuando caben, recorte por 1024 y estados idempotentes.
- `GET /health` 200 tras cada redeploy (9-sep 21:35 y 21:47 UTC).
- `preview-oferta-liz-08sep.js` (solo lectura, Notion de Laura): 4 sponsors →
  `agendar_cita_inicial_aprobado_4`, cuerpo 987/1024; 3 sponsors →
  `agendar_cita_inicial_aprobado_3`, 923/1024.
- Simulación contra Coolify **con el build final** (autorizada por Adler): se limpió
  `Última Campaña Enviada` de Liz, se disparó el webhook y se restauró el valor
  (`Oferta inicial`, `2026-09-04T18:54Z`) en el mismo turno. Resultado
  `modoSimulacion: true`, `simulados: 1`, `enviados: 0`, sin errores. Plantilla elegida
  `agendar_cita_inicial_aprobado_4` y cuatro variables, una por sponsor:

  ```
  {{1}} Liz
  {{2}} 1. Alexandro Huerta de la empresa Reevolution, expertos en Analitica / data · CRM / automatizacion · Customer experience · Estrategia de marketing digital
  {{3}} 2. Magali Parra de la empresa CaaS, expertos en Customer experience · Estrategia de marketing digital · Plataforma eCommerce
  {{4}} 3. Renata Raya de la empresa Revie, expertos en CRM / automatizacion · Customer experience · Plataforma eCommerce
  {{5}} 4. Mauricio Ledezma de la empresa Leadin, expertos en Customer experience · Estrategia de marketing digital
  ```

  La simulación no escribe Notion ni llama a Plática: ninguna fila de Liz cambió de estado.

## Pendientes

- Liz volvió a quedar con `Última Campaña Enviada = Oferta inicial`: si se quiere que reciba
  la oferta nueva, hay que limpiar ese select a propósito.
- Antes de envío real, nombrar y revisar todos los destinatarios de la cola.
- El `.env` local todavía tiene la variable vieja `PLATICA_TEMPLATE_OFERTA_INICIAL`, que ya
  nadie lee. En simulación no estorba porque el service cae al nombre por default.
