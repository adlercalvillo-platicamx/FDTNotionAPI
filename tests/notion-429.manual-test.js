// Reintento 429 en notionFetch. Sin red: mock de fetch global.
//
//   node tests/notion-429.manual-test.js

const assert = require('assert');

process.env.NOTION_API_KEY = process.env.NOTION_API_KEY || 'test-key-429';

const clientPath = require.resolve('../src/utils/notion-client');
delete require.cache[clientPath];

const fetchOrig = global.fetch;
let llamadas = 0;

global.fetch = async () => {
  llamadas += 1;
  if (llamadas === 1) {
    return {
      status: 429,
      ok: false,
      headers: { get: (n) => (n === 'Retry-After' ? '0' : null) },
      json: async () => ({ message: 'rate limited' }),
    };
  }
  return {
    status: 200,
    ok: true,
    headers: { get: () => null },
    json: async () => ({ ok: true, intento: llamadas }),
  };
};

const { notionFetch } = require('../src/utils/notion-client');

async function main() {
  const data = await notionFetch('/pages/demo');
  assert.strictEqual(llamadas, 2);
  assert.deepStrictEqual(data, { ok: true, intento: 2 });
  console.log('OK notionFetch reintenta un 429 y resuelve en el segundo intento');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    global.fetch = fetchOrig;
  });
