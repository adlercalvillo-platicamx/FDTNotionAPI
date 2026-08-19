const assert = require('assert');
const { esUuidCanonico, sugeridas } = require('../src/controllers/citas.controller');

process.env.NOTION_CITAS_DATA_SOURCE_ID = process.env.NOTION_CITAS_DATA_SOURCE_ID || 'fake';

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

  ok('UUID válido', () => {
    assert.strictEqual(esUuidCanonico('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'), true);
  });

  const resBad = mockRes();
  await sugeridas({ query: {} }, resBad);
  ok('sin asistente → 400 INVALID_INPUT', () => {
    assert.strictEqual(resBad.statusCode, 400);
    assert.strictEqual(resBad.body.error, 'INVALID_INPUT');
  });

  const resUuid = mockRes();
  await sugeridas({ query: { asistente_notion_id: 'no-uuid' } }, resUuid);
  ok('UUID mal formado → 400', () => {
    assert.strictEqual(resUuid.statusCode, 400);
    assert.strictEqual(resUuid.body.error, 'INVALID_INPUT');
  });

  const { variantesTelefono } = require('../src/services/contactos.service');
  ok('variantes 521', () => {
    const v = variantesTelefono('+52 55 1234 5678');
    assert.ok(v.includes('525512345678') || v.includes('5512345678'));
  });

  if (fallos) process.exit(1);
  console.log('\n=== sugeridas controller + teléfono OK ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
