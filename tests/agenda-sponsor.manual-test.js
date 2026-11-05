// node tests/agenda-sponsor.manual-test.js

process.env.CITAS_FECHAS_EVENTO = '2026-10-07,2026-10-08';

const assert = require('assert');
const { armarRespuestaSponsor } = require('../src/services/citas.service');

const sponsor = { id: 'sp', nombre: 'MARCO TRUJILLO', empresa: 'PLATICA.MX' };
const citas = [
  {
    asistentePageId: 'a1',
    inicio: '2026-10-07T10:30:00-06:00',
    mesa: 'Mesa 6',
  },
  {
    asistentePageId: 'bloqueo',
    inicio: '2026-10-08T10:00:00-06:00',
    mesa: '',
  },
];
const contactos = new Map([
  ['a1', { nombre: 'PATRICIA LOPEZ', empresa: 'NOMADAS', ticketTipo: 'Presencial VIP' }],
  ['bloqueo', { nombre: 'Bloqueo de Agenda (Programa del Evento)', empresa: '', ticketTipo: '' }],
]);

const respuesta = armarRespuestaSponsor({
  sponsor,
  citas,
  contactosPorId: contactos,
  ahora: new Date('2026-11-04T12:00:00-06:00'),
});

assert.strictEqual(respuesta.es_sponsor, true);
assert.strictEqual(respuesta.puede_reservar, false);
assert.strictEqual(respuesta.puede_modificar, false);
assert.strictEqual(respuesta.puede_cancelar, false);
assert.strictEqual(respuesta.fase_evento, 'despues');
assert.strictEqual(respuesta.sugeridas_para_ofrecer.length, 0);
assert.strictEqual(respuesta.agenda_sponsor.length, 2);
assert.strictEqual(respuesta.agenda_sponsor[0].asistente_empresa, 'NOMADAS');
assert.strictEqual(respuesta.agenda_sponsor[0].modalidad, 'Presencial');
assert.strictEqual(respuesta.agenda_sponsor[0].mesa, 'Mesa 6');
assert.ok(!('email' in respuesta.agenda_sponsor[0]));
assert.strictEqual(respuesta.sponsor_nombre, 'MARCO TRUJILLO');

console.log('agenda-sponsor.manual-test: OK');
