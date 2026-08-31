// VIP salta el filtro duro de Tamaño de Negocio (Adler, 31-ago-2026).
// Giro/Industria sigue sin excepción para VIP.
//
//   node tests/vip-tamano-negocio.manual-test.js

const assert = require('assert');
const fs = require('fs');

const TAMANO_GRANDE = 'Grande - más de 250 empleados';
const TAMANO_MICRO = 'Micro - menos de 10 empleados';
const GIRO_MODA =
  'Marca de moda / Fashion brand (ropa - calzado - accesorios - belleza)';
const GIRO_FINTECH = 'Pagos / fintech';

const contactosPath = require.resolve('../src/services/contactos.service');
const citasPath = require.resolve('../src/services/citas.service');
const servicePath = require.resolve('../src/services/matchmaking.service');

const sponsor = {
  id: 'sponsor-1',
  nombre: 'Sponsor Test',
  categoria: 'Sponsor',
  empresa: 'Acme',
  nivelPatrocinio: 'Oro',
  citasMinimasPrometidas: 2,
  etapaClienteBuscada: [],
  clientesActuales: '',
  clientesPotencialesDeseados: '',
  puestosBuscados: [],
  solucion: [],
};

const GIROS_ELEGIBLES_MATCHMAKING = [
  'Marca de moda / Fashion brand (ropa - calzado - accesorios - belleza)',
  'Retailer / tienda multimarca / Marketplace',
  'Manufactura / produccion / sourcing',
];

const poolBruto = [
  {
    id: 'vip-vacio',
    nombre: 'VIP Vacío',
    empresa: 'VIP Vacío SA',
    categoria: 'Asistente',
    ticketTipo: 'Presencial VIP',
    esVip: true,
    tamanoNegocio: null,
    madurezNegocioExa: null,
    giroIndustria: GIRO_MODA,
  },
  {
    id: 'vip-micro',
    nombre: 'VIP Micro',
    empresa: 'VIP Micro SA',
    categoria: 'Asistente',
    ticketTipo: 'Presencial VIP',
    esVip: true,
    tamanoNegocio: TAMANO_MICRO,
    madurezNegocioExa: null,
    giroIndustria: GIRO_MODA,
  },
  {
    id: 'novip-vacio',
    nombre: 'No VIP Vacío',
    empresa: 'Vacio SA',
    categoria: 'Asistente',
    ticketTipo: 'Virtual',
    esVip: false,
    tamanoNegocio: null,
    madurezNegocioExa: null,
    giroIndustria: GIRO_MODA,
  },
  {
    id: 'novip-grande',
    nombre: 'No VIP Grande',
    empresa: 'Grande SA',
    categoria: 'Asistente',
    ticketTipo: 'Virtual',
    esVip: false,
    tamanoNegocio: TAMANO_GRANDE,
    madurezNegocioExa: null,
    giroIndustria: GIRO_MODA,
  },
  {
    id: 'vip-fintech',
    nombre: 'VIP Fintech',
    empresa: 'Pagos SA',
    categoria: 'Asistente',
    ticketTipo: 'Presencial VIP',
    esVip: true,
    tamanoNegocio: null,
    madurezNegocioExa: null,
    giroIndustria: GIRO_FINTECH,
  },
];

require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    async obtenerContacto(id) {
      if (id === sponsor.id) return sponsor;
      return poolBruto.find((a) => a.id === id);
    },
    async buscarAsistentesCandidatos() {
      // Mismo filtro de giro que contactos.service.js — VIP no es excepción.
      return poolBruto.filter((c) => GIROS_ELEGIBLES_MATCHMAKING.includes(c.giroIndustria));
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
const { esCandidatoPorTamanoNegocio, sugerirMatchesParaSponsor } = require('../src/services/matchmaking.service');

async function main() {
  let ok = 0;

  assert.strictEqual(
    esCandidatoPorTamanoNegocio({
      esVip: true,
      tamanoNegocio: null,
      madurezNegocioExa: null,
    }),
    true
  );
  ok += 1;
  console.log('1. VIP sin Tamaño ni Madurez Exa → entra');

  assert.strictEqual(
    esCandidatoPorTamanoNegocio({
      esVip: true,
      tamanoNegocio: TAMANO_MICRO,
      madurezNegocioExa: null,
    }),
    true
  );
  ok += 1;
  console.log('2. VIP con Tamaño Micro explícito → entra');

  assert.strictEqual(
    esCandidatoPorTamanoNegocio({
      esVip: false,
      tamanoNegocio: null,
      madurezNegocioExa: null,
    }),
    false
  );
  ok += 1;
  console.log('3. No-VIP sin Tamaño ni Madurez Exa → sigue fuera');

  assert.strictEqual(
    esCandidatoPorTamanoNegocio({
      esVip: false,
      tamanoNegocio: TAMANO_GRANDE,
      madurezNegocioExa: null,
    }),
    true
  );
  ok += 1;
  console.log('4. No-VIP Grande → sigue dentro');

  const srcContactos = fs.readFileSync(contactosPath, 'utf8');
  assert.ok(
    srcContactos.includes('no hay excepción para VIP'),
    'el filtro de Giro en contactos.service.js debe seguir sin excepción VIP'
  );
  assert.ok(!/if \(c\.esVip\) return true/.test(srcContactos));

  const r = await sugerirMatchesParaSponsor(sponsor.id, { topN: 20, escribirEnNotion: false });
  const ids = r.sugerencias.map((s) => s.id);
  assert.ok(ids.includes('vip-vacio'));
  assert.ok(ids.includes('vip-micro'));
  assert.ok(ids.includes('novip-grande'));
  assert.ok(!ids.includes('novip-vacio'));
  assert.ok(!ids.includes('vip-fintech'), 'VIP con giro fuera de los 3 elegibles no entra');
  ok += 1;
  console.log('5. VIP giro Pagos/fintech excluido en sugerirMatchesParaSponsor; VIP vacío de moda sí entra');

  assert.strictEqual(ok, 5);
  console.log('\n✅ vip-tamano-negocio 5/5');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
