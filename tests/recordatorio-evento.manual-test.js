// Recordatorio del evento apagado 22-sep. Sin Notion ni WhatsApp.
//
//   node tests/recordatorio-evento.manual-test.js

const assert = require('assert');

process.env.CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO = 'true';
process.env.CAMPANAS_MATCHMAKING_MODO_SIMULACION = 'false';
process.env.PLATICA_TEMPLATE_RECORDATORIO_EVENTO = 'recordatorio-evento-test';

const citasPath = require.resolve('../src/services/citas.service');
const contactosPath = require.resolve('../src/services/contactos.service');
const platicaPath = require.resolve('../src/services/platica-client.service');
const servicePath = require.resolve('../src/services/campanas-matchmaking.service');

let llamadasEnviarPlantilla = 0;
let llamadasCargarCitas = 0;
let llamadasMarcar = 0;

require.cache[citasPath] = {
  id: citasPath,
  filename: citasPath,
  loaded: true,
  exports: {
    async cargarCitasPorAsistenteParaRecordatorio() {
      llamadasCargarCitas += 1;
      return new Map();
    },
  },
};

require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    async obtenerContacto() {
      return { whatsapp: '523300000000', recordatorioEventoEnviado: false };
    },
    async marcarRecordatorioEventoEnviado() {
      llamadasMarcar += 1;
    },
  },
};

require.cache[platicaPath] = {
  id: platicaPath,
  filename: platicaPath,
  loaded: true,
  exports: {
    async enviarPlantilla() {
      llamadasEnviarPlantilla += 1;
      return { ok: true };
    },
  },
};

delete require.cache[servicePath];
const {
  enviarRecordatorioEvento,
  RECORDATORIO_EVENTO_HABILITADO,
  contactoYaInteractuo,
  DIAS_ANTES_RECORDATORIO_EVENTO,
  FECHA_EVENTO,
  evaluarVentanaRecordatorio,
} = require('../src/services/campanas-matchmaking.service');

const DENTRO_DE_VENTANA = new Date('2026-09-24T09:00:00-06:00');

async function casoApagadoNoTocaNada() {
  assert.strictEqual(RECORDATORIO_EVENTO_HABILITADO, false);
  const resultado = await enviarRecordatorioEvento({
    modoSimulacion: false,
    ahora: DENTRO_DE_VENTANA,
  });
  assert.strictEqual(resultado.disparado, false);
  assert.strictEqual(resultado.motivo, 'RECORDATORIO_EVENTO_DESHABILITADO');
  assert.strictEqual(resultado.enviados, 0);
  assert.strictEqual(llamadasCargarCitas, 0);
  assert.strictEqual(llamadasEnviarPlantilla, 0);
  assert.strictEqual(llamadasMarcar, 0);
}

function casoHelpersSiguenDocumentados() {
  assert.strictEqual(DIAS_ANTES_RECORDATORIO_EVENTO, 14);
  assert.strictEqual(FECHA_EVENTO, '2026-10-07');
  assert.strictEqual(contactoYaInteractuo([{ estatus: 'Sugerido' }]), false);
  assert.strictEqual(contactoYaInteractuo([{ estatus: 'Confirmada' }]), true);
  const despues = evaluarVentanaRecordatorio(DENTRO_DE_VENTANA);
  assert.strictEqual(despues.cumplida, true);
}

async function main() {
  casoHelpersSiguenDocumentados();
  console.log('✅ Helpers de ventana/interacción siguen en el archivo (sin envío).');
  await casoApagadoNoTocaNada();
  console.log('✅ RECORDATORIO_EVENTO_DESHABILITADO: sin Notion ni Plática.');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
