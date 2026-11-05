// Verificación del webhook de Notion. No sincroniza contactos.
// node tests/notion-webhook.manual-test.js

const assert = require('assert');

process.env.API_SECRET_KEY = 'clave-test';

const controllerPath = require.resolve('../src/controllers/notion-webhook.controller');
delete require.cache[controllerPath];
const {
  webhookNotion,
  leerVerificacion,
  resetTokenVerificacionForTests,
} = require(controllerPath);

function respuesta() {
  return {
    statusCode: 200,
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

async function post(body) {
  const res = respuesta();
  await webhookNotion({ body }, res);
  return res;
}

function get(key) {
  const res = respuesta();
  leerVerificacion({ headers: { 'x-api-key': key } }, res);
  return res;
}

async function main() {
  resetTokenVerificacionForTests();

  const sinClave = get(undefined);
  assert.strictEqual(sinClave.statusCode, 401);

  const vacio = get('clave-test');
  assert.strictEqual(vacio.statusCode, 200);
  assert.strictEqual(vacio.body.recibido, false);

  const evento = await post({ type: 'page.properties_updated', entity: { id: 'pagina' } });
  assert.strictEqual(evento.statusCode, 200);
  assert.strictEqual(evento.body.procesado, false);
  assert.strictEqual(get('clave-test').body.recibido, false);

  const malo = await post({ verification_token: 'no-es-token' });
  assert.strictEqual(malo.statusCode, 200);
  assert.strictEqual(malo.body.procesado, false);
  assert.strictEqual(get('clave-test').body.recibido, false);

  const invalido = await post(null);
  assert.strictEqual(invalido.statusCode, 400);

  const primero = await post({ verification_token: 'secret_primer_token_de_prueba_123' });
  assert.strictEqual(primero.statusCode, 200);
  assert.strictEqual(primero.body.recibido, true);
  const leido = get('clave-test');
  assert.strictEqual(leido.body.verification_token, 'secret_primer_token_de_prueba_123');
  assert.ok(leido.body.recibidoEn);

  const reenvio = await post({ verification_token: 'secret_segundo_token_de_prueba_456' });
  assert.strictEqual(reenvio.statusCode, 200);
  assert.strictEqual(get('clave-test').body.verification_token, 'secret_segundo_token_de_prueba_456');

  console.log('notion-webhook.manual-test: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
