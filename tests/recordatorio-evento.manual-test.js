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
let llamadasCargarCitas = 0;

require.cache[citasPath] = {
  id: citasPath,
  filename: citasPath,
  loaded: true,
  exports: {
    async cargarCitasPorAsistenteParaRecordatorio() {
      llamadasCargarCitas += 1;
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
  FECHA_EVENTO,
  evaluarVentanaRecordatorio,
} = require('../src/services/campanas-matchmaking.service');

const ANTES_DE_VENTANA = new Date('2026-09-22T09:00:00-06:00');
const DENTRO_DE_VENTANA = new Date('2026-09-24T09:00:00-06:00');

function limpiar() {
  porAsistente = new Map();
  Object.keys(contactos).forEach((k) => {
    delete contactos[k];
  });
  envios.length = 0;
  marcadosRecordatorio.length = 0;
  llamadasEnviarPlantilla = 0;
  llamadasCargarCitas = 0;
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
  const resultado = await enviarRecordatorioEvento({ modoSimulacion: false, ahora: DENTRO_DE_VENTANA });
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
  const resultado = await enviarRecordatorioEvento({ modoSimulacion: false, ahora: DENTRO_DE_VENTANA });
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
  const resultado = await enviarRecordatorioEvento({ modoSimulacion: false, ahora: DENTRO_DE_VENTANA });
  assert.strictEqual(resultado.omitidosYaMarcado, 1);
  assert.strictEqual(envios.length, 0);
  assert.strictEqual(marcadosRecordatorio.length, 0);
}

async function casoSinFilasEnCitasSeExcluye() {
  limpiar();
  contactoBase('nunca-ofertado');
  const resultado = await enviarRecordatorioEvento({ modoSimulacion: false, ahora: DENTRO_DE_VENTANA });
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
  const resultado = await enviarRecordatorioEvento({
    modoSimulacion: true,
    ahora: DENTRO_DE_VENTANA,
  });
  assert.strictEqual(resultado.simulados, 1);
  assert.strictEqual(resultado.detalle.find((d) => d.asistentePageId === 'sim-si').motivo, 'YA_INTERACTUO');
  assert.strictEqual(envios.length, 0);
  assert.strictEqual(marcadosRecordatorio.length, 0);
}

function casoSenalDeInteraccion() {
  assert.strictEqual(DIAS_ANTES_RECORDATORIO_EVENTO, 14);
  assert.strictEqual(FECHA_EVENTO, '2026-10-07');
  assert.strictEqual(contactoYaInteractuo([{ estatus: 'Sugerido' }]), false);
  assert.strictEqual(contactoYaInteractuo([{ estatus: 'Rechazado' }]), false);
  assert.strictEqual(contactoYaInteractuo([{ estatus: 'Completada' }]), true);
  assert.strictEqual(contactoYaInteractuo([{ estatus: 'Confirmada sin notificar' }]), true);
  const antes = evaluarVentanaRecordatorio(ANTES_DE_VENTANA);
  assert.strictEqual(antes.cumplida, false);
  assert.strictEqual(antes.abreEl, '2026-09-23');
  assert.ok(antes.diasRestantes >= 1);
  const despues = evaluarVentanaRecordatorio(DENTRO_DE_VENTANA);
  assert.strictEqual(despues.cumplida, true);
  assert.strictEqual(despues.diasRestantes, 0);
}

async function casoAntesDeVentanaNoTocaNada() {
  limpiar();
  contactoBase('asistente-sin');
  porAsistente.set('asistente-sin', [{ id: 'cita-1', estatus: 'Aprobado' }]);
  const resultado = await enviarRecordatorioEvento({
    modoSimulacion: false,
    ahora: ANTES_DE_VENTANA,
  });
  assert.strictEqual(resultado.disparado, false);
  assert.strictEqual(resultado.motivo, 'VENTANA_NO_CUMPLIDA');
  assert.ok(resultado.diasRestantes >= 1);
  assert.strictEqual(llamadasCargarCitas, 0);
  assert.strictEqual(llamadasEnviarPlantilla, 0);
  assert.strictEqual(marcadosRecordatorio.length, 0);
}

async function casoDespuesDeVentanaProcesaIgual() {
  limpiar();
  contactoBase('asistente-sin');
  porAsistente.set('asistente-sin', [{ id: 'cita-1', estatus: 'Sugerido' }]);
  const resultado = await enviarRecordatorioEvento({
    modoSimulacion: false,
    ahora: DENTRO_DE_VENTANA,
  });
  assert.strictEqual(resultado.disparado, true);
  assert.strictEqual(resultado.enviados, 1);
  assert.strictEqual(llamadasCargarCitas, 1);
}

async function casoSegundaCorridaNoReenvia() {
  limpiar();
  contactoBase('asistente-sin');
  porAsistente.set('asistente-sin', [{ id: 'cita-1', estatus: 'Aprobado' }]);
  const primera = await enviarRecordatorioEvento({
    modoSimulacion: false,
    ahora: DENTRO_DE_VENTANA,
  });
  assert.strictEqual(primera.enviados, 1);
  contactos['asistente-sin'].recordatorioEventoEnviado = true;
  envios.length = 0;
  llamadasEnviarPlantilla = 0;
  const segunda = await enviarRecordatorioEvento({
    modoSimulacion: false,
    ahora: DENTRO_DE_VENTANA,
  });
  assert.strictEqual(segunda.enviados, 0);
  assert.strictEqual(segunda.omitidosYaMarcado, 1);
  assert.strictEqual(envios.length, 0);
}

async function casoNoCorrioUnDiaSeRecupera() {
  limpiar();
  contactoBase('asistente-sin');
  porAsistente.set('asistente-sin', [{ id: 'cita-1', estatus: 'Rechazado' }]);
  const resultado = await enviarRecordatorioEvento({
    modoSimulacion: false,
    ahora: DENTRO_DE_VENTANA,
  });
  assert.strictEqual(resultado.disparado, true);
  assert.strictEqual(resultado.enviados, 1);
  assert.strictEqual(marcadosRecordatorio.length, 1);
}

async function main() {
  casoSenalDeInteraccion();
  console.log('✅ Señal de interacción, 14 días y ventana 23-sep.');
  await casoAntesDeVentanaNoTocaNada();
  console.log('✅ Antes de la ventana: disparado false, sin Notion ni Plática.');
  await casoDespuesDeVentanaProcesaIgual();
  console.log('✅ Después de la ventana procesa como antes.');
  await casoSegundaCorridaNoReenvia();
  console.log('✅ Segunda corrida no reenvía a quien ya tiene el checkbox.');
  await casoNoCorrioUnDiaSeRecupera();
  console.log('✅ Si el cron falló el 23, el 24 envía igual sin intervención.');
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
