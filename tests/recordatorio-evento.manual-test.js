// Recordatorio-reactivación del evento, sin Notion ni WhatsApp reales.
//
//   node tests/recordatorio-evento.manual-test.js

const assert = require('assert');

process.env.CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO = 'true';
process.env.PLATICA_TEMPLATE_RECORDATORIO_EVENTO = 'recordatorio-evento-test';

const citasPath = require.resolve('../src/services/citas.service');
const contactosPath = require.resolve('../src/services/contactos.service');
const platicaPath = require.resolve('../src/services/platica-client.service');
const servicePath = require.resolve('../src/services/campanas-matchmaking.service');

let porAsistente = new Map();
const contactos = {};
const envios = [];
const marcadosRecordatorio = [];
let llamadasEnviarPlantilla = 0;

require.cache[citasPath] = {
  id: citasPath,
  filename: citasPath,
  loaded: true,
  exports: {
    async cargarCitasPorAsistenteParaRecordatorio() {
      return porAsistente;
    },
  },
};

require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    async obtenerContacto(id) {
      return contactos[id];
    },
    async marcarRecordatorioEventoEnviado(contactoId) {
      marcadosRecordatorio.push(contactoId);
    },
  },
};

require.cache[platicaPath] = {
  id: platicaPath,
  filename: platicaPath,
  loaded: true,
  exports: {
    async enviarPlantilla(payload) {
      llamadasEnviarPlantilla += 1;
      envios.push(payload);
      return { ok: true };
    },
  },
};

delete require.cache[servicePath];
const {
  enviarRecordatorioEvento,
  contactoYaInteractuo,
  DIAS_ANTES_RECORDATORIO_EVENTO,
} = require('../src/services/campanas-matchmaking.service');

function limpiar() {
  porAsistente = new Map();
  Object.keys(contactos).forEach((k) => {
    delete contactos[k];
  });
  envios.length = 0;
  marcadosRecordatorio.length = 0;
  llamadasEnviarPlantilla = 0;
}

function contactoBase(id, extras = {}) {
  contactos[id] = {
    id,
    nombre: id,
    whatsapp: '523300000000',
    recordatorioEventoEnviado: false,
    ...extras,
  };
}

async function casoNuncaInteractuoRecibeMensaje() {
  limpiar();
  contactoBase('asistente-sin');
  porAsistente.set('asistente-sin', [
    { id: 'cita-1', estatus: 'Sugerido' },
    { id: 'cita-2', estatus: 'Aprobado' },
  ]);
  const resultado = await enviarRecordatorioEvento({ modoSimulacion: false });
  assert.strictEqual(resultado.enviados, 1);
  assert.strictEqual(envios.length, 1);
  assert.strictEqual(envios[0].templateName, 'recordatorio-evento-test');
  assert.deepStrictEqual(marcadosRecordatorio, ['asistente-sin']);
}

async function casoYaInteractuoSeMarcaSinWhatsApp() {
  limpiar();
  contactoBase('asistente-si');
  porAsistente.set('asistente-si', [
    { id: 'cita-1', estatus: 'Sugerido' },
    { id: 'cita-2', estatus: 'Confirmada' },
  ]);
  const resultado = await enviarRecordatorioEvento({ modoSimulacion: false });
  assert.strictEqual(resultado.enviados, 0);
  assert.strictEqual(resultado.marcadosSinEnviarPorInteraccion, 1);
  assert.strictEqual(llamadasEnviarPlantilla, 0);
  assert.deepStrictEqual(marcadosRecordatorio, ['asistente-si']);
  assert.strictEqual(resultado.detalle[0].motivo, 'YA_INTERACTUO');
}

async function casoYaMarcadoSeExcluye() {
  limpiar();
  contactoBase('asistente-ok', { recordatorioEventoEnviado: true });
  porAsistente.set('asistente-ok', [{ id: 'cita-1', estatus: 'Aprobado' }]);
  const resultado = await enviarRecordatorioEvento({ modoSimulacion: false });
  assert.strictEqual(resultado.omitidosYaMarcado, 1);
  assert.strictEqual(envios.length, 0);
  assert.strictEqual(marcadosRecordatorio.length, 0);
}

async function casoSinFilasEnCitasSeExcluye() {
  limpiar();
  contactoBase('nunca-ofertado');
  const resultado = await enviarRecordatorioEvento({ modoSimulacion: false });
  assert.strictEqual(resultado.contactosEvaluados, 0);
  assert.strictEqual(resultado.enviados, 0);
  assert.strictEqual(marcadosRecordatorio.length, 0);
}

async function casoSimulacionNoEscribeNiEnInteractuados() {
  limpiar();
  contactoBase('sim-sin');
  contactoBase('sim-si');
  porAsistente.set('sim-sin', [{ id: 'c1', estatus: 'Aprobado' }]);
  porAsistente.set('sim-si', [{ id: 'c2', estatus: 'Pendiente Calendar' }]);
  const resultado = await enviarRecordatorioEvento({ modoSimulacion: true });
  assert.strictEqual(resultado.simulados, 1);
  assert.strictEqual(resultado.detalle.find((d) => d.asistentePageId === 'sim-si').motivo, 'YA_INTERACTUO');
  assert.strictEqual(envios.length, 0);
  assert.strictEqual(marcadosRecordatorio.length, 0);
}

function casoSenalDeInteraccion() {
  assert.strictEqual(DIAS_ANTES_RECORDATORIO_EVENTO, 14);
  assert.strictEqual(contactoYaInteractuo([{ estatus: 'Sugerido' }]), false);
  assert.strictEqual(contactoYaInteractuo([{ estatus: 'Rechazado' }]), false);
  assert.strictEqual(contactoYaInteractuo([{ estatus: 'Completada' }]), true);
  assert.strictEqual(contactoYaInteractuo([{ estatus: 'Confirmada sin notificar' }]), true);
}

async function main() {
  casoSenalDeInteraccion();
  console.log('✅ Señal de interacción y constante de 14 días.');
  await casoNuncaInteractuoRecibeMensaje();
  console.log('✅ Quien nunca interactuó recibe el recordatorio.');
  await casoYaInteractuoSeMarcaSinWhatsApp();
  console.log('✅ Quien ya interactuó no recibe WhatsApp; sí se marca el checkbox.');
  await casoYaMarcadoSeExcluye();
  console.log('✅ Checkbox ya marcado excluye al contacto de la corrida.');
  await casoSinFilasEnCitasSeExcluye();
  console.log('✅ Sin filas en Citas no entra al recordatorio.');
  await casoSimulacionNoEscribeNiEnInteractuados();
  console.log('✅ Simulación no escribe Notion ni llama a Plática.');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
