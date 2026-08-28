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
  armarBloqueDisponibilidad,
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

function casoAsistenteOcupadoNoSeOfreceNiImpideOtroBloque() {
  const ocupadoAsistente = '2026-10-07T11:00:00-06:00';
  const libreOtro = '2026-10-07T14:00:00-06:00';
  const asistente = 'asistente-luis';
  const indice = new Map([
    [
      ocupadoAsistente,
      {
        count: 1,
        sponsorIds: new Set(['sponsor-a']),
        asistenteIds: new Set([asistente.replace(/-/g, '')]),
      },
    ],
  ]);
  const paraB = bloquesDisponiblesParaSponsor({
    sponsorPageId: 'sponsor-b',
    indiceConfirmadas: indice,
    asistentePageId: asistente,
  });
  assert.ok(!paraB.some((b) => b.inicio === ocupadoAsistente), 'no ofrece el bloque donde el asistente ya tiene cita');
  assert.ok(paraB.some((b) => b.inicio === libreOtro), 'sí ofrece un bloque que no se traslapa');

  const ocupado = armarBloqueDisponibilidad({
    inicio: ocupadoAsistente,
    sponsorOcupado: false,
    asistenteOcupado: true,
    citasEnBloque: 1,
  });
  assert.strictEqual(ocupado.disponible, false);
  assert.strictEqual(ocupado.motivo, 'ASISTENTE_YA_OCUPADO');

  const elegidos = seleccionarHorariosParaOferta([
    bloque('2026-10-07T10:30:00-06:00'),
    bloque('2026-10-07T14:00:00-06:00'),
    bloque('2026-10-08T09:00:00-06:00'),
  ]);
  assert.ok(!iniciosDe(elegidos).includes(ocupadoAsistente));
}

function casoPedidoDeLas15hEntraAunqueLasCasillasElijianLas14() {
  const dia7 = [];
  for (const h of ['10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30']) {
    dia7.push(bloque(`2026-10-07T${h}:00-06:00`));
  }
  const sinPedido = seleccionarHorariosParaOferta(dia7);
  assert.deepStrictEqual(iniciosDe(sinPedido), [
    '2026-10-07T10:30:00-06:00',
    '2026-10-07T14:00:00-06:00',
    '2026-10-07T11:00:00-06:00',
  ]);
  assert.ok(!iniciosDe(sinPedido).includes('2026-10-07T15:00:00-06:00'));

  const conPedido = seleccionarHorariosParaOferta(dia7, 3, { priorizarHora: '15:00' });
  assert.strictEqual(conPedido[0].inicio, '2026-10-07T15:00:00-06:00');
  assert.strictEqual(new Set(iniciosDe(conPedido)).size, 3);
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
casoAsistenteOcupadoNoSeOfreceNiImpideOtroBloque();
casoPedidoDeLas15hEntraAunqueLasCasillasElijianLas14();
casoFormatoLegible();
casoScoreFormulaYFallbackNotas();
console.log('✅ Selección compartida: casillas Día1 Mañana/Tarde + Día2, relleno, exclusión de pasados, ocupación propia, formato y score.');
