// Seguridad del webhook de Notion, sin levantar Express.
//
//   node tests/campanas-webhook.manual-test.js

const assert = require('assert');

const servicePath = require.resolve('../src/services/campanas-matchmaking.service');
const controllerPath = require.resolve('../src/controllers/campanas.controller');
let llamadas = 0;

require.cache[servicePath] = {
  id: servicePath,
  filename: servicePath,
  loaded: true,
  exports: {
    async dispararCampanasAprobadas() {
      llamadas += 1;
      return { modoSimulacion: true, contactosProcesados: 2 };
    },
  },
};

delete require.cache[controllerPath];
const { enviarCampanasAprobadas } = require('../src/controllers/campanas.controller');

function respuestaMock() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function main() {
  process.env.NOTION_CAMPANAS_WEBHOOK_SECRET = 'secret-test';

  const noAutorizada = respuestaMock();
  await enviarCampanasAprobadas({ headers: {} }, noAutorizada);
  assert.strictEqual(noAutorizada.statusCode, 401);
  assert.strictEqual(llamadas, 0);

  const autorizada = respuestaMock();
  await enviarCampanasAprobadas(
    { headers: { 'x-notion-campanas-secret': 'secret-test' } },
    autorizada
  );
  assert.strictEqual(autorizada.statusCode, 200);
  assert.strictEqual(autorizada.body.modoSimulacion, true);
  assert.strictEqual(llamadas, 1);

  console.log('✅ El webhook rechaza secret inválido y procesa el válido.');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
