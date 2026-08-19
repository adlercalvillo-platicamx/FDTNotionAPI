// Regresión de títulos/presentación por empresa y texto multipart de Notion.
// No toca Notion real.

const assert = require('assert');

process.env.NOTION_CITAS_DATA_SOURCE_ID =
  process.env.NOTION_CITAS_DATA_SOURCE_ID || 'fake-for-company-title-test';

const { parsearContacto } = require('../src/services/contactos.service');

const contactoMultipart = parsearContacto({
  id: 'contacto-multipart',
  properties: {
    Nombre: {
      title: [
        { plain_text: 'María ' },
        { plain_text: 'Fernanda' },
      ],
    },
    Empresa: {
      rich_text: [
        { plain_text: 'Fashion ' },
        { text: { content: 'Group México' } },
      ],
    },
  },
});

assert.strictEqual(contactoMultipart.nombre, 'María Fernanda');
assert.strictEqual(contactoMultipart.empresa, 'Fashion Group México');

const notionClientPath = require.resolve('../src/utils/notion-client');
const citasPath = require.resolve('../src/services/citas.service');
const llamadas = [];

require.cache[notionClientPath] = {
  id: notionClientPath,
  filename: notionClientPath,
  loaded: true,
  exports: {
    async notionFetch(path, options) {
      llamadas.push({ path, options });
      return { id: `pagina-${llamadas.length}` };
    },
  },
};
delete require.cache[citasPath];

const citas = require(citasPath);

(async () => {
  await citas.crearCitaSugerida({
    sponsorPageId: 'sponsor-1',
    asistentePageId: 'asistente-1',
    sponsorNombre: 'Persona Sponsor',
    asistenteNombre: 'Persona Asistente',
    sponsorEmpresa: 'Proveedor Uno',
    asistenteEmpresa: 'Marca Uno',
    score: 100,
    explicacion: 'Explicación de prueba',
  });

  const bodyEmpresa = JSON.parse(llamadas[0].options.body);
  assert.strictEqual(
    bodyEmpresa.properties.Nombre.title[0].text.content,
    'Sugerido: Marca Uno × Proveedor Uno'
  );

  await citas.crearCitaSugerida({
    sponsorPageId: 'sponsor-2',
    asistentePageId: 'asistente-2',
    sponsorNombre: 'Persona Sponsor Fallback',
    asistenteNombre: 'Persona Asistente Fallback',
    sponsorEmpresa: '',
    asistenteEmpresa: '',
    score: 90,
    explicacion: 'Explicación fallback',
  });

  const bodyFallback = JSON.parse(llamadas[1].options.body);
  assert.strictEqual(
    bodyFallback.properties.Nombre.title[0].text.content,
    'Sugerido: Persona Asistente Fallback × Persona Sponsor Fallback'
  );

  const { generarExplicacionNatural } = require('../src/services/matchmaking.service');
  const explicacion = generarExplicacionNatural(
    { nombre: 'Nombre que no debe mostrarse', empresa: 'Marca Visible', fuenteDato: 'Declarado' },
    {
      oroMolido: false,
      areaCoincidente: null,
      solucionesCoincidentes: [],
      coincidenciaTextoLibre: false,
      esVip: false,
      esPresencial: false,
      madurezNegocio: null,
      cuotaPendiente: 0,
      fuenteInferida: false,
    }
  );
  assert.ok(explicacion.startsWith('Se sugiere a Marca Visible porque'));
  assert.ok(!explicacion.includes('Nombre que no debe mostrarse'));

  console.log('✅ Notion multipart no trunca nombre ni empresa');
  console.log('✅ sugerencia usa Empresa × Empresa y fallback seguro');
  console.log('✅ explicación presenta la empresa, no la persona');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
