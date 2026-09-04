// POST /v1/messages/template incluye responderAgentId.
// node tests/platica-responder-agent.manual-test.js

const assert = require('assert');

process.env.PLATICA_API_KEY = 'api-key-test';
process.env.PLATICA_CHANNEL_ID = 'wb-1167456423128610';
process.env.PLATICA_RESPONDER_AGENT_ID = 'c1IYnFsr0Jzfqq4NeLAs';

const cuerpos = [];
global.fetch = async (url, opts) => {
  cuerpos.push({ url, body: JSON.parse(opts.body) });
  return { ok: true, status: 200, async text() { return JSON.stringify({ messageId: 'm1' }); } };
};

const servicePath = require.resolve('../src/services/platica-client.service');
delete require.cache[servicePath];
const { enviarPlantilla, payloadCanalYAgente } = require(servicePath);

async function main() {
  assert.deepStrictEqual(payloadCanalYAgente(), {
    channelId: 'wb-1167456423128610',
    responderAgentId: 'c1IYnFsr0Jzfqq4NeLAs',
  });

  await enviarPlantilla({
    phone: '+52 449 000 0000',
    templateName: 'followup_72hrs',
    params: ['Ana'],
  });
  assert.ok(cuerpos[0].url.endsWith('/v1/messages/template'));
  assert.strictEqual(cuerpos[0].body.channelId, 'wb-1167456423128610');
  assert.strictEqual(cuerpos[0].body.responderAgentId, 'c1IYnFsr0Jzfqq4NeLAs');
  assert.strictEqual(cuerpos[0].body.conversationId, '524490000000');
  assert.deepStrictEqual(cuerpos[0].body.template, { name: 'followup_72hrs', params: ['Ana'] });

  console.log('✅ Plantillas llevan channelId FDT + responderAgentId del Agente 2.');
}

main().catch((error) => {
  console.error('❌', error);
  process.exit(1);
});
