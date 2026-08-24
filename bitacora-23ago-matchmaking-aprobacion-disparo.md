# Bitácora 23-ago — Matchmaking → aprobación → disparo de campañas

Fuente de trabajo: `prompt-cursor-matchmaking-aprobacion-disparo-v2 (3).md`.
Repo: `adlercalvillo-platicamx/FDTNotionAPI`. HEAD al arrancar y al terminar: `53a15a9` (`feat: hidrata empresas en las sugeridas del asistente`). **No hay commit.** Coolify / producción **no** se tocaron.

---

## 1. Resumen ejecutivo

Laura y Liz pueden seguir aprobando (o rechazando) sugerencias cambiando `Estatus` en Notion. El ranking ya no sube o baja un candidato solo porque el sponsor todavía tenía más citas por cubrir al momento de calcular. Un par marcado `Rechazado` no vuelve a sugerirse solo. Cuando alguien dispare campañas a mano, el sistema agrupa por persona: tres sugerencias nuevas de Ana = un WhatsApp, no tres. Hoy eso corre en **simulación**: arma el mensaje y lo registra, pero **no manda WhatsApp real**. Las plantillas B y C todavía no existen en Meta; la A hay que confirmarla con Sam. El cron de cada 6 horas **no se configuró en Coolify**; solo se documentó que debe pegarle a un endpoint que **ya existía**.

---

## 2. Archivos tocados — lista completa

| Archivo | Tipo | Qué cambió, en 1 línea |
|---|---|---|
| `src/services/matchmaking.service.js` | modificado | El bono de cuota pendiente ya no suma al score; sigue en el detalle/explicación. |
| `src/services/citas.service.js` | modificado | `Rechazado` entra a las dos listas que bloquean un par; helpers de campañas. |
| `src/services/contactos.service.js` | modificado | Lee/escribe `Última Campaña Enviada` y `Fecha Última Campaña`. |
| `src/services/campanas-matchmaking.service.js` | **nuevo** | Agrupa filas `Aprobado` por asistente y elige A/B/C; default simulación. |
| `src/controllers/campanas.controller.js` | **nuevo** | Webhook Notion con secret propio (`timingSafeEqual`). |
| `src/routes/flows.routes.js` | modificado | Monta `POST /notion/enviar-campanas-aprobadas` junto al Flow (antes de `X-API-Key`). |
| `src/mcp/server.js` | modificado | Tool `disparar_campanas_aprobadas` (sin parámetros; 9 tools). |
| `tests/sesion-14ago-diffs.manual-test.js` | modificado | Tres asserts de cuota informativa vs comparable. |
| `tests/rechazado-pares-activos.manual-test.js` | **nuevo** | Mock: `Rechazado` en filtro individual y en caché global. |
| `tests/campanas-matchmaking.manual-test.js` | **nuevo** | Agrupación, simulación C, caso B/C sin confirmada, borde 14 días exactos. |
| `tests/campanas-webhook.manual-test.js` | **nuevo** | 401 sin secret; 200 con secret. |
| `.env.example` | modificado | Vars de webhook, simulación, opt-in real y nombres de plantillas. |
| `README.md` | modificado | Endpoint, cron HTTP externo, 9 tools MCP, cómo probar. |
| `AGENTS.md` | modificado | Fila REST/MCP de campañas + regla de cron externo. |
| `package.json` | **no tocado** | Cero dependencias nuevas. |

**No tocados en esta sesión (aunque aparecen sucios en `git status`):** `bitacora-verificacion-12ago.md` (ya estaba modificado al inicio del chat), markdowns `00-`…`10-`, bitácoras viejas, `scripts/one-shots/`, JSON de pruebas en `tests/_*.json`. No los uses como parte de este trabajo.

---

## 3. Diffs reales y archivos nuevos

### 3.1 `src/services/matchmaking.service.js`

```diff
   OTRA_SOLUCION_TEXTO: 25, // señal débil de texto libre ↔ texto libre
+  // Conservado como referencia histórica (23-ago-2026), pero ya no se suma
+  // al score: la cuota cambia con el tiempo y no mide la calidad del par.
   CUOTA_PENDIENTE_POR_CITA: 15,

   if (cuotaPendiente > 0) {
-    score += cuotaPendiente * PESOS.CUOTA_PENDIENTE_POR_CITA;
     detalle.push(`cuota_pendiente: ${cuotaPendiente} citas por cubrir`);
   }
```

`senales.cuotaPendiente` y `generarExplicacionNatural` no se tocaron: si hay cuota pendiente, el texto sigue mencionándola.

### 3.2 `src/services/citas.service.js` (extractos)

`Rechazado` en el `or` de `existeCitaActivaEntre` y en `ESTATUS_ACTIVOS` (caché de `sugerirMatchesGlobal`).

Helpers nuevos:

```js
async function buscarCitasAprobadasSinCampana() {
  requireDataSourceId();
  const filas = await queryCitasPaginado({
    and: [
      { property: 'Estatus', select: { equals: 'Aprobado' } },
      { property: 'Campaña Enviada', checkbox: { equals: false } },
    ],
  });
  return filas
    .map((fila) => ({
      id: fila.id,
      asistentePageId: fila.properties?.['Contacto Principal']?.relation?.[0]?.id || null,
    }))
    .filter((fila) => fila.asistentePageId);
}

async function obtenerAsistentesConCitaConfirmada() {
  requireDataSourceId();
  const filas = await queryCitasPaginado({
    or: [
      { property: 'Estatus', select: { equals: 'Confirmada' } },
      { property: 'Estatus', select: { equals: 'Confirmada sin notificar' } },
    ],
  });
  const asistentes = new Set();
  for (const fila of filas) {
    for (const relacion of fila.properties?.['Contacto Principal']?.relation || []) {
      asistentes.add(relacion.id);
    }
  }
  return asistentes;
}

async function marcarCampanaEnviada(notionPageIds) {
  requireDataSourceId();
  for (const notionPageId of notionPageIds) {
    await notionFetch(`/pages/${notionPageId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        properties: { 'Campaña Enviada': { checkbox: true } },
      }),
    });
  }
}
```

### 3.3 `src/services/contactos.service.js` (extractos)

```js
const fecha = (prop) => prop?.date?.start || null;
// en parsearContacto:
ultimaCampanaEnviada: select(p['Última Campaña Enviada']),
fechaUltimaCampana: fecha(p['Fecha Última Campaña']),

async function actualizarEstadoCampana({ contactoId, campana, fechaEnvio }) {
  requireDataSourceId();
  return notionFetch(`/pages/${contactoId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      properties: {
        'Última Campaña Enviada': { select: { name: campana } },
        'Fecha Última Campaña': { date: { start: fechaEnvio } },
      },
    }),
  });
}
```

### 3.4 Archivo nuevo `src/services/campanas-matchmaking.service.js`

```js
// Disparo manual de campañas para filas Aprobado pendientes de procesar.
// Agrupa por asistente: varias sugerencias nuevas producen un solo mensaje.
// El default es simulación; habilitar envío real requiere un opt-in por env.

const citasService = require('./citas.service');
const contactosService = require('./contactos.service');
const platicaClient = require('./platica-client.service');

const CAMPANA_A = 'A - Primera oferta';
const CAMPANA_B = 'B - Más opciones';
const CAMPANA_C = 'C - Reactivación';
const DIAS_REACTIVACION = Number(process.env.CAMPANAS_MATCHMAKING_DIAS_REACTIVACION || 14);

const TEMPLATE_ENV = {
  [CAMPANA_A]: 'PLATICA_TEMPLATE_MATCHMAKING_A',
  [CAMPANA_B]: 'PLATICA_TEMPLATE_MATCHMAKING_B',
  [CAMPANA_C]: 'PLATICA_TEMPLATE_MATCHMAKING_C',
};

const TEMPLATE_SIMULACION = {
  [CAMPANA_A]: 'seleccion_horarios',
  [CAMPANA_B]: 'PENDIENTE_PLANTILLA_B',
  [CAMPANA_C]: 'PENDIENTE_PLANTILLA_C',
};

function agruparPorAsistente(filas) {
  const grupos = new Map();
  for (const fila of filas) {
    if (!grupos.has(fila.asistentePageId)) grupos.set(fila.asistentePageId, []);
    grupos.get(fila.asistentePageId).push(fila);
  }
  return grupos;
}

function elegirCampana({ contacto, tieneCitaConfirmada, ahora }) {
  if (tieneCitaConfirmada) return { campana: CAMPANA_B };
  if (!contacto.ultimaCampanaEnviada) return { campana: CAMPANA_A };

  if (contacto.ultimaCampanaEnviada === CAMPANA_A) {
    if (!contacto.fechaUltimaCampana) {
      return { motivo: 'FECHA_ULTIMA_CAMPANA_FALTANTE' };
    }
    const fechaAnterior = new Date(contacto.fechaUltimaCampana);
    if (Number.isNaN(fechaAnterior.getTime())) {
      return { motivo: 'FECHA_ULTIMA_CAMPANA_INVALIDA' };
    }
    const limite = new Date(ahora.getTime() - DIAS_REACTIVACION * 24 * 60 * 60 * 1000);
    if (fechaAnterior < limite) return { campana: CAMPANA_C };
    return { motivo: 'VENTANA_REACTIVACION_NO_CUMPLIDA' };
  }

  if (contacto.ultimaCampanaEnviada === CAMPANA_B || contacto.ultimaCampanaEnviada === CAMPANA_C) {
    return { motivo: 'COMPORTAMIENTO_POSTERIOR_NO_DEFINIDO' };
  }

  return { motivo: 'ULTIMA_CAMPANA_DESCONOCIDA' };
}

function plantillaPara(campana, modoSimulacion) {
  const nombreEnv = TEMPLATE_ENV[campana];
  const configurada = process.env[nombreEnv];
  if (configurada) return configurada;
  if (modoSimulacion) return TEMPLATE_SIMULACION[campana];
  throw new Error(`Falta ${nombreEnv}; no se puede enviar ${campana}`);
}

function payloadPara({ contacto, campana, modoSimulacion }) {
  return {
    phone: contacto.whatsapp,
    templateName: plantillaPara(campana, modoSimulacion),
    params: [contacto.nombre || 'Asistente'],
  };
}

async function dispararCampanasAprobadas({
  modoSimulacion = process.env.CAMPANAS_MATCHMAKING_MODO_SIMULACION !== 'false',
  ahora = new Date(),
} = {}) {
  if (!modoSimulacion && process.env.CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO !== 'true') {
    throw new Error(
      'Envío real de campañas deshabilitado. Define CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO=true solo después de aprobar las plantillas.'
    );
  }

  const candidatas = await citasService.buscarCitasAprobadasSinCampana();
  const confirmados = await citasService.obtenerAsistentesConCitaConfirmada();
  const grupos = agruparPorAsistente(candidatas);
  const resumen = {
    modoSimulacion,
    contactosProcesados: grupos.size,
    enviadosA: 0,
    enviadosB: 0,
    enviadosC: 0,
    simuladosA: 0,
    simuladosB: 0,
    simuladosC: 0,
    sinEnviar: 0,
    errores: [],
    detalle: [],
  };

  for (const [asistentePageId, filas] of grupos.entries()) {
    try {
      const contacto = await contactosService.obtenerContacto(asistentePageId);
      const decision = elegirCampana({
        contacto,
        tieneCitaConfirmada: confirmados.has(asistentePageId),
        ahora,
      });

      if (!decision.campana) {
        resumen.sinEnviar += 1;
        resumen.detalle.push({ asistentePageId, filas: filas.map((f) => f.id), motivo: decision.motivo });
        continue;
      }
      if (!contacto.whatsapp) {
        throw new Error('El contacto no tiene WhatsApp');
      }

      const payload = payloadPara({ contacto, campana: decision.campana, modoSimulacion });
      if (modoSimulacion) {
        const clave = decision.campana === CAMPANA_A ? 'simuladosA' : decision.campana === CAMPANA_B ? 'simuladosB' : 'simuladosC';
        resumen[clave] += 1;
        resumen.detalle.push({
          asistentePageId,
          filas: filas.map((f) => f.id),
          campana: decision.campana,
          payload,
          simulado: true,
        });
        continue;
      }

      await platicaClient.enviarPlantilla(payload);
      const fechaEnvio = ahora.toISOString();
      await contactosService.actualizarEstadoCampana({
        contactoId: asistentePageId,
        campana: decision.campana,
        fechaEnvio,
      });
      await citasService.marcarCampanaEnviada(filas.map((f) => f.id));

      const clave = decision.campana === CAMPANA_A ? 'enviadosA' : decision.campana === CAMPANA_B ? 'enviadosB' : 'enviadosC';
      resumen[clave] += 1;
      resumen.detalle.push({
        asistentePageId,
        filas: filas.map((f) => f.id),
        campana: decision.campana,
        simulado: false,
      });
    } catch (err) {
      resumen.errores.push({ asistentePageId, mensaje: err.message });
    }
  }

  return resumen;
}

module.exports = {
  CAMPANA_A,
  CAMPANA_B,
  CAMPANA_C,
  DIAS_REACTIVACION,
  agruparPorAsistente,
  elegirCampana,
  dispararCampanasAprobadas,
};
```

### 3.5 Archivo nuevo `src/controllers/campanas.controller.js`

```js
const crypto = require('crypto');
const { dispararCampanasAprobadas } = require('../services/campanas-matchmaking.service');

function secretosIguales(recibido, esperado) {
  const a = Buffer.from(String(recibido || ''));
  const b = Buffer.from(String(esperado || ''));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function enviarCampanasAprobadas(req, res) {
  const secret = process.env.NOTION_CAMPANAS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[CampanasWebhook] NOTION_CAMPANAS_WEBHOOK_SECRET no está configurado');
    return res.status(500).json({ error: 'Internal Server Error', message: 'Webhook no configurado.' });
  }
  if (!secretosIguales(req.headers['x-notion-campanas-secret'], secret)) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Secret inválido o faltante.' });
  }

  try {
    const resultado = await dispararCampanasAprobadas();
    return res.status(200).json(resultado);
  } catch (err) {
    console.error('[CampanasWebhook]', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: err.message || 'No se pudieron procesar las campañas.',
    });
  }
}

module.exports = { enviarCampanasAprobadas, secretosIguales };
```

### 3.6 `src/routes/flows.routes.js`

```diff
 const { whatsappFlows } = require('../controllers/flows.controller');
+const { enviarCampanasAprobadas } = require('../controllers/campanas.controller');
 
 router.post('/whatsapp-flows', whatsappFlows);
+router.post('/notion/enviar-campanas-aprobadas', enviarCampanasAprobadas);
```

Ruta HTTP efectiva (porque `src/index.js` ya hace `app.use('/webhooks', flowsRoutes)` **antes** de `authMiddleware`):

`POST /webhooks/notion/enviar-campanas-aprobadas`

Header: `X-Notion-Campanas-Secret` (= `NOTION_CAMPANAS_WEBHOOK_SECRET`).

### 3.7 `src/mcp/server.js`

Tool nueva `disparar_campanas_aprobadas`, schema `{}`, llama `dispararCampanasAprobadas()` sin argumentos. El agente **no** puede pasar `modoSimulacion: false`. Comentario de cabecera: 9 tools (23-ago).

### 3.8 Tests nuevos

Ver archivos completos en el repo:

- `tests/rechazado-pares-activos.manual-test.js`
- `tests/campanas-matchmaking.manual-test.js`
- `tests/campanas-webhook.manual-test.js`

### 3.9 `.env.example` (bloque añadido)

```
NOTION_CAMPANAS_WEBHOOK_SECRET=
CAMPANAS_MATCHMAKING_MODO_SIMULACION=true
CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO=false
CAMPANAS_MATCHMAKING_DIAS_REACTIVACION=14
PLATICA_TEMPLATE_MATCHMAKING_A=
PLATICA_TEMPLATE_MATCHMAKING_B=
PLATICA_TEMPLATE_MATCHMAKING_C=
```

---

## 4. Decisiones tomadas en implementación (no estaban literales en el prompt)

1. **Doble barrera de envío real.** Además de `modoSimulacion` default true, se exige `CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO=true`. Si alguien llama el service con `modoSimulacion: false` sin esa env, truena. El MCP no expone el flag.

2. **Simulación no escribe Notion.** El prompt decía armar payload y no llamar envío. Se interpretó también: no marcar `Campaña Enviada` ni `Última Campaña Enviada` en simulación, para poder repetir dry-runs. **Implicación:** un dry-run contra Notion real no deja rastro; hay que mirar el JSON de respuesta.

3. **Payload genérico: solo `params: [nombre]`.** El prompt pedía agrupar y no nombrar sponsors. No se mandan `{{2}}`/`{{3}}` de sponsor. Si `seleccion_horarios` en Meta sigue pidiendo tres variables, el envío real de A fallará o llegará mal hasta que Sam confirme.

4. **Paso e (ya mandaron B o C, no hay Confirmada, hay Aprobado nuevo):** no se envía. Motivo `COMPORTAMIENTO_POSTERIOR_NO_DEFINIDO`. El prompt decía no inventar default.

5. **Fallo parcial WhatsApp OK / Notion falla:** en envío real el orden es Plática → Contactos → marcar filas. **No** hay estado intermedio “envío en curso”. Un reintento puede duplicar WhatsApp. El prompt pedía decidirlo con Adler; se dejó documentado, no se inventó transacción.

6. **14 días exactos:** `fechaAnterior < limite`, no `<=`. A las 14:00:00.000 exactas **no** reactiva; tiene que haber pasado la ventana.

7. **Confirmada para plantilla B:** se usa el set de asistentes con **cualquier** fila `Confirmada` o `Confirmada sin notificar`, no solo las candidatas `Aprobado`.

8. **Header del webhook:** `X-Notion-Campanas-Secret` / env `NOTION_CAMPANAS_WEBHOOK_SECRET`. Comparación `timingSafeEqual` (si longitudes difieren → false, sin throw).

9. **Sin `node-cron` y sin endpoint nuevo de generación.** Se documentó cron HTTP a `POST /matchmaking/sugerir-todos` + `X-API-Key`. No se creó job en el proceso.

10. **Nombres del repo, no del prompt.** Ej.: `existeCitaActivaEntre`, `ESTATUS_ACTIVOS`, `enviarPlantilla`, `PLATICA_CHANNEL_ID`, `X-API-Key` / `API_SECRET_KEY`. Salvaguarda del propio v2.

11. **Cliente Plática:** se reusa `platica-client.service.js` → `enviarPlantilla({ phone, templateName, params })`. No se hardcodeó el número +52.

---

## 5. Desviaciones del prompt original

| Prompt decía | Qué se hizo | Por qué |
|---|---|---|
| Cron Coolify configurado en esta sesión | Solo README/AGENTS.md | No hay acceso a Coolify desde aquí; es infra. |
| Estado intermedio si envío OK y Notion falla | No implementado | Prompt: confirmar con Adler; no default silencioso. |
| Confirmar `get_template` / Flow id / channelId vía MCP Plática | No se llamó a Meta/Plática para plantillas | B y C no existen; A bloqueada a Sam. |
| Recrear o ajustar vistas TEST | No | Prompt: ya creadas, no repetir. |
| Endpoint `POST /matchmaking/generar-sugerencias` (v1) | No | v2: reusar `POST /matchmaking/sugerir-todos`. |
| `modoSimulacion` como único freno | Dos env vars | Evitar que un deploy con `false` accidental mande WhatsApp. |
| Marcar filas al disparar (ambigüo en simulación) | Solo en envío real | Poder re-correr simulación. |

---

## 6. Tests — qué se corrió y resultado

Todos con `node …` desde `C:\PlaticaMX\FDTNotionAPI`. Exit 0 salvo donde se indica.

### 6.1 `node tests/sesion-14ago-diffs.manual-test.js`

Primera corrida: **1 fallo** — el assert buscaba `el sponsor todavía tiene 3 citas por cubrir` y el texto real era `El sponsor todavía tiene 3 citas por cubrir de su cuota.` Se ajustó a `sponsor todavía tiene 3 citas por cubrir`. **Segunda corrida: TODOS PASARON** (incluye cuota 1 vs 4 mismo score; cuota 0 sin frase).

### 6.2 `node tests/rechazado-pares-activos.manual-test.js`

```
✅ Rechazado bloquea el par en consulta individual y caché global.
```

### 6.3 `node tests/global-cache-citas.manual-test.js`

Pasó: `obtenerParesConCitaActiva` 1 vez; `existeCitaActivaEntre` HTTP no se llama en global.

### 6.4 `node tests/campanas-matchmaking.manual-test.js` (versión final)

```
✅ Tres aprobadas del mismo contacto producen una sola campaña A.
✅ A con 20 días cae en C y sigue sin efectos en simulación.
✅ El caso B/C sin confirmada falla cerrado y no inventa comportamiento.
✅ A los 14 días exactos aún no se reactiva; debe haber pasado la ventana.
```

### 6.5 `node tests/campanas-webhook.manual-test.js`

```
✅ El webhook rechaza secret inválido y procesa el válido.
```

### 6.6 Regresiones matchmaking

- `node tests/matchmaking-2026.manual-test.js` — todas las verificaciones pasaron.
- `node tests/matchmaking.manual-test.js` — Carlos 0 candidatos (baseline conocido); Laura 2 candidatos con scores 1280 y 280. **Nota:** el detalle de esas corridas **sigue mostrando** `cuota_pendiente: N citas por cubrir` en el arreglo `detalle` y en la explicación. Eso es correcto (informativo). Lo que cambió es que **el número `score` ya no incluye 15×N**. En el fixture de Laura, cuota 2 ya no suma 30 pts al 1280/280.
- `node tests/matchmaking-global.manual-test.js` — 1 solapamiento, Diamante antes que Oro.
- `node tests/guardar-sugerencia-individual.manual-test.js` — tres asserts OK.

### 6.7 Carga de app

```
$env:NODE_ENV='test'; node -e "require('./src/index'); console.log('app-load-ok')"
```
→ `app-load-ok`

`node --check` en services/controllers/tests nuevos: OK.

### 6.8 Tests del prompt **no** implementados como one-shot contra Notion real

- “Correr `sugerir-todos` dos veces y contar filas” — **solo mocks de no-duplicado ya existentes** (`existeCitaActivaEntre`). No se disparó REST contra Notion.
- Test de `sugerirMatchesParaSponsor` con par `Rechazado` **contra Notion real** — no. El test nuevo mockea el body del query y comprueba que el filtro incluye `Rechazado`.

### Casos borde cubiertos vs no cubiertos

**Cubiertos (mocks):** mismo score con cuotas distintas; explicación con/sin cuota; Rechazado en ambos caminos de query; 3 filas → 1 envío A; A+20 días → C simulado sin writes; B/C sin Confirmada → no envía; 14 días exactos → no C; webhook 401/200.

**No cubiertos:** envío real a Plática; WhatsApp OK + PATCH Notion falla (duplicado); contacto sin WhatsApp en camino real (sí truena y va a `errores` si no es simulación… en simulación también truena **después** de elegir campaña, y cae en `errores`, no en `sinEnviar`); paginación >100 de `Campaña Enviada=false`; dos disparos concurrentes del webhook; plantilla A con 3 variables Meta vs 1 param.

---

## 7. Qué se verificó contra Notion real

Workspace de **pruebas** de Adler, no producción de Laura.

| Operación | Data source | Resultado |
|---|---|---|
| `notion-fetch` schema | Citas `(nueva)` `df93bc94-26ee-42fc-92d7-a0ed3a8e1f68` | `Rechazado` ya estaba en `Estatus`. No se re-alteró el select. |
| `ADD COLUMN "Campaña Enviada" CHECKBOX` | mismo Citas | Columna creada; re-fetch la muestra `type: checkbox`. |
| `ADD COLUMN "Última Campaña Enviada" SELECT(...)` + `"Fecha Última Campaña" DATE` | Contactos `(nueva)` `9f335308-da0e-4672-9744-c1dabcfb22aa` | Columnas presentes en fetch posterior (opciones A/B/C). |

**No se hizo contra Notion real:** crear filas Sugerido, aprobar, disparar campañas (ni simulación HTTP al API desplegada), cron, marcar checkboxes en filas existentes.

Las pruebas de campañas **inyectan `require.cache`** — no leen esas columnas nuevas en vivo.

---

## 8. Qué NO se tocó del prompt, aunque estaba mencionado

- Configurar el cron HTTP en Coolify (cada 6 h + `X-API-Key`).
- Botón Notion “Send webhook” (plan de pago; workspace Free de Adler no sirve).
- Alta/copy de plantillas B y C en Meta.
- Confirmación con Sam de `seleccion_horarios` (¿genérica o `{{2}}`/`{{3}}` de sponsor?).
- `get_template` para orden de variables.
- Mecanismo de apertura del Flow (`1326390853881897`) post-plantilla A.
- Paso e con Adler (hay default cerrado: no enviar).
- Diseño de idempotencia envío/Notion con Adler.
- Recálculo de scores de filas `Sugerido` ya existentes (el prompt avisó que quedan con el sesgo viejo).
- Deploy / commit / push.
- Workspace producción.

---

## 9. Pendientes reales después de esta sesión

| # | Qué falta | Quién | ¿Bloquea? |
|---|---|---|---|
| 1 | Confirmar plantilla A (`seleccion_horarios`) vs mensaje genérico de N sugerencias; orden `{{n}}` con `get_template` | Sam (+ Adler) | **Envío real de A** |
| 2 | Copy + alta Meta de B y C | Sam | **Envío real de B y C** |
| 3 | Cómo abre el Flow tras A | Sam/Carlos | UX post-WhatsApp, no el código de agrupación |
| 4 | Paso e: ya hubo B o C, no reservó, hay Aprobado nuevo | Adler | Hoy: no envía. Hay que decidir si reenviar, silenciar, etc. |
| 5 | Fallo parcial (WhatsApp OK, Notion no) | Adler | Riesgo de duplicar mensaje en reintento |
| 6 | Cron Coolify → `POST /matchmaking/sugerir-todos` con `X-API-Key` desde secret | Adler / ops | Sugerencias no se generan solas hasta configurarlo |
| 7 | Secret `NOTION_CAMPANAS_WEBHOOK_SECRET` en Coolify + header en botón Notion (workspace Business de Laura) | Adler | Webhook 500 si falta secret |
| 8 | Poner en Coolify `CAMPANAS_MATCHMAKING_MODO_SIMULACION=true` y `ENVIO_REAL=false` hasta go-live | Adler | Seguridad |
| 9 | Filas `Sugerido` viejas con score inflado por cuota | nadie / opcional recálculo | Ranking de filas antiguas en vistas |
| 10 | Commit de este trabajo | Adler | Código solo local |
| 11 | `Contacto Principal` vacío en una fila Aprobado | — | Esa fila se **omite** del disparo (filter). Posible fila huérfana |

---

## 10. Cómo probar esto manualmente

Asume repo local, `npm` ya instalado, **sin** `CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO=true`.

### A. Tests (sin Notion)

```bash
cd C:\PlaticaMX\FDTNotionAPI
node tests/sesion-14ago-diffs.manual-test.js
node tests/rechazado-pares-activos.manual-test.js
node tests/campanas-matchmaking.manual-test.js
node tests/campanas-webhook.manual-test.js
```

Esperado: todos exit 0.

### B. Score a ojo

En cualquier dry-run de matchmaking, dos candidatos iguales con distinta cuota pendiente deben tener **el mismo `score`**. La explicación puede decir “todavía tiene N citas por cubrir”.

### C. Simulación HTTP del disparo (API local)

1. Copia `.env.example` → `.env` y llena Notion/API keys como ya las tienes.
2. Define `NOTION_CAMPANAS_WEBHOOK_SECRET=algo-largo`.
3. Deja `CAMPANAS_MATCHMAKING_MODO_SIMULACION=true`.
4. `npm run dev`.
5. `POST http://localhost:3001/webhooks/notion/enviar-campanas-aprobadas` con header `X-Notion-Campanas-Secret: algo-largo`.
6. Sin secret → 401. Con secret → 200 JSON con `modoSimulacion: true`. **No** debe cambiar `Campaña Enviada` en Notion.
7. Sin `X-API-Key` (este path no la usa). **No** pegues este POST al cron de sugerencias.

### D. Generar sugerencias (el cron futuro)

`POST /matchmaking/sugerir-todos` **sí** lleva `X-API-Key`. Escribe `Sugerido`. No manda WhatsApp.

### E. Rechazado en Notion pruebas

Poner un par en `Estatus=Rechazado`, volver a sugerir para ese sponsor (dry-run o escritura). Ese asistente no debe reaparecer. (No se verificó E2E en esta sesión.)

### F. Envío real — no hacer todavía

Haría falta plantillas en env, `MODO_SIMULACION=false` **y** `ENVIO_REAL_HABILITADO=true`. Hoy eso es peligroso y B/C ni existen.

---

## 11. Riesgos y observaciones

- **`timingSafeEqual`:** si el header llega vacío y el secret está set, longitudes distintas → 401, bien. Si **olvidan** el secret en Coolify, el endpoint responde **500** (fail closed), no queda abierto.
- **Simulación vs “probar el botón”:** Laura puede pulsar el webhook en simulación mil veces; Notion no se marca. Cuando pasen a real, el primer disparo sí marcará todas las `Aprobado` candidatas de ese momento.
- **Acumulación de `Sugerido`:** decisión de producto explícita del v2; el cron (cuando exista) seguirá escribiendo candidatos nuevos. Las vistas por score son el modo de trabajo.
- **`Rechazado` como “activo”:** bloquea re-sugerir. No es un estatus de cita de calendario; es un veto de par. Si alguien lo usa mal (rechazar para “limpiar” y luego querer el mismo par), hay que volver a `Sugerido` a mano.
- **Nombres de propiedades Notion:** el código usa `Campaña Enviada`, `Última Campaña Enviada`, `Fecha Última Campaña`, opciones `A - Primera oferta` / `B - Más opciones` / `C - Reactivación`. Si en la UI se renombran, el query se rompe.
- **`obtenerContacto` por cada grupo:** un disparo con muchos asistentes distintos = N GETs a Notion. Aceptable a volumen actual; no hay batch.
- **`bitacora-verificacion-12ago.md`** sigue modificado de **antes** de esta sesión; no mezclarlo en el commit de campañas.
- Cliente Plática ya normaliza teléfono; el payload usa `contacto.whatsapp` crudo del parseo.

---

*Fin bitácora 23-ago. Código no commiteado. SHA base `53a15a9`.*
