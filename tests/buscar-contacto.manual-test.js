// GET /contactos/buscar — resolución por teléfono / nombre / empresa.
// Mockea notionFetch; no toca Notion real.
//
//   node tests/buscar-contacto.manual-test.js

const assert = require('assert');

process.env.NOTION_CONTACTOS_DATA_SOURCE_ID = 'fake-contactos-ds';

const notionPath = require.resolve('../src/utils/notion-client');
const contactosPath = require.resolve('../src/services/contactos.service');
const controllerPath = require.resolve('../src/controllers/contactos.controller');

const llamadas = [];

function pagina({ id, nombre, empresa, categoria, whatsapp }) {
  return {
    id,
    properties: {
      Nombre: { title: [{ plain_text: nombre }] },
      Empresa: { rich_text: [{ plain_text: empresa || '' }] },
      Categoria: { select: { name: categoria } },
      WhatsApp: { phone_number: whatsapp || '' },
      'Dado de Baja': { checkbox: false },
    },
  };
}

const UNIVERSO = [
  pagina({
    id: 'asistente-tel',
    nombre: 'Ana Test',
    empresa: 'Ana SA',
    categoria: 'Asistente',
    whatsapp: '+52 3312345678',
  }),
  pagina({
    id: 'asistente-zara',
    nombre: 'Zara',
    empresa: 'Zara México',
    categoria: 'Asistente',
    whatsapp: '+52 3311111111',
  }),
  pagina({
    id: 'sponsor-zara',
    nombre: 'Zara',
    empresa: 'Zara HQ',
    categoria: 'Sponsor',
    whatsapp: '+52 3322222222',
  }),
  pagina({
    id: 'sponsor-tel',
    nombre: 'Sponsor Tel',
    empresa: 'Sponsor SA',
    categoria: 'Sponsor',
    whatsapp: '+52 3399999999',
  }),
];

function condicionesPlanas(filter) {
  const out = [];
  function walk(nodo) {
    if (!nodo) return;
    if (nodo.property) out.push(nodo);
    if (Array.isArray(nodo.and)) nodo.and.forEach(walk);
    if (Array.isArray(nodo.or)) nodo.or.forEach(walk);
  }
  walk(filter);
  return out;
}

function filtroTieneCategoria(filter, categoria) {
  return condicionesPlanas(filter).some(
    (n) => n.property === 'Categoria' && n.select?.equals === categoria
  );
}

function filtroTieneNombreContains(filter, texto) {
  return condicionesPlanas(filter).some(
    (n) => n.property === 'Nombre' && n.title?.contains === texto
  );
}

function filtroTieneEmpresaContains(filter, texto) {
  return condicionesPlanas(filter).some(
    (n) => n.property === 'Empresa' && n.rich_text?.contains === texto
  );
}

function filtroTieneTelefono(filter) {
  return condicionesPlanas(filter).some((n) => n.property === 'WhatsApp');
}

function paginaPasaFiltro(pag, filter) {
  const cat = pag.properties.Categoria.select.name;
  const baja = pag.properties['Dado de Baja'].checkbox;
  const nom = pag.properties.Nombre.title[0].plain_text;
  const emp = pag.properties.Empresa.rich_text[0].plain_text;
  const wa = pag.properties.WhatsApp.phone_number;
  const planos = condicionesPlanas(filter);

  for (const n of planos) {
    if (n.property === 'Categoria' && n.select?.equals && n.select.equals !== cat) return false;
    if (n.property === 'Dado de Baja' && n.checkbox && n.checkbox.equals === false && baja) return false;
    if (n.property === 'Nombre' && n.title?.contains && !nom.includes(n.title.contains)) return false;
    if (n.property === 'Empresa' && n.rich_text?.contains && !emp.includes(n.rich_text.contains)) {
      return false;
    }
  }

  const condsWa = planos.filter((n) => n.property === 'WhatsApp');
  if (condsWa.length) {
    const match = condsWa.some((n) => {
      if (n.phone_number?.equals) return wa === n.phone_number.equals;
      if (n.phone_number?.contains) return wa.replace(/\D/g, '').includes(n.phone_number.contains);
      return false;
    });
    if (!match) return false;
  }
  return true;
}

require.cache[notionPath] = {
  id: notionPath,
  filename: notionPath,
  loaded: true,
  exports: {
    async notionFetch(path, options = {}) {
      llamadas.push({ path, options });
      if (!String(path).includes('/query')) {
        throw new Error(`notionFetch inesperado (¿escritura?): ${path}`);
      }
      const filter = options.body ? JSON.parse(options.body).filter : null;
      return { results: UNIVERSO.filter((p) => paginaPasaFiltro(p, filter)), has_more: false };
    },
  },
};

delete require.cache[contactosPath];
delete require.cache[controllerPath];
const { buscar } = require('../src/controllers/contactos.controller');

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function getBuscar(query) {
  const res = mockRes();
  await buscar({ query }, res);
  return res;
}

function ultimoFiltro() {
  const last = llamadas[llamadas.length - 1];
  return last?.options?.body ? JSON.parse(last.options.body).filter : null;
}

async function main() {
  let ok = 0;

  // 1. Teléfono exacto, categoría Asistente → 1 resultado.
  llamadas.length = 0;
  {
    const res = await getBuscar({ categoria: 'Asistente', telefono: '523312345678' });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.resultados.length, 1);
    assert.strictEqual(res.body.resultados[0].id, 'asistente-tel');
    assert.strictEqual(res.body.resultados[0].categoria, 'Asistente');
    assert.ok(filtroTieneCategoria(ultimoFiltro(), 'Asistente'));
    assert.ok(filtroTieneTelefono(ultimoFiltro()));
    ok += 1;
    console.log('1. teléfono Asistente → 1 resultado');
  }

  // 2. Nombre con 2 "Zara" (Asistente + Sponsor) → solo Asistente; filtro en Notion.
  llamadas.length = 0;
  {
    const res = await getBuscar({ categoria: 'Asistente', nombre: 'Zara' });
    assert.strictEqual(res.statusCode, 200);
    const filtro = ultimoFiltro();
    assert.ok(filtroTieneCategoria(filtro, 'Asistente'), 'Categoria debe ir en el and del query');
    assert.ok(filtroTieneNombreContains(filtro, 'Zara'));
    assert.strictEqual(res.body.resultados.length, 1);
    assert.strictEqual(res.body.resultados[0].id, 'asistente-zara');
    assert.ok(!res.body.resultados.some((r) => r.categoria === 'Sponsor'));
    ok += 1;
    console.log('2. nombre Zara + categoria Asistente → solo el Asistente (filtro en query)');
  }

  // 3. Empresa contains: "Zara" encuentra "Zara México".
  llamadas.length = 0;
  {
    const res = await getBuscar({ categoria: 'Asistente', empresa: 'Zara' });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(filtroTieneEmpresaContains(ultimoFiltro(), 'Zara'));
    assert.strictEqual(res.body.resultados.length, 1);
    assert.strictEqual(res.body.resultados[0].empresa, 'Zara México');
    ok += 1;
    console.log('3. empresa=Zara contains "Zara México"');
  }

  // 4. categoria inválida → 400, sin pegarle a Notion.
  llamadas.length = 0;
  {
    const res = await getBuscar({ categoria: 'Aliado', nombre: 'Zara' });
    assert.strictEqual(res.statusCode, 400);
    assert.ok(/Asistente o Sponsor/i.test(res.body.message));
    assert.strictEqual(llamadas.length, 0);
    ok += 1;
    console.log('4. categoria=Aliado → 400');
  }

  // 5. Solo categoria, sin nombre/telefono/empresa → 400.
  llamadas.length = 0;
  {
    const res = await getBuscar({ categoria: 'Asistente' });
    assert.strictEqual(res.statusCode, 400);
    assert.ok(/nombre, telefono o empresa/i.test(res.body.message));
    assert.strictEqual(llamadas.length, 0);
    ok += 1;
    console.log('5. sin criterio de búsqueda → 400');
  }

  // 6. Teléfono y nombre no encontrados → 200 + resultados: [].
  llamadas.length = 0;
  {
    const res = await getBuscar({
      categoria: 'Asistente',
      telefono: '520000000000',
      nombre: 'Nadie Inventado',
    });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body.resultados, []);
    assert.ok(llamadas.length >= 1);
    ok += 1;
    console.log('6. no encontrado → 200 resultados []');
  }

  // 7. Teléfono de Sponsor con categoria Asistente → []; no cae a nombre/empresa.
  llamadas.length = 0;
  {
    const res = await getBuscar({ categoria: 'Asistente', telefono: '523399999999' });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body.resultados, []);
    assert.strictEqual(llamadas.length, 1, 'no debe caer a nombre/empresa');
    const filtro = ultimoFiltro();
    assert.ok(filtroTieneCategoria(filtro, 'Asistente'));
    assert.ok(filtroTieneTelefono(filtro));
    assert.ok(!filtroTieneNombreContains(filtro, undefined) && !condicionesPlanas(filtro).some((n) => n.property === 'Nombre'));
    assert.ok(!condicionesPlanas(filtro).some((n) => n.property === 'Empresa'));
    ok += 1;
    console.log('7. teléfono de Sponsor + categoria Asistente → [] sin fallback');
  }

  assert.strictEqual(ok, 7);
  console.log('\n✅ buscar-contacto 7/7');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
