// tests/matchmaking-global.manual-test.js
//
// Escenario armado a propósito (no son los 3 contactos de ejemplo de
// Notion) para validar que sugerirMatchesGlobal detecta correctamente un
// solapamiento real: dos sponsors de niveles distintos (Diamante y Oro)
// ambos con a Ana como candidata fuerte — se espera que el resultado la
// marque como solapamiento, con Diamante primero en el orden de prioridad.

const path = require('path');

const contactosRealPath = require.resolve('../src/services/contactos.service');
const citasRealPath = require.resolve('../src/services/citas.service');

const SPONSOR_DIAMANTE = {
  id: 'marco-diamante',
  nombre: 'Marco Reyes (ejemplo)',
  categoria: 'Sponsor',
  empresa: 'Cloudia Software',
  rolPuesto: 'Director Comercial',
  servicios: 'Suite de gestión omnicanal para retail',
  intencionComercial: '',
  ticketTipo: null,
  etapaDeNegocio: null,
  etapaClienteBuscada: ['Operacion basica de e-commerce'],
  solucion: ['Omnichannel'],
  puestosBuscados: ['Direccion General / Founder / CEO'],
  clientesActuales: '',
  clientesPotencialesDeseados: '', // sin "oro molido" a propósito, para que el score dependa de puesto/cuota
  nivelPatrocinio: 'Diamante',
  citasMinimasPrometidas: 4,
  fuenteDato: 'Inferido',
  esVip: false,
  matchSugerido: [],
};

const SPONSOR_ORO = {
  id: 'laura-espinoza',
  nombre: 'Laura Espinoza Rentería (ejemplo)',
  categoria: 'Sponsor',
  empresa: 'Textiles del Bajío',
  rolPuesto: 'Directora Comercial',
  servicios: 'Manufactura de calzado y maquila para marcas terceras',
  intencionComercial: '',
  ticketTipo: null,
  etapaDeNegocio: null,
  etapaClienteBuscada: ['Operacion basica de e-commerce'],
  solucion: ['Logistica / fulfillment'],
  puestosBuscados: ['Direccion General / Founder / CEO'],
  clientesActuales: '',
  clientesPotencialesDeseados: 'Boutique Marea',
  nivelPatrocinio: 'Oro',
  citasMinimasPrometidas: 2,
  fuenteDato: 'Inferido',
  esVip: false,
  matchSugerido: [],
};

const ASISTENTE_ANA = {
  id: 'ana-sofia-torres',
  nombre: 'Ana Sofía Torres (ejemplo)',
  categoria: 'Asistente',
  empresa: 'Boutique Marea',
  rolPuesto: 'Dueña',
  servicios: '',
  intencionComercial: 'Busca tecnología para digitalizar su tienda y proveedores de producción nacional.',
  ticketTipo: 'Presencial',
  etapaDeNegocio: 'Ya vendo en redes sociales - por lanzar e-commerce',
  etapaClienteBuscada: [],
  solucion: [],
  puestosBuscados: [],
  clientesActuales: '',
  clientesPotencialesDeseados: '',
  nivelPatrocinio: null,
  citasMinimasPrometidas: 0,
  fuenteDato: 'Declarado',
  esVip: false,
  madurezNegocioExa: 'Consolidado',
  matchSugerido: [],
};

const mockContactos = {
  listarSponsorsActivos: async () => [SPONSOR_DIAMANTE, SPONSOR_ORO],
  obtenerContacto: async (id) => {
    const todos = { [SPONSOR_DIAMANTE.id]: SPONSOR_DIAMANTE, [SPONSOR_ORO.id]: SPONSOR_ORO };
    if (!todos[id]) throw new Error(`[mock] contacto no encontrado: ${id}`);
    return todos[id];
  },
  buscarAsistentesCandidatos: async () => [ASISTENTE_ANA],
  sugerirMatches: async ({ sponsorPageId, asistentePageIds }) => {
    console.log(`  [mock] escribiría Match Sugerido en ${sponsorPageId} -> [${asistentePageIds.join(', ')}]`);
    return { ok: true };
  },
};

const mockCitas = {
  existeCitaActivaEntre: async () => false,
  contarCitasConfirmadasPorSponsor: async () => 0,
  async crearCitaSugerida({ sponsorNombre, asistenteNombre, score }) {
    console.log(`  [mock] crearCitaSugerida: ${asistenteNombre} × ${sponsorNombre} (score ${score})`);
    return { id: 'mock-cita' };
  },
  async obtenerParesConCitaActiva() {
    return new Set();
  },
  existeCitaActivaEntreEnCache(paresActivos, { sponsorPageId, asistentePageId }) {
    return paresActivos.has(`${sponsorPageId}|${asistentePageId}`);
  },
};

require.cache[contactosRealPath] = { id: contactosRealPath, filename: contactosRealPath, loaded: true, exports: mockContactos };
require.cache[citasRealPath] = { id: citasRealPath, filename: citasRealPath, loaded: true, exports: mockCitas };

const { sugerirMatchesGlobal } = require('../src/services/matchmaking.service');

async function main() {
  // escribirEnNotion: true explícito — el default de sugerirMatchesGlobal
  // cambió a false el 6 de agosto (ver matchmaking.service.js). Este test
  // sigue ejercitando el camino de escritura (mockeado en mockContactos.
  // sugerirMatches arriba) para no perder esa cobertura.
  const resultado = await sugerirMatchesGlobal({ topN: 3, escribirEnNotion: true });
  console.log('\n=== Resultado de sugerirMatchesGlobal ===');
  console.log(`Sponsors evaluados: ${resultado.totalSponsorsEvaluados}`);
  console.log(`Sponsors omitidos: ${resultado.totalSponsorsOmitidos}`);
  console.log(`Solapamientos detectados: ${resultado.totalSolapamientosDetectados}`);
  if (resultado.resultadosPorSponsor.length !== 2) {
    throw new Error('La corrida global debe devolver el detalle de ambos sponsors');
  }
  for (const item of resultado.resultadosPorSponsor) {
    for (const sugerencia of item.sugerencias) {
      if (!sugerencia.explicacion) {
        throw new Error(`Falta explicación para ${item.sponsor.nombre} × ${sugerencia.nombre}`);
      }
    }
  }
  for (const solapamiento of resultado.solapamientos) {
    for (const aparicion of solapamiento.ordenDePrioridad) {
      if (!aparicion.explicacion) {
        throw new Error(`Falta explicación en solapamiento ${solapamiento.asistenteNombre}`);
      }
    }
  }
  console.log(JSON.stringify(resultado.solapamientos, null, 2));
}

main().catch((err) => {
  console.error('Error en la prueba:', err);
  process.exit(1);
});
