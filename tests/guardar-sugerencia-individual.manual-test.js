// Valida que se pueda guardar UNA sola sugerencia sin escribir el bloque
// completo, y que la explicación siempre venga del backend.

const assert = require('assert');

const contactosPath = require.resolve('../src/services/contactos.service');
const citasPath = require.resolve('../src/services/citas.service');
const matchmakingPath = require.resolve('../src/services/matchmaking.service');

const sponsor = {
  id: 'sponsor-1',
  nombre: 'Sponsor Uno',
  categoria: 'Sponsor',
  empresa: 'Proveedor Uno',
  etapaClienteBuscada: ['Venta por redes sociales'],
  solucion: ['Logistica / fulfillment'],
  puestosBuscados: ['Direccion General / Founder / CEO'],
  clientesActuales: '',
  clientesPotencialesDeseados: '',
  nivelPatrocinio: 'Oro',
  citasMinimasPrometidas: 2,
  calendarioGoogleId: 'cal-1',
};

const candidatos = [
  {
    id: 'asistente-1',
    nombre: 'Asistente Uno',
    categoria: 'Asistente',
    empresa: 'Marca Uno',
    ticketTipo: 'Presencial',
    etapaDeNegocio: 'Vendo principalmente por redes sociales',
    area: 'Direccion General / Founder / CEO',
    solucionesBuscadas: ['Logistica / fulfillment'],
    otraSolucionBuscada: '',
    fuenteDato: 'Declarado',
  },
  {
    id: 'asistente-2',
    nombre: 'Asistente Dos',
    categoria: 'Asistente',
    empresa: 'Marca Dos',
    ticketTipo: 'Presencial',
    etapaDeNegocio: 'Vendo principalmente por redes sociales',
    area: 'Direccion General / Founder / CEO',
    solucionesBuscadas: [],
    otraSolucionBuscada: '',
    fuenteDato: 'Declarado',
  },
];

const creadas = [];

require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    async obtenerContacto(id) {
      if (id === sponsor.id) return sponsor;
      const candidato = candidatos.find((c) => c.id === id);
      if (candidato) return candidato;
      throw new Error(`contacto no encontrado: ${id}`);
    },
    async buscarAsistentesCandidatos() {
      return candidatos;
    },
    async listarSponsorsActivos() {
      return [sponsor];
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
    async crearCitaSugerida(args) {
      creadas.push(args);
      return { id: `cita-${creadas.length}` };
    },
  },
};

delete require.cache[matchmakingPath];
const { guardarSugerenciaIndividual } = require(matchmakingPath);

(async () => {
  const resultado = await guardarSugerenciaIndividual(sponsor.id, 'asistente-2');

  assert.strictEqual(creadas.length, 1, 'debe crear exactamente una fila');
  assert.strictEqual(creadas[0].asistentePageId, 'asistente-2');
  assert.strictEqual(resultado.guardada, true);
  assert.strictEqual(resultado.sugerencia.id, 'asistente-2');
  assert.ok(resultado.sugerencia.explicacion, 'debe devolver explicación');
  assert.strictEqual(creadas[0].explicacion, resultado.sugerencia.explicacion);

  await assert.rejects(
    () => guardarSugerenciaIndividual(sponsor.id, 'no-elegible'),
    /no es una sugerencia válida actual/
  );
  assert.strictEqual(creadas.length, 1, 'un par inválido no debe escribir nada');

  console.log('✅ guarda solo la sugerencia elegida');
  console.log('✅ devuelve y persiste la explicación generada por backend');
  console.log('✅ rechaza pares no elegibles sin escribir');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
