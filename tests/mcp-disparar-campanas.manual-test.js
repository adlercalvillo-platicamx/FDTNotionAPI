// Tool MCP disparar_campanas_aprobadas: responde antes del timeout de Plática.
//
//   node tests/mcp-disparar-campanas.manual-test.js
//
// Se invoca el handler que registra crearServidorMcp(), no el service directo:
// lo que se corta a ~1 min es el tool call. WhatsApp va mockeado con latencia
// para que el lote siga corriendo cuando la tool ya contestó.

const assert = require('assert');

process.env.NOTION_CITAS_DATA_SOURCE_ID = 'fake-mcp-citas';
process.env.NOTION_CONTACTOS_DATA_SOURCE_ID = 'fake-mcp-contactos';
process.env.CITAS_FECHAS_EVENTO = '2026-10-07,2026-10-08';
process.env.CAMPANAS_MATCHMAKING_MODO_SIMULACION = 'false';
process.env.CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO = 'true';
for (const cantidad of [1, 2, 3, 4]) {
  process.env[`PLATICA_TEMPLATE_OFERTA_INICIAL_${cantidad}`] = `oferta-inicial-test-${cantidad}`;
}

const TOTAL_ASISTENTES = 11;
const MS_POR_ENVIO = 120;

const envios = [];
const filasMarcadas = [];
let telefonoQueFalla = null;

const candidatas = Array.from({ length: TOTAL_ASISTENTES }, (_, i) => ({
  id: `cita-${i + 1}`,
  asistentePageId: `asistente-${i + 1}`,
  sponsorPageId: `sponsor-${i + 1}`,
  score: 100 - i,
}));

const citasPath = require.resolve('../src/services/citas.service');
require.cache[citasPath] = {
  id: citasPath,
  filename: citasPath,
  loaded: true,
  exports: {
    async buscarCitasAprobadasSinCampana() {
      return candidatas;
    },
    async actualizarEstadoEnvioCampana() {},
    async marcarCampanaEnviada(ids) {
      filasMarcadas.push([...ids]);
    },
  },
};

const contactosPath = require.resolve('../src/services/contactos.service');
require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    async obtenerContacto(id) {
      const numero = id.split('-').pop();
      if (id.startsWith('sponsor-')) {
        return {
          id,
          nombre: `Sponsor ${numero}`,
          empresa: `Empresa Sponsor ${numero}`,
          solucion: ['Omnichannel'],
        };
      }
      return {
        id,
        nombre: `Asistente ${numero}`,
        empresa: `Marca ${numero}`,
        whatsapp: `52449000000${numero}`,
        solucionesBuscadas: ['Omnichannel'],
        ultimaCampanaEnviada: null,
      };
    },
    async actualizarEstadoCampana() {},
    async incrementarReactivaciones() {},
  },
};

const platicaPath = require.resolve('../src/services/platica-client.service');
require.cache[platicaPath] = {
  id: platicaPath,
  filename: platicaPath,
  loaded: true,
  exports: {
    async enviarPlantilla(payload) {
      await new Promise((r) => setTimeout(r, MS_POR_ENVIO));
      if (payload.phone === telefonoQueFalla) {
        throw new Error('Plática rechazó la plantilla (132000)');
      }
      envios.push(payload);
      return { ok: true };
    },
  },
};

const { crearServidorMcp } = require('../src/mcp/server');
const {
  resetCorridaCampanasParaTests,
} = require('../src/services/campanas-matchmaking.service');

function handlerDeTool(nombre) {
  const server = crearServidorMcp();
  const registrada = server._registeredTools[nombre];
  assert.ok(registrada, `la tool ${nombre} debe estar registrada`);
  return registrada.handler;
}

function jsonDeRespuesta(respuesta) {
  return JSON.parse(respuesta.content[0].text);
}

async function esperarCorrida(disparar) {
  let estado = jsonDeRespuesta(await disparar({ consultarEstado: true }, {}));
  const limite = Date.now() + 15000;
  while (estado.estadoCorrida === 'en_curso') {
    assert.ok(Date.now() < limite, 'la corrida no terminó a tiempo');
    await new Promise((r) => setTimeout(r, 100));
    estado = jsonDeRespuesta(await disparar({ consultarEstado: true }, {}));
  }
  return estado;
}

async function main() {
  const disparar = handlerDeTool('disparar_campanas_aprobadas');

  const t0 = Date.now();
  const arranque = jsonDeRespuesta(await disparar({}, {}));
  const msArranque = Date.now() - t0;

  // El punto del cambio: el tool call no espera el lote (Plática corta ~60 s).
  assert.ok(
    msArranque < 500,
    `la tool debe contestar de inmediato, tardó ${msArranque} ms`
  );
  assert.strictEqual(arranque.estadoCorrida, 'en_curso');
  assert.ok(
    envios.length < TOTAL_ASISTENTES,
    'el lote todavía debe estar corriendo cuando la tool ya contestó'
  );

  // Un segundo disparo mientras corre no puede volver a mandar WhatsApp.
  const reintento = jsonDeRespuesta(await disparar({}, {}));
  assert.strictEqual(reintento.yaHabiaCorrida, true);
  assert.strictEqual(reintento.estadoCorrida, 'en_curso');

  const estado = await esperarCorrida(disparar);

  assert.strictEqual(estado.estadoCorrida, 'terminada');
  assert.strictEqual(estado.modoSimulacion, false);
  assert.strictEqual(estado.enviadosOfertaInicial, TOTAL_ASISTENTES);
  assert.strictEqual(
    envios.length,
    TOTAL_ASISTENTES,
    'ni el reintento ni las consultas deben duplicar envíos'
  );
  assert.strictEqual(filasMarcadas.length, TOTAL_ASISTENTES);
  assert.strictEqual(estado.errores.length, 0);

  // Reporte nominal completo: con volumen el agente no puede decir solo "11".
  assert.strictEqual(estado.paraInformar.length, TOTAL_ASISTENTES);
  assert.ok(estado.paraInformar[0].startsWith('Enviado — Asistente 1 (Marca 1)'));
  assert.ok(
    estado.paraInformar.every((linea) => /Empresa Sponsor \d+/.test(linea)),
    'cada línea debe traer el texto de sponsors que recibió'
  );
  assert.ok(
    estado.detalle.every((item) => !item.payload),
    'el payload crudo no viaja al agente'
  );

  // Consultar después de terminada sigue devolviendo el mismo reporte.
  const consultaFinal = jsonDeRespuesta(await disparar({ consultarEstado: true }, {}));
  assert.strictEqual(consultaFinal.enviadosOfertaInicial, TOTAL_ASISTENTES);
  assert.strictEqual(envios.length, TOTAL_ASISTENTES);

  console.log(
    `✅ La tool contestó en ${msArranque} ms con el lote de ${TOTAL_ASISTENTES} aún corriendo.`
  );
  console.log('✅ Un segundo disparo durante la corrida no duplica WhatsApp.');
  console.log('✅ consultarEstado entrega los 11 con nombre, empresa y sponsors.');

  await casoUnFalloNoTumbaElLote(disparar);
  console.log('✅ Un WhatsApp rechazado no aborta el lote y sale nombrado en el reporte.');
}

// Lo que ya hacía antes: reportar el que falló sin perder los que sí salieron.
async function casoUnFalloNoTumbaElLote(disparar) {
  resetCorridaCampanasParaTests();
  envios.length = 0;
  filasMarcadas.length = 0;
  telefonoQueFalla = '524490000005';

  jsonDeRespuesta(await disparar({}, {}));
  const estado = await esperarCorrida(disparar);

  assert.strictEqual(estado.estadoCorrida, 'terminada');
  assert.strictEqual(estado.enviadosOfertaInicial, TOTAL_ASISTENTES - 1);
  assert.strictEqual(envios.length, TOTAL_ASISTENTES - 1);
  assert.strictEqual(estado.errores.length, 1);
  assert.strictEqual(estado.errores[0].asistentePageId, 'asistente-5');
  assert.ok(/132000/.test(estado.errores[0].mensaje));

  const lineaError = estado.paraInformar.filter((linea) => linea.startsWith('Error —'));
  assert.strictEqual(lineaError.length, 1);
  assert.ok(/132000/.test(lineaError[0]));
  assert.strictEqual(
    estado.paraInformar.length,
    TOTAL_ASISTENTES,
    'el reporte lista los 10 enviados más el que falló'
  );
  telefonoQueFalla = null;
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
