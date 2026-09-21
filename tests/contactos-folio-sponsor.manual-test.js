const assert = require('assert');

process.env.NOTION_CONTACTOS_DATA_SOURCE_ID = 'contactos-test';

const notionPath = require.resolve('../src/utils/notion-client');

function richText(valor) {
  return { rich_text: valor ? [{ plain_text: valor }] : [] };
}

function title(valor) {
  return { title: valor ? [{ plain_text: valor }] : [] };
}

function contacto({ id, nombre, empresa, categoria, folioReservacion, folioBoleto }) {
  return {
    id,
    properties: {
      Nombre: title(nombre),
      Empresa: richText(empresa),
      Categoria: { select: { name: categoria } },
      'Dado de Baja': { checkbox: false },
      'Folio Reservacion': richText(folioReservacion),
      'Folio Boleto': richText(folioBoleto),
      'Nivel de Patrocinio': { select: { name: 'Oro' } },
    },
  };
}

const asistentes = [
  contacto({
    id: 'asistente-1',
    nombre: 'Ana Registro',
    empresa: 'Moda Uno',
    categoria: 'Asistente',
    folioReservacion: 'RES-100, RES-101',
    folioBoleto: 'BOL-500, BOL-501',
  }),
  contacto({
    id: 'asistente-2',
    nombre: 'Otro Registro',
    empresa: 'Moda Dos',
    categoria: 'Asistente',
    folioReservacion: 'RES-1000',
    folioBoleto: '',
  }),
];

const sponsors = [
  contacto({
    id: 'sponsor-ml',
    nombre: 'Rebeca Padilla',
    empresa: 'Mercado Libre',
    categoria: 'Sponsor',
  }),
  contacto({
    id: 'sponsor-tn',
    nombre: 'Ana Olhovich',
    empresa: 'Tienda Nube',
    categoria: 'Sponsor',
  }),
];

require.cache[notionPath] = {
  id: notionPath,
  filename: notionPath,
  loaded: true,
  exports: {
    notionFetch: async (_path, options = {}) => {
      const body = JSON.parse(options.body || '{}');
      const serializado = JSON.stringify(body.filter || {});
      return {
        results: serializado.includes('Folio ') ? asistentes : sponsors,
        has_more: false,
        next_cursor: null,
      };
    },
  },
};

const contactos = require('../src/services/contactos.service');

async function main() {
  const porReservacion = await contactos.buscarAsistentesPorFolio(' res-101 ');
  assert.deepStrictEqual(porReservacion.map((c) => c.id), ['asistente-1']);
  console.log('✅ folio de reservación normalizado y separado por comas');

  const porBoleto = await contactos.buscarAsistentesPorFolio('BOL-501');
  assert.deepStrictEqual(porBoleto.map((c) => c.id), ['asistente-1']);
  console.log('✅ folio de boleto encuentra el mismo asistente');

  const noPrefijo = await contactos.buscarAsistentesPorFolio('RES-100');
  assert.deepStrictEqual(noPrefijo.map((c) => c.id), ['asistente-1']);
  console.log('✅ igualdad de token evita confundir RES-100 con RES-1000');

  const exacto = await contactos.resolverSponsorPorEmpresa('Mercadolibre');
  assert.strictEqual(exacto.estado, 'unico');
  assert.strictEqual(exacto.sponsor.id, 'sponsor-ml');
  console.log('✅ nombre sin espacio resuelve Mercado Libre');

  const alias = await contactos.resolverSponsorPorEmpresa('Meli');
  assert.strictEqual(alias.estado, 'unico');
  assert.strictEqual(alias.sponsor.id, 'sponsor-ml');
  console.log('✅ alias Meli resuelve Mercado Libre');

  const aproximado = await contactos.resolverSponsorPorEmpresa('TiendaNube');
  assert.strictEqual(aproximado.estado, 'unico');
  assert.strictEqual(aproximado.sponsor.id, 'sponsor-tn');
  console.log('✅ nombre aproximado resuelve Tienda Nube');

  const ausente = await contactos.resolverSponsorPorEmpresa('Empresa que no existe');
  assert.strictEqual(ausente.estado, 'no_encontrado');
  console.log('✅ empresa desconocida no se inventa');

  console.log('\n=== contactos folio/sponsor OK ===');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
