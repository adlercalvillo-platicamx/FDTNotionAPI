// Disponibilidad común + selección conversacional de horarios, sin Notion.
//
//   node tests/horarios-oferta.manual-test.js

const assert = require('assert');

process.env.NOTION_CITAS_DATA_SOURCE_ID = 'fake-horarios-oferta';
process.env.CITAS_FECHAS_EVENTO = '2026-10-07,2026-10-08';
process.env.CITAS_HORA_INICIO_2026_10_07 = '10:30';
process.env.CITAS_HORA_FIN_2026_10_07 = '19:00';
process.env.CITAS_HORA_INICIO_2026_10_08 = '09:00';
process.env.CITAS_HORA_FIN_2026_10_08 = '18:00';
process.env.CITAS_DURACION_BLOQUE_MINUTOS = '30';
process.env.CITAS_ZONA_HORARIA_OFFSET = '-06:00';
process.env.CITAS_CORTE_MANANA_TARDE = '14:00';

const {
  bloquesDisponiblesParaSponsor,
  seleccionarHorariosParaOferta,
  formatearHorarioLegible,
  scoreDeFilaCita,
} = require('../src/services/citas.service');

function bloque(inicio) {
  return { inicio, disponible: true };
}

function iniciosDe(elegidos) {
  return elegidos.map((b) => b.inicio);
}

function casoAmbosDiasCompletos() {
  const elegidos = seleccionarHorariosParaOferta([
    bloque('2026-10-07T10:30:00-06:00'),
    bloque('2026-10-07T11:00:00-06:00'),
    bloque('2026-10-07T14:00:00-06:00'),
    bloque('2026-10-07T14:30:00-06:00'),
    bloque('2026-10-08T09:00:00-06:00'),
    bloque('2026-10-08T14:00:00-06:00'),
  ]);
  assert.deepStrictEqual(iniciosDe(elegidos), [
    '2026-10-07T10:30:00-06:00',
    '2026-10-07T14:00:00-06:00',
    '2026-10-08T09:00:00-06:00',
  ]);
  assert.strictEqual(new Set(iniciosDe(elegidos)).size, 3);
}

function caso1MananaDia1YaPaso() {
  const ahora = new Date('2026-10-07T15:00:00-06:00');
  const elegidos = seleccionarHorariosParaOferta(
    [
      bloque('2026-10-07T10:30:00-06:00'),
      bloque('2026-10-07T14:00:00-06:00'),
      bloque('2026-10-07T15:00:00-06:00'),
      bloque('2026-10-07T15:30:00-06:00'),
      bloque('2026-10-08T09:00:00-06:00'),
      bloque('2026-10-08T14:00:00-06:00'),
    ],
    3,
    { ahora }
  );
  assert.deepStrictEqual(iniciosDe(elegidos), [
    '2026-10-07T15:30:00-06:00',
    '2026-10-07T15:00:00-06:00',
    '2026-10-08T09:00:00-06:00',
  ]);
  assert.strictEqual(new Set(iniciosDe(elegidos)).size, 3);
}

function caso2SinDia2() {
  const elegidos = seleccionarHorariosParaOferta([
    bloque('2026-10-07T10:30:00-06:00'),
    bloque('2026-10-07T11:00:00-06:00'),
    bloque('2026-10-07T14:00:00-06:00'),
    bloque('2026-10-07T14:30:00-06:00'),
  ]);
  assert.deepStrictEqual(iniciosDe(elegidos), [
    '2026-10-07T10:30:00-06:00',
    '2026-10-07T14:00:00-06:00',
    '2026-10-07T11:00:00-06:00',
  ]);
  assert.ok(elegidos.every((b) => b.inicio.startsWith('2026-10-07')));
}

function caso3SinTardeDia1() {
  const elegidos = seleccionarHorariosParaOferta([
    bloque('2026-10-07T10:30:00-06:00'),
    bloque('2026-10-08T09:00:00-06:00'),
    bloque('2026-10-08T09:30:00-06:00'),
    bloque('2026-10-08T14:00:00-06:00'),
  ]);
  assert.deepStrictEqual(iniciosDe(elegidos), [
    '2026-10-07T10:30:00-06:00',
    '2026-10-08T09:30:00-06:00',
    '2026-10-08T09:00:00-06:00',
  ]);
}

function casoMenosDeTres() {
  const elegidos = seleccionarHorariosParaOferta([
    bloque('2026-10-07T10:30:00-06:00'),
    bloque('2026-10-08T14:00:00-06:00'),
  ]);
  assert.strictEqual(elegidos.length, 2);
  assert.deepStrictEqual(iniciosDe(elegidos), [
    '2026-10-07T10:30:00-06:00',
    '2026-10-08T14:00:00-06:00',
  ]);
}

function casoDescartaHorariosPasadosConMismoMargenDeModificar() {
  const ahora = new Date('2026-10-07T11:05:01-06:00');
  const elegidos = seleccionarHorariosParaOferta(
    [
      bloque('2026-10-07T10:30:00-06:00'),
      bloque('2026-10-07T11:00:00-06:00'),
      bloque('2026-10-07T11:30:00-06:00'),
      bloque('2026-10-07T14:00:00-06:00'),
    ],
    3,
    { ahora }
  );
  assert.deepStrictEqual(iniciosDe(elegidos), [
    '2026-10-07T11:30:00-06:00',
    '2026-10-07T14:00:00-06:00',
  ]);
}

function casoDisponibilidadDelSponsorTopNoCruzaConOtros() {
  const ocupadaTop = '2026-10-07T10:30:00-06:00';
  const ocupadaOtro = '2026-10-07T11:30:00-06:00';
  const llena = '2026-10-07T11:00:00-06:00';
  const indice = new Map([
    [ocupadaTop, { count: 1, sponsorIds: new Set(['sponsor-a']) }],
    [ocupadaOtro, { count: 1, sponsorIds: new Set(['sponsor-b']) }],
    [llena, { count: 11, sponsorIds: new Set() }],
  ]);
  const delTop = bloquesDisponiblesParaSponsor({
    sponsorPageId: 'sponsor-a',
    indiceConfirmadas: indice,
  });
  assert.ok(!delTop.some((b) => b.inicio === ocupadaTop), 'el top ocupado no se ofrece');
  assert.ok(delTop.some((b) => b.inicio === ocupadaOtro), 'ocupación de otro sponsor no bloquea al top');
  assert.ok(!delTop.some((b) => b.inicio === llena), 'capacidad de 11 mesas sigue bloqueando');
}

function casoFormatoLegible() {
  assert.strictEqual(
    formatearHorarioLegible('2026-10-07T10:30:00-06:00'),
    'miércoles, 7 de octubre, 10:30 h'
  );
}

function casoScoreFormulaYFallbackNotas() {
  assert.strictEqual(
    scoreDeFilaCita({ properties: { 'Score (de Notas)': { formula: { number: 42.5 } } } }),
    42.5
  );
  assert.strictEqual(
    scoreDeFilaCita({
      properties: {
        Notas: { rich_text: [{ plain_text: 'Score: 37\nCoincidencia directa' }] },
      },
    }),
    37
  );
}

casoAmbosDiasCompletos();
caso1MananaDia1YaPaso();
caso2SinDia2();
caso3SinTardeDia1();
casoMenosDeTres();
casoDescartaHorariosPasadosConMismoMargenDeModificar();
casoDisponibilidadDelSponsorTopNoCruzaConOtros();
casoFormatoLegible();
casoScoreFormulaYFallbackNotas();
console.log('✅ Selección compartida: casillas Día1 Mañana/Tarde + Día2, relleno, exclusión de pasados, ocupación propia, formato y score.');
