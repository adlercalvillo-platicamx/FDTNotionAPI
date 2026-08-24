// Confirmación de workspace del one-shot marcar-cola-sin-enviar.
// No pega a Notion ni a Plática.
//
//   node tests/marcar-cola-sin-enviar.manual-test.js

const assert = require('assert');
const {
  previewCola,
  contarFilasEnResumen,
  ejecutarMarcarCola,
} = require('../scripts/one-shots/marcar-cola-sin-enviar');

function agruparSimple(filas) {
  const grupos = new Map();
  for (const fila of filas) {
    if (!grupos.has(fila.asistentePageId)) grupos.set(fila.asistentePageId, []);
    grupos.get(fila.asistentePageId).push(fila);
  }
  return grupos;
}

const FILAS = [
  { id: 'cita-1', asistentePageId: 'asistente-1' },
  { id: 'cita-2', asistentePageId: 'asistente-1' },
  { id: 'cita-3', asistentePageId: 'asistente-2' },
];

function depsBase({ leerLinea, disparar }) {
  let llamadasDisparo = 0;
  const dispararSpy = async (args) => {
    llamadasDisparo += 1;
    if (disparar) return disparar(args);
    return {
      soloMarcar: true,
      contactosProcesados: 2,
      detalle: [
        { asistentePageId: 'asistente-1', filas: ['cita-1', 'cita-2'], marcadoSinEnviar: true },
        { asistentePageId: 'asistente-2', filas: ['cita-3'], marcadoSinEnviar: true },
      ],
      errores: [],
    };
  };

  return {
    llamadasDisparo: () => llamadasDisparo,
    opts: {
      argv: ['node', 'marcar-cola-sin-enviar.js', '--confirmar'],
      env: {
        NOTION_CITAS_DATA_SOURCE_ID: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        NOTION_CONTACTOS_DATA_SOURCE_ID: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      },
      log: () => {},
      warn: () => {},
      error: () => {},
      leerLinea,
      fetchImpl: async (path) => {
        if (path.includes('aaaaaaaa')) {
          return { title: [{ plain_text: 'Citas FDT' }] };
        }
        return { title: [{ plain_text: 'Contactos FDT' }] };
      },
      buscarCitasAprobadasSinCampana: async () => FILAS,
      agrupar: agruparSimple,
      disparar: dispararSpy,
    },
  };
}

async function casoNombreIncorrectoNoDispara() {
  const { llamadasDisparo, opts } = depsBase({
    leerLinea: async () => 'Citas (nueva)',
  });
  const resultado = await ejecutarMarcarCola(opts);
  assert.strictEqual(resultado.abortado, true);
  assert.strictEqual(resultado.motivo, 'NOMBRE_WORKSPACE_NO_COINCIDE');
  assert.strictEqual(llamadasDisparo(), 0, 'nombre incorrecto no debe llamar dispararCampanasAprobadas');
}

async function casoNombreCorrectoDispara() {
  const { llamadasDisparo, opts } = depsBase({
    leerLinea: async () => 'Citas FDT',
  });
  const resultado = await ejecutarMarcarCola(opts);
  assert.strictEqual(resultado.abortado, false);
  assert.strictEqual(llamadasDisparo(), 1);
  assert.strictEqual(resultado.resumen.soloMarcar, true);
  assert.strictEqual(resultado.tituloCitas, 'Citas FDT');
}

async function casoPreviewCoincideConResumen() {
  const preview = previewCola(FILAS, agruparSimple);
  assert.strictEqual(preview.filas, 3);
  assert.strictEqual(preview.contactos, 2);

  const { opts } = depsBase({
    leerLinea: async () => 'Citas FDT',
  });
  const resultado = await ejecutarMarcarCola(opts);
  assert.strictEqual(resultado.preview.filas, preview.filas);
  assert.strictEqual(resultado.preview.contactos, preview.contactos);
  assert.strictEqual(resultado.resumen.contactosProcesados, resultado.preview.contactos);
  assert.strictEqual(contarFilasEnResumen(resultado.resumen), resultado.preview.filas);
}

async function casoSinFlagNoLlegaANotion() {
  let fetchCalls = 0;
  let disparos = 0;
  const resultado = await ejecutarMarcarCola({
    argv: ['node', 'marcar-cola-sin-enviar.js'],
    env: {},
    log: () => {},
    warn: () => {},
    error: () => {},
    leerLinea: async () => {
      throw new Error('no debería pedir nombre sin --confirmar');
    },
    fetchImpl: async () => {
      fetchCalls += 1;
      return { title: [] };
    },
    buscarCitasAprobadasSinCampana: async () => FILAS,
    agrupar: agruparSimple,
    disparar: async () => {
      disparos += 1;
      return { errores: [] };
    },
  });
  assert.strictEqual(resultado.motivo, 'FALTA_FLAG_CONFIRMAR');
  assert.strictEqual(fetchCalls, 0);
  assert.strictEqual(disparos, 0);
}

async function main() {
  await casoSinFlagNoLlegaANotion();
  console.log('✅ Sin --confirmar no consulta Notion ni dispara.');
  await casoNombreIncorrectoNoDispara();
  console.log('✅ Nombre de Citas incorrecto aborta y no llama dispararCampanasAprobadas.');
  await casoNombreCorrectoDispara();
  console.log('✅ Nombre exacto continúa y dispara soloMarcar.');
  await casoPreviewCoincideConResumen();
  console.log('✅ Preview de filas/contactos coincide con el resumen final.');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
