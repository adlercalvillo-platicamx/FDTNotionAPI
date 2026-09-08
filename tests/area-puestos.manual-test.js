// Filtro duro de Área: Puestos Buscados del sponsor × Area del asistente.
//
//   node tests/area-puestos.manual-test.js

const assert = require('assert');

const contactosPath = require.resolve('../src/services/contactos.service');
const citasPath = require.resolve('../src/services/citas.service');
const servicePath = require.resolve('../src/services/matchmaking.service');

const AREA_CEO = 'Direccion General / Founder / CEO';
const AREA_MARKETING = 'Marketing / Branding / Comunicacion / PR';
const TAMANO_GRANDE = 'Grande - más de 250 empleados';

const sponsor = {
  id: 'sponsor-area',
  nombre: 'Sponsor Área',
  empresa: 'Sponsor Área',
  categoria: 'Sponsor',
  nivelPatrocinio: 'Oro',
  citasMinimasPrometidas: 10,
  etapaClienteBuscada: ['Grande'],
  puestosBuscados: [AREA_CEO],
  solucion: ['Pagos'],
  clientesActuales: '',
  clientesPotencialesDeseados: '',
};

function candidato(id, area, ticketTipo = 'Virtual') {
  return {
    id,
    nombre: id,
    empresa: id,
    categoria: 'Asistente',
    ticketTipo,
    tamanoNegocio: TAMANO_GRANDE,
    madurezNegocioExa: null,
    area,
    solucionesBuscadas: ['Pagos'],
    otraSolucionBuscada: '',
    fuenteDato: null,
  };
}

const candidatos = [
  candidato('area-exacta', AREA_CEO),
  candidato('area-distinta', AREA_MARKETING),
  candidato('area-vacia', null),
  candidato('area-otro', 'Otro'),
  candidato('vip-area-distinta', AREA_MARKETING, 'Presencial VIP'),
  candidato('speaker-area-distinta', AREA_MARKETING, 'Speaker'),
];

require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    async obtenerContacto(id) {
      if (id === sponsor.id) return sponsor;
      return candidatos.find((c) => c.id === id);
    },
    async buscarAsistentesCandidatos() {
      return candidatos;
    },
  },
};

require.cache[citasPath] = {
  id: citasPath,
  filename: citasPath,
  loaded: true,
  exports: {
    async existeCitaActivaEntre() {
      return false;
    },
    async contarCitasConfirmadasPorSponsor() {
      return 0;
    },
  },
};

delete require.cache[servicePath];
const {
  esCandidatoPorArea,
  sugerirMatchesParaSponsor,
} = require('../src/services/matchmaking.service');

async function main() {
  assert.strictEqual(esCandidatoPorArea(candidato('x', AREA_CEO), [AREA_CEO]), true);
  assert.strictEqual(esCandidatoPorArea(candidato('x', AREA_MARKETING), [AREA_CEO]), false);
  assert.strictEqual(esCandidatoPorArea(candidato('x', null), [AREA_CEO]), true);
  assert.strictEqual(esCandidatoPorArea(candidato('x', 'Otro'), [AREA_CEO]), true);
  assert.strictEqual(esCandidatoPorArea(candidato('x', AREA_MARKETING), []), true);
  assert.strictEqual(esCandidatoPorArea(candidato('x', AREA_MARKETING), ['Otro']), true);

  const filtrado = await sugerirMatchesParaSponsor(sponsor.id, {
    topN: 20,
    escribirEnNotion: false,
  });
  const idsFiltrados = filtrado.sugerencias.map((s) => s.id);
  assert.deepStrictEqual(
    [...idsFiltrados].sort(),
    ['area-exacta', 'area-otro', 'area-vacia'].sort()
  );
  assert.ok(!idsFiltrados.includes('vip-area-distinta'), 'VIP no salta el filtro de Área');
  assert.ok(!idsFiltrados.includes('speaker-area-distinta'), 'Speaker no salta el filtro de Área');

  sponsor.puestosBuscados = [];
  const sinFiltro = await sugerirMatchesParaSponsor(sponsor.id, {
    topN: 20,
    escribirEnNotion: false,
  });
  assert.strictEqual(sinFiltro.sugerencias.length, candidatos.length);

  sponsor.citasMinimasPrometidas = 2;
  const conTopNDefault = await sugerirMatchesParaSponsor(sponsor.id, {
    escribirEnNotion: false,
  });
  assert.strictEqual(
    conTopNDefault.sugerencias.length,
    4,
    'topN default debe seguir siendo cuota prometida (2) + margen (2)'
  );

  console.log('✅ Área exacta entra; distinta sale; vacía/Otro entra; VIP/Speaker no hacen bypass; topN conserva cuota+margen.');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
