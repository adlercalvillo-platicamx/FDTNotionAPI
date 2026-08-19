const assert = require('assert');

process.env.NOTION_CITAS_DATA_SOURCE_ID = 'fake';
process.env.NOTION_CONTACTOS_DATA_SOURCE_ID = 'fake';

const citasPath = require.resolve('../src/services/citas.service');
require.cache[citasPath] = {
  id: citasPath,
  filename: citasPath,
  loaded: true,
  exports: {
    obtenerDisponibilidadSponsor: async () => [],
    consultarSugeridasPorIdentificador: async ({ whatsapp, asistentePageId }) => {
      if (whatsapp === '5511111111' || whatsapp === '+52 55 1111 1111') {
        return {
          asistente_notion_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          asistente_nombre: 'Ana Test',
          whatsapp: '5511111111',
          sugeridas: [{ sponsor_nombre: 'Sponsor Uno' }],
        };
      }
      if (asistentePageId === 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee') {
        return {
          asistente_notion_id: asistentePageId,
          asistente_nombre: null,
          whatsapp: null,
          sugeridas: [],
        };
      }
      const err = new Error('No hay un asistente activo con ese número de WhatsApp.');
      err.code = 'CONTACTO_NO_RESUELTO';
      err.status = 404;
      throw err;
    },
  },
};

const { sugeridas } = require('../src/controllers/citas.controller');

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

async function main() {
  let fallos = 0;
  const ok = (name, fn) => {
    try {
      fn();
      console.log('✅', name);
    } catch (e) {
      fallos += 1;
      console.log('❌', name, e.message);
    }
  };

  const resPhone = mockRes();
  await sugeridas({ query: { whatsapp: '5511111111' } }, resPhone);
  ok('whatsapp → 200 y page_id resuelto', () => {
    assert.strictEqual(resPhone.statusCode, 200);
    assert.strictEqual(resPhone.body.asistente_notion_id, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    assert.strictEqual(resPhone.body.sugeridas.length, 1);
  });

  const resAlias = mockRes();
  await sugeridas({ query: { telefono: '+52 55 1111 1111' } }, resAlias);
  ok('alias telefono → 200', () => {
    assert.strictEqual(resAlias.statusCode, 200);
    assert.strictEqual(resAlias.body.asistente_nombre, 'Ana Test');
  });

  const res404 = mockRes();
  await sugeridas({ query: { whatsapp: '5599999999' } }, res404);
  ok('número desconocido → 404 CONTACTO_NO_RESUELTO', () => {
    assert.strictEqual(res404.statusCode, 404);
    assert.strictEqual(res404.body.error, 'CONTACTO_NO_RESUELTO');
  });

  const resBad = mockRes();
  await sugeridas({ query: { whatsapp: 'abc' } }, resBad);
  ok('whatsapp sin dígitos → 400', () => {
    assert.strictEqual(resBad.statusCode, 400);
    assert.strictEqual(resBad.body.error, 'INVALID_INPUT');
  });

  if (fallos) process.exit(1);
  console.log('\n=== sugeridas por whatsapp OK ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
