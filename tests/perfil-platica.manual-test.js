// Perfil de Plática hidratado desde Notion, sin llamadas reales.
// node tests/perfil-platica.manual-test.js

const assert = require('assert');

const contactosPath = require.resolve('../src/services/contactos.service');
const citasPath = require.resolve('../src/services/citas.service');
const perfilPath = require.resolve('../src/services/perfil-platica.service');

const contacto = {
  id: 'asistente-1',
  nombre: 'ANA MARIA PEREZ',
  empresa: 'Moda MX',
  email: 'ana@example.com',
  whatsapp: '+52 1 449 000 0000',
  area: 'Ecommerce',
  rolPuesto: 'DIRECTOR DE TECNOLOGIA',
  solucionesBuscadas: ['Pagos', 'Logística'],
  tamanoNegocio: 'Mediana - 50 a 250 empleados',
  ticketTipo: 'Presencial VIP',
  giroIndustria: 'Marca de moda',
  linkedinInstagram: '@ADLERCALVILLO',
  webRedes: 'EMPRESAADLER.MX',
};

require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    async obtenerContacto() {
      return contacto;
    },
    async buscarAsistentePorWhatsApp() {
      return contacto;
    },
  },
};

require.cache[citasPath] = {
  id: citasPath,
  filename: citasPath,
  loaded: true,
  exports: {
    async listarCitasRealesPorAsistente(_id, opciones) {
      assert.deepStrictEqual(opciones, { incluirCompletadas: true });
      return [
        {
          inicio: '2026-10-08T09:00:00-06:00',
          sponsorEmpresa: 'Sponsor B',
        },
        {
          inicio: '2026-10-07T10:30:00-06:00',
          sponsorEmpresa: 'Sponsor A',
        },
      ];
    },
    formatearHorarioLegible(inicio) {
      return inicio.slice(0, 16);
    },
  },
};

delete require.cache[perfilPath];
const { hidratarPerfilPlatica, payloadPerfil, nombreParaPerfilPlatica } = require(perfilPath);

async function main() {
  assert.deepStrictEqual(nombreParaPerfilPlatica('ADLER CALVILLO'), {
    name: 'Adler Calvillo',
    firstname: 'Adler',
    lastname: 'Calvillo',
  });
  assert.deepStrictEqual(nombreParaPerfilPlatica('ANA MARIA PEREZ LOPEZ'), {
    name: 'Ana Maria Perez Lopez',
    firstname: 'Ana Maria',
    lastname: 'Perez Lopez',
  });

  const directo = payloadPerfil(contacto, []);
  assert.strictEqual(directo.name, 'Ana Maria Perez');
  assert.strictEqual(directo.firstname, 'Ana Maria');
  assert.strictEqual(directo.lastname, 'Perez');
  assert.strictEqual(directo.company, 'Moda MX');
  assert.strictEqual(directo.customFields.role_puesto, 'Director De Tecnologia');
  assert.strictEqual(directo.customFields.redes_sociales, '@adlercalvillo | empresaadler.mx');
  assert.deepStrictEqual(directo.customFields.soluciones_buscadas, ['Pagos', 'Logística']);
  assert.strictEqual(directo.customFields.quiere_cita_1_a_1, undefined);

  let escritura;
  const resultado = await hidratarPerfilPlatica({
    asistentePageId: contacto.id,
    actualizarClienteFn: async (payload) => {
      escritura = payload;
    },
  });

  assert.strictEqual(resultado.numeroCitasConfirmadas, 2);
  assert.strictEqual(escritura.phone, contacto.whatsapp);
  assert.strictEqual(escritura.customFields.numero_de_citas_confirmadas, 2);
  assert.deepStrictEqual(escritura.customFields.citas_confirmadas, [
    'Sponsor A — 2026-10-07T10:30',
    'Sponsor B — 2026-10-08T09:00',
  ]);
  assert.strictEqual(directo.customFields.role_puesto, 'Director De Tecnologia');
  assert.strictEqual(directo.customFields.redes_sociales, '@adlercalvillo | empresaadler.mx');
  assert.strictEqual(escritura.customFields.bio_antecedentes, undefined);

  console.log('✅ Nombre Ticketópolis se parte en Title Case, primer+segundo nombre y apellido.');
  console.log('✅ Citas confirmadas se ordenan y se guardan como lista para viñetas.');
  console.log('✅ Quiere Citas 1a1 no viaja al perfil de Plática.');
}

main().catch((error) => {
  console.error('❌', error);
  process.exit(1);
});
