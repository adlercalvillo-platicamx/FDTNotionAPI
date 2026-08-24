// scripts/one-shots/marcar-cola-sin-enviar.js
//
// ═══════════════════════════════════════════════════════════════════
// NO ES PARTE DEL FLUJO NORMAL. UNA SOLA VEZ POR AMBIENTE.
// ═══════════════════════════════════════════════════════════════════
//
// Justo ANTES de poner CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO=true
// por primera vez en el workspace de producción de Laura, este script
// recorre la cola Aprobado sin Campaña Enviada, aplica la misma
// decisión A/B/C que un disparo real, y marca Notion como si se hubiera
// enviado. NUNCA llama a Plática / WhatsApp.
//
// Antes de correrlo: abre la vista "Solo Aprobados" en Notion.
// Cualquier fila que SÍ deba recibir WhatsApp en el primer disparo real
// no debe estar en Aprobado en este momento (bájala a Sugerido y
// re-apróbala después, o confirma que no hay ninguna así).
//
// Cada corrida "apaga" sin enviar TODO lo Aprobado pendiente. No lo
// uses para pruebas. Si hace falta limpiar la cola otra vez, eso es
// señal de que el diseño necesita revisión — no asumas que repetirlo
// es normal.
//
// Uso (después de revisar la vista):
//   node scripts/one-shots/marcar-cola-sin-enviar.js --confirmar
//
// --confirmar es la primera barrera (intención). Después el script
// muestra los títulos reales de las data sources del .env activo y
// pide escribir el nombre de Citas tal cual. Esa es la segunda
// barrera: confirma CONTRA QUÉ workspace se va a escribir.

require('dotenv').config();

const readline = require('readline');
const { notionFetch } = require('../../src/utils/notion-client');
const citasService = require('../../src/services/citas.service');
const {
  agruparPorAsistente,
  dispararCampanasAprobadas,
} = require('../../src/services/campanas-matchmaking.service');

function tituloDeDataSource(data) {
  if (!data) return '';
  if (typeof data.title === 'string') return data.title;
  if (Array.isArray(data.title)) {
    return data.title.map((parte) => parte.plain_text || parte.text?.content || '').join('');
  }
  return '';
}

function acortarId(id) {
  return String(id || '').slice(0, 8);
}

function contarFilasEnResumen(resumen) {
  return (resumen.detalle || []).reduce((n, item) => n + (item.filas || []).length, 0);
}

async function leerLineaStdin(pregunta) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise((resolve) => rl.question(pregunta, resolve));
  } finally {
    rl.close();
  }
}

async function resolverTituloDataSource(dataSourceId, fetchImpl) {
  if (!dataSourceId) {
    throw new Error('Falta el data source id en el .env activo');
  }
  const data = await fetchImpl(`/data_sources/${dataSourceId}`);
  const titulo = tituloDeDataSource(data);
  if (!titulo) {
    throw new Error(`Notion no devolvió title para ${dataSourceId}`);
  }
  return titulo;
}

function previewCola(filas, agrupar) {
  const grupos = agrupar(filas);
  return { filas: filas.length, contactos: grupos.size };
}

async function ejecutarMarcarCola({
  argv = process.argv,
  env = process.env,
  log = console.log,
  warn = console.warn,
  error = console.error,
  leerLinea = leerLineaStdin,
  fetchImpl = notionFetch,
  buscarCitasAprobadasSinCampana = () => citasService.buscarCitasAprobadasSinCampana(),
  agrupar = agruparPorAsistente,
  disparar = dispararCampanasAprobadas,
} = {}) {
  warn(`
╔════════════════════════════════════════════════════════════════════╗
║  marcar-cola-sin-enviar — escribe Notion, NO manda WhatsApp       ║
║                                                                    ║
║  1. Revisa la vista "Solo Aprobados" ANTES de seguir.              ║
║  2. Lo que deba ir en el primer disparo real NO debe estar         ║
║     Aprobado ahora.                                                ║
║  3. Esto es un paso de transición, no una prueba repetible.        ║
╚════════════════════════════════════════════════════════════════════╝
`);

  if (!argv.includes('--confirmar')) {
    error('Abortado. Si ya revisaste Solo Aprobados:');
    error('  node scripts/one-shots/marcar-cola-sin-enviar.js --confirmar');
    return { abortado: true, motivo: 'FALTA_FLAG_CONFIRMAR' };
  }

  const citasId = env.NOTION_CITAS_DATA_SOURCE_ID;
  const contactosId = env.NOTION_CONTACTOS_DATA_SOURCE_ID;
  const tituloCitas = await resolverTituloDataSource(citasId, fetchImpl);
  const tituloContactos = await resolverTituloDataSource(contactosId, fetchImpl);

  const candidatas = await buscarCitasAprobadasSinCampana();
  const preview = previewCola(candidatas, agrupar);

  warn(`
⚠️  Este script va a marcar como "procesado sin enviar" TODA la cola
    actual de sugerencias aprobadas — sin mandar ningún WhatsApp.

Workspace de Citas:     "${tituloCitas}"      (${acortarId(citasId)}…)
Workspace de Contactos: "${tituloContactos}"  (${acortarId(contactosId)}…)

Filas afectadas: ${preview.filas} filas Aprobado sin Campaña Enviada, agrupadas en ${preview.contactos} contactos.

Si este NO es el workspace correcto, presiona Ctrl+C ahora.
`);

  const escrito = await leerLinea(
    'Escribe el nombre del workspace de Citas exactamente como se muestra arriba para confirmar: '
  );

  if (escrito !== tituloCitas) {
    error('Abortado: el nombre no coincide. No se escribió nada en Notion.');
    return { abortado: true, motivo: 'NOMBRE_WORKSPACE_NO_COINCIDE', preview, tituloCitas };
  }

  const resumen = await disparar({ soloMarcar: true });
  const filasEnResumen = contarFilasEnResumen(resumen);
  if (filasEnResumen !== preview.filas || resumen.contactosProcesados !== preview.contactos) {
    warn(
      `⚠️  El preview (${preview.filas} filas / ${preview.contactos} contactos) no coincide con el resumen ` +
        `(${filasEnResumen} filas en detalle / ${resumen.contactosProcesados} contactosProcesados). ` +
        'La cola pudo haber cambiado entre el preview y la ejecución.'
    );
  }

  log(JSON.stringify(resumen, null, 2));
  return { abortado: false, preview, resumen, tituloCitas, tituloContactos };
}

async function main() {
  const resultado = await ejecutarMarcarCola();
  if (resultado.abortado) process.exit(1);
  if (resultado.resumen.errores.length) process.exit(1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('❌', err);
    process.exit(1);
  });
}

module.exports = {
  tituloDeDataSource,
  previewCola,
  contarFilasEnResumen,
  ejecutarMarcarCola,
};
