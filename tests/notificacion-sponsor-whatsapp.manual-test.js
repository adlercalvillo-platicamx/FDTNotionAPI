// node tests/notificacion-sponsor-whatsapp.manual-test.js

const assert = require('assert');
const svc = require('../src/services/notificacion-sponsor-whatsapp.service');

const inicio = '2026-10-07T10:30:00-06:00';

assert.strictEqual(svc.modalidadParaPlantilla('Virtual'), 'Virtual');
assert.strictEqual(svc.modalidadParaPlantilla('Presencial VIP'), 'Presencial');
assert.strictEqual(svc.modalidadParaPlantilla('Breakfast'), 'Presencial');
assert.strictEqual(svc.modalidadParaPlantilla('Speaker'), 'Presencial');

assert.strictEqual(
  svc.personaYEmpresa({ nombre: 'PATRICIA LOPEZ', empresa: 'NOMADAS' }),
  'Patricia Lopez, de Nomadas'
);
assert.strictEqual(
  svc.personaYEmpresa({ nombre: 'María López', empresa: 'Flexi' }),
  'María López, de Flexi'
);

const piezas = svc.piezasAgenda({
  inicio,
  mesa: 'Mesa 6',
  ticketTipo: 'Presencial VIP',
  nombre: 'PATRICIA LOPEZ',
  empresa: 'NOMADAS',
});
assert.strictEqual(
  svc.lineaDesdePiezas(piezas),
  '7 oct 10:30 am, Patricia Lopez de Nomadas, mesa 6, presencial'
);

const agendada = svc.paramsAgendadaOModificada({
  primerNombreSponsor: 'MARCO',
  nombreAsistente: 'PATRICIA LOPEZ',
  empresaAsistente: 'NOMADAS',
  inicio,
  mesa: 6,
  ticketTipo: 'Presencial VIP',
  agenda: '7 oct 10:30 am, Patricia Lopez de Nomadas, mesa 6, presencial',
});
assert.strictEqual(agendada[0], 'Marco');
assert.strictEqual(agendada[1], 'Patricia Lopez, de Nomadas');
assert.strictEqual(agendada[2], svc.fechaCitaParaPlantilla(inicio));
assert.strictEqual(agendada[3], '10:30 am');
assert.strictEqual(agendada[4], '6');
assert.strictEqual(agendada[5], 'Presencial');
assert.strictEqual(agendada.length, 7);

const cuerpo = svc.CUERPO_AGENDADA_O_MODIFICADA_BASE.agendada;
const armado = svc.rellenarCuerpo(cuerpo, agendada);
assert.ok(armado.length < 1024, armado.length);
assert.ok(!armado.includes('{{'));

const muchas = Array.from({ length: 30 }, (_, i) =>
  svc.piezasAgenda({
    inicio: `2026-10-07T${String(10 + (i % 8)).padStart(2, '0')}:00:00-06:00`,
    mesa: i + 1,
    ticketTipo: 'Virtual',
    nombre: `ASISTENTE CON NOMBRE LARGO NUMERO ${i} DE PRUEBA`,
    empresa: `EMPRESA LARGUISIMA NUMERO ${i}`,
  })
);
const agendaCorta = svc.agendaQueCabe(cuerpo, agendada.slice(0, 6), muchas);
const mensajeCorto = svc.rellenarCuerpo(cuerpo, agendada.slice(0, 6).concat(agendaCorta));
assert.ok(mensajeCorto.length <= 1000, mensajeCorto.length);
assert.ok(agendaCorta.includes('Pídeme el resto por aquí.'));

assert.strictEqual(svc.agendaQueCabe(cuerpo, agendada.slice(0, 6), []), svc.AGENDA_VACIA);

const cancelada = svc.paramsCancelada({
  primerNombreSponsor: 'Marco',
  nombreAsistente: 'LUIS ALBERTO RANDO',
  empresaAsistente: 'FLEXI',
  inicio,
  ticketTipo: 'Speaker',
  agenda: svc.AGENDA_VACIA,
});
assert.strictEqual(cancelada[1], 'Luis Alberto Rando, de Flexi');
assert.strictEqual(cancelada[4], 'Presencial');
assert.strictEqual(cancelada.length, 6);
assert.ok(svc.rellenarCuerpo(svc.CUERPO_CANCELADA, cancelada).length < 1024);

const recordatorio = svc.paramsRecordatorio24h({
  primerNombreSponsor: 'Marco',
  agenda: agendada[6],
});
assert.strictEqual(recordatorio.length, 2);
assert.ok(svc.rellenarCuerpo(svc.CUERPO_RECORDATORIO_24H, recordatorio).includes('dos días'));

console.log('notificacion-sponsor-whatsapp.manual-test: OK');
