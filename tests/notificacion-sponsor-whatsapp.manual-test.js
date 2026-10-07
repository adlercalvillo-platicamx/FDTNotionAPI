// node tests/notificacion-sponsor-whatsapp.manual-test.js

const assert = require('assert');
const svc = require('../src/services/notificacion-sponsor-whatsapp.service');

const inicio = '2026-10-07T10:30:00-06:00';

assert.strictEqual(svc.modalidadParaPlantilla('Virtual'), 'Virtual');
assert.strictEqual(svc.modalidadParaPlantilla('Presencial VIP'), 'Presencial');
assert.strictEqual(svc.modalidadParaPlantilla('Breakfast'), 'Presencial');
assert.strictEqual(svc.modalidadParaPlantilla('Speaker'), 'Presencial');

const agendada = svc.paramsAgendadaOModificada({
  empresaAsistente: 'Tiendanube',
  inicio,
  mesa: 3,
  ticketTipo: 'Virtual',
});
assert.strictEqual(agendada[0], 'Tiendanube');
assert.strictEqual(agendada[1], svc.fechaCitaParaPlantilla(inicio));
assert.strictEqual(agendada[2], '10:30 am');
assert.strictEqual(agendada[3], '3');
assert.strictEqual(agendada[4], 'Virtual');

const cancelada = svc.paramsCancelada({
  empresaAsistente: 'Tiendanube',
  inicio,
  ticketTipo: 'Presencial',
});
assert.strictEqual(cancelada[2], '10:30 am');
assert.strictEqual(cancelada[3], 'Presencial');

console.log('notificacion-sponsor-whatsapp.manual-test: OK');
