// Consulta canónica de conversaciones de Plática, con fetch simulado.
// node tests/platica-client-conversations.manual-test.js

const assert = require('assert');

process.env.PLATICA_API_KEY = 'api-key-test';
process.env.PLATICA_CHANNEL_ID = 'channel-test';

const llamadas = [];
global.fetch = async (url) => {
  llamadas.push(url);
  if (url.includes('/v1/clients/5214490000000/conversations')) {
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          data: [
            { id: 'conversation-1', channelId: 'channel-test' },
            { id: 'conversation-2', channelId: 'channel-test' },
          ],
        });
      },
    };
  }
  const id = url.endsWith('conversation-1') ? 'conversation-1' : 'conversation-2';
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        id,
        channelId: 'channel-test',
        messages: [
          {
            id: `message-${id}`,
            direction: id === 'conversation-1' ? 'incoming' : 'outgoing',
            creationDate: '2026-09-04T16:00:00.000Z',
          },
        ],
      });
    },
  };
};

const servicePath = require.resolve('../src/services/platica-client.service');
delete require.cache[servicePath];
const { cargarMensajesCliente, conversacionesDeRespuesta } = require(servicePath);

async function main() {
  assert.deepStrictEqual(conversacionesDeRespuesta({ conversations: [{ id: 'a' }] }), [{ id: 'a' }]);
  assert.deepStrictEqual(
    conversacionesDeRespuesta({ workspaces: [{ conversations: [{ id: 'b' }] }] }),
    [{ id: 'b' }]
  );

  const mensajes = await cargarMensajesCliente('+52 1 449 000 0000');
  assert.strictEqual(mensajes.length, 2);
  assert.strictEqual(mensajes[0].conversationId, 'conversation-1');
  assert.ok(llamadas[0].includes('channelId=channel-test'));
  assert.ok(llamadas[0].includes('limit=200'));

  console.log('✅ Lista todos los hilos del teléfono/canal y carga sus mensajes.');
  console.log('✅ Tolera respuestas directas, data, conversations y workspaces.');
}

main().catch((error) => {
  console.error('❌', error);
  process.exit(1);
});
