// Webhook message.created de Plática → marca respuesta de oferta inicial.
// node tests/platica-respuestas-webhook.manual-test.js

const assert = require('assert');
const crypto = require('crypto');

process.env.PLATICA_WEBHOOK_SECRET = 'secret-test';
process.env.PLATICA_WORKSPACE_ID = 'workspace-test';
process.env.PLATICA_CHANNEL_ID = 'channel-test';

const contactosPath = require.resolve('../src/services/contactos.service');
const respuestasPath = require.resolve('../src/services/platica-respuestas.service');
const controllerPath = require.resolve('../src/controllers/platica-webhook.controller');

let contacto;
const escrituras = [];

require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    async buscarAsistentePorWhatsApp() {
      return contacto;
    },
    async marcarRespuestaOfertaInicial(contactoId, fecha) {
      escrituras.push({ contactoId, fecha });
      contacto.respondioOfertaInicial = true;
      contacto.fechaRespuestaOfertaInicial = fecha;
    },
  },
};

delete require.cache[respuestasPath];
delete require.cache[controllerPath];
const { registrarRespuestaOfertaInicial } = require(respuestasPath);
const {
  mensajesPlatica,
  verificarFirmaWebhook,
  resetRateLimitForTests,
  MAX_BODY_BYTES,
} = require(controllerPath);

function reset() {
  escrituras.length = 0;
  contacto = {
    id: 'contacto-1',
    ultimaCampanaEnviada: 'Oferta inicial',
    fechaUltimaCampana: '2026-09-01T15:00:00.000Z',
    respondioOfertaInicial: false,
  };
}

function evento({ direction = 'incoming', creationDate = '2026-09-01T16:00:00.000Z' } = {}) {
  return {
    id: 'evento-1',
    event: 'message.created',
    workspaceId: 'workspace-test',
    timestamp: creationDate,
    data: {
      conversation: {
        channelId: 'channel-test',
        platform: 'whatsapp',
        phoneNumber: '5214490000000',
      },
      client: { phoneNumber: '5214490000000' },
      message: {
        id: 'mensaje-1',
        direction,
        role: direction === 'incoming' ? 'user' : 'assistant',
        creationDate,
      },
    },
  };
}

function respuestaHttp() {
  return {
    statusCode: null,
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

function requestFirmado(body, firmaCorrecta = true) {
  const rawBody = Buffer.from(JSON.stringify(body));
  const firma = `sha256=${crypto
    .createHmac('sha256', process.env.PLATICA_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex')}`;
  return {
    ip: '203.0.113.10',
    body,
    rawBody,
    headers: { 'x-webhook-signature': firmaCorrecta ? firma : 'sha256=incorrecta' },
  };
}

async function main() {
  resetRateLimitForTests();
  reset();
  assert.strictEqual(verificarFirmaWebhook('secret-test', Buffer.from('{}'), ''), false);
  assert.strictEqual(
    verificarFirmaWebhook('secret-test', Buffer.from('{}'), 'sha256=aa'),
    false,
    'largo distinto no debe tumbar el proceso'
  );
  let res = respuestaHttp();
  await mensajesPlatica(requestFirmado(evento(), false), res);
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(escrituras.length, 0);

  reset();
  let resultado = await registrarRespuestaOfertaInicial(evento({ direction: 'outgoing' }));
  assert.strictEqual(resultado.motivo, 'MENSAJE_NO_ENTRANTE');
  assert.strictEqual(escrituras.length, 0);

  reset();
  resultado = await registrarRespuestaOfertaInicial(
    evento({ creationDate: '2026-09-01T14:59:59.000Z' })
  );
  assert.strictEqual(resultado.motivo, 'RESPUESTA_ANTERIOR_A_OFERTA');
  assert.strictEqual(escrituras.length, 0);

  reset();
  resultado = await registrarRespuestaOfertaInicial(evento());
  assert.strictEqual(resultado.actualizado, true);
  assert.strictEqual(escrituras.length, 1);
  resultado = await registrarRespuestaOfertaInicial(evento());
  assert.strictEqual(resultado.motivo, 'RESPUESTA_YA_REGISTRADA');
  assert.strictEqual(escrituras.length, 1);

  reset();
  res = respuestaHttp();
  await mensajesPlatica(requestFirmado(evento()), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.actualizado, true);

  reset();
  const bodyOtroWorkspace = { ...evento(), workspaceId: 'otro' };
  res = respuestaHttp();
  await mensajesPlatica(requestFirmado(bodyOtroWorkspace), res);
  assert.strictEqual(res.statusCode, 202);
  assert.strictEqual(res.body.motivo, 'WORKSPACE_NO_APLICA');
  assert.strictEqual(escrituras.length, 0);

  reset();
  const bodyOtroCanal = evento();
  bodyOtroCanal.data.conversation.channelId = 'otro-canal';
  res = respuestaHttp();
  await mensajesPlatica(requestFirmado(bodyOtroCanal), res);
  assert.strictEqual(res.statusCode, 202);
  assert.strictEqual(res.body.motivo, 'CANAL_NO_APLICA');
  assert.strictEqual(escrituras.length, 0);

  resetRateLimitForTests();
  reset();
  const reqGrande = requestFirmado(evento());
  reqGrande.rawBody = Buffer.alloc(MAX_BODY_BYTES + 1, 0x61);
  res = respuestaHttp();
  await mensajesPlatica(reqGrande, res);
  assert.strictEqual(res.statusCode, 413);
  assert.strictEqual(escrituras.length, 0);

  process.env.PLATICA_WEBHOOK_RATE_MAX = '2';
  resetRateLimitForTests();
  res = respuestaHttp();
  await mensajesPlatica(requestFirmado(evento()), res);
  assert.strictEqual(res.statusCode, 200);
  res = respuestaHttp();
  await mensajesPlatica(requestFirmado(evento()), res);
  assert.strictEqual(res.statusCode, 200);
  res = respuestaHttp();
  await mensajesPlatica(requestFirmado(evento()), res);
  assert.strictEqual(res.statusCode, 429);
  delete process.env.PLATICA_WEBHOOK_RATE_MAX;
  resetRateLimitForTests();

  console.log('✅ Firma HMAC y workspace/canal se validan.');
  console.log('✅ Solo incoming posterior a la oferta marca respuesta.');
  console.log('✅ Eventos duplicados son idempotentes.');
  console.log('✅ Body > 100kb y flood por IP se rechazan antes de Notion.');
}

main().catch((error) => {
  console.error('❌', error);
  process.exit(1);
});
