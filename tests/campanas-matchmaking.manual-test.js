// Campañas agrupadas por contacto, sin Notion ni WhatsApp reales.
//
//   node tests/campanas-matchmaking.manual-test.js

const assert = require('assert');

process.env.CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO = 'true';
process.env.PLATICA_TEMPLATE_MATCHMAKING_A = 'plantilla-a-test';
process.env.PLATICA_TEMPLATE_MATCHMAKING_B = 'plantilla-b-test';
process.env.PLATICA_TEMPLATE_MATCHMAKING_C1 = 'plantilla-c1-test';
process.env.PLATICA_TEMPLATE_MATCHMAKING_C2 = 'plantilla-c2-test';

const citasPath = require.resolve('../src/services/citas.service');
const contactosPath = require.resolve('../src/services/contactos.service');
const platicaPath = require.resolve('../src/services/platica-client.service');
const servicePath = require.resolve('../src/services/campanas-matchmaking.service');

let candidatas = [];
let confirmados = new Set();
let contacto = {};
const envios = [];
const actualizacionesContacto = [];
const incrementosReactivaciones = [];
const filasMarcadas = [];
const estadosEnvio = [];
const esperasBackoff = [];
let fallarEnvioPlantilla = false;
let fallarMarcarCampanaEnviada = false;
let fallosRestantesMarcarEnviada = 0;
let fallarEnCurso = false;
let llamadasMarcarEnviada = 0;
let llamadasEnviarPlantilla = 0;
let llamadasActualizarEstado = 0;

require.cache[citasPath] = {
  id: citasPath,
  filename: citasPath,
  loaded: true,
  exports: {
    async buscarCitasAprobadasSinCampana() {
      return candidatas;
    },
    async obtenerAsistentesConCitaConfirmada() {
      return confirmados;
    },
    async actualizarEstadoEnvioCampana(ids, datos) {
      llamadasActualizarEstado += 1;
      if (datos.estado === 'En curso' && fallarEnCurso) {
        throw new Error('Notion no pudo marcar En curso');
      }
      estadosEnvio.push({ ids: [...ids], ...datos });
    },
    async marcarCampanaEnviada(ids) {
      llamadasMarcarEnviada += 1;
      if (fallosRestantesMarcarEnviada > 0) {
        fallosRestantesMarcarEnviada -= 1;
        throw new Error('Notion no pudo marcar Campaña Enviada');
      }
      if (fallarMarcarCampanaEnviada) {
        throw new Error('Notion no pudo marcar Campaña Enviada');
      }
      filasMarcadas.push([...ids]);
      estadosEnvio.push({ ids: [...ids], estado: 'Enviada', campanaEnviada: true });
    },
  },
};

require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    async obtenerContacto() {
      return contacto;
    },
    async actualizarEstadoCampana(datos) {
      actualizacionesContacto.push(datos);
    },
    async incrementarReactivaciones(contactoId, valorActual) {
      incrementosReactivaciones.push({ contactoId, valorActual, nuevoValor: (valorActual || 0) + 1 });
    },
  },
};

require.cache[platicaPath] = {
  id: platicaPath,
  filename: platicaPath,
  loaded: true,
  exports: {
    async enviarPlantilla(payload) {
      llamadasEnviarPlantilla += 1;
      if (fallarEnvioPlantilla) {
        throw new Error('Plática rechazó la plantilla');
      }
      envios.push(payload);
      return { ok: true };
    },
  },
};

delete require.cache[servicePath];
const {
  CAMPANA_A,
  CAMPANA_B,
  CAMPANA_C_LEGACY,
  REACTIVACION_1,
  REACTIVACION_2,
  elegirCampana,
  dispararCampanasAprobadas,
  esCandidataEnvioCampana,
  ESTADO_ENVIO_EN_CURSO,
  ESTADO_ENVIO_ENVIADA,
  ESTADO_ENVIO_FALLO,
  ESTADO_ENVIO_PENDIENTE,
  MINUTOS_TIMEOUT_ENVIO_EN_CURSO,
} = require('../src/services/campanas-matchmaking.service');

const backoffUtil = require('../src/utils/reintentar-con-backoff');
backoffUtil._setEsperarBackoffForTests(async (ms) => {
  esperasBackoff.push(ms);
});

function limpiarEfectos() {
  envios.length = 0;
  actualizacionesContacto.length = 0;
  incrementosReactivaciones.length = 0;
  filasMarcadas.length = 0;
  estadosEnvio.length = 0;
  esperasBackoff.length = 0;
  fallarEnvioPlantilla = false;
  fallarMarcarCampanaEnviada = false;
  fallosRestantesMarcarEnviada = 0;
  fallarEnCurso = false;
  llamadasMarcarEnviada = 0;
  llamadasEnviarPlantilla = 0;
  llamadasActualizarEstado = 0;
}

async function casoAgrupadoA() {
  limpiarEfectos();
  candidatas = [
    { id: 'cita-1', asistentePageId: 'asistente-1' },
    { id: 'cita-2', asistentePageId: 'asistente-1' },
    { id: 'cita-3', asistentePageId: 'asistente-1' },
  ];
  confirmados = new Set();
  contacto = {
    id: 'asistente-1',
    nombre: 'Ana',
    whatsapp: '+52 33 1234 5678',
    ultimaCampanaEnviada: null,
    fechaUltimaCampana: null,
  };

  const resultado = await dispararCampanasAprobadas({
    modoSimulacion: false,
    ahora: new Date('2026-08-23T20:00:00.000Z'),
  });

  assert.strictEqual(envios.length, 1, 'tres filas del mismo contacto deben producir un envío');
  assert.strictEqual(resultado.soloMarcar, false);
  assert.strictEqual(resultado.enviadosA, 1);
  assert.ok(!resultado.detalle[0].marcadoSinEnviar);
  assert.strictEqual(actualizacionesContacto.length, 1);
  assert.strictEqual(actualizacionesContacto[0].campana, CAMPANA_A);
  assert.strictEqual(incrementosReactivaciones.length, 0, 'A no incrementa reactivaciones');
  assert.deepStrictEqual(filasMarcadas, [['cita-1', 'cita-2', 'cita-3']]);
  assert.strictEqual(estadosEnvio[0].estado, ESTADO_ENVIO_EN_CURSO);
  assert.strictEqual(estadosEnvio[estadosEnvio.length - 1].estado, ESTADO_ENVIO_ENVIADA);
}

async function casoReactivacionSimulada() {
  limpiarEfectos();
  candidatas = [{ id: 'cita-4', asistentePageId: 'asistente-2' }];
  confirmados = new Set();
  contacto = {
    id: 'asistente-2',
    nombre: 'Bea',
    whatsapp: '523312345679',
    ultimaCampanaEnviada: CAMPANA_A,
    fechaUltimaCampana: '2026-08-03T20:00:00.000Z',
  };

  const resultado = await dispararCampanasAprobadas({
    modoSimulacion: true,
    ahora: new Date('2026-08-23T20:00:00.000Z'),
  });

  assert.strictEqual(resultado.simuladosC1, 1);
  assert.strictEqual(resultado.detalle[0].campana, REACTIVACION_1);
  assert.strictEqual(envios.length, 0, 'simulación nunca llama a Plática');
  assert.strictEqual(actualizacionesContacto.length, 0, 'simulación no marca Contactos');
  assert.strictEqual(incrementosReactivaciones.length, 0, 'simulación no incrementa reactivaciones');
  assert.strictEqual(filasMarcadas.length, 0, 'simulación no marca Citas');
}

async function casoBPerdidaEntraAReactivacion() {
  limpiarEfectos();
  candidatas = [{ id: 'cita-5', asistentePageId: 'asistente-3' }];
  confirmados = new Set();
  contacto = {
    id: 'asistente-3',
    nombre: 'Carla',
    whatsapp: '523312345670',
    ultimaCampanaEnviada: CAMPANA_B,
    fechaUltimaCampana: '2026-08-01T20:00:00.000Z',
    reactivacionesEnviadas: 0,
  };

  const resultado = await dispararCampanasAprobadas({
    modoSimulacion: false,
    ahora: new Date('2026-08-23T20:00:00.000Z'),
  });
  assert.strictEqual(resultado.enviadosC1, 1);
  assert.strictEqual(resultado.detalle[0].campana, REACTIVACION_1);
  assert.strictEqual(incrementosReactivaciones[0].nuevoValor, 1);
  assert.ok(!JSON.stringify(resultado).includes('COMPORTAMIENTO_POSTERIOR_NO_DEFINIDO'));
}

function casoLimiteExactoCatorceDias() {
  const decision = elegirCampana({
    contacto: {
      ultimaCampanaEnviada: CAMPANA_A,
      fechaUltimaCampana: '2026-08-09T20:00:00.000Z',
    },
    tieneCitaConfirmada: false,
    ahora: new Date('2026-08-23T20:00:00.000Z'),
  });
  assert.strictEqual(decision.campana, undefined);
  assert.strictEqual(decision.motivo, 'VENTANA_REACTIVACION_NO_CUMPLIDA');
}

async function casoSoloMarcarAgrupado() {
  limpiarEfectos();
  candidatas = [
    { id: 'cita-1', asistentePageId: 'asistente-1' },
    { id: 'cita-2', asistentePageId: 'asistente-1' },
    { id: 'cita-3', asistentePageId: 'asistente-1' },
  ];
  confirmados = new Set();
  contacto = {
    id: 'asistente-1',
    nombre: 'Ana',
    whatsapp: '+52 33 1234 5678',
    ultimaCampanaEnviada: null,
    fechaUltimaCampana: null,
  };

  const resultado = await dispararCampanasAprobadas({
    soloMarcar: true,
    ahora: new Date('2026-08-23T20:00:00.000Z'),
  });

  assert.strictEqual(envios.length, 0, 'soloMarcar nunca llama a Plática');
  assert.strictEqual(resultado.soloMarcar, true);
  assert.strictEqual(resultado.modoSimulacion, false);
  assert.strictEqual(resultado.marcadosSinEnviarA, 1);
  assert.strictEqual(resultado.enviadosA, 0);
  assert.strictEqual(resultado.simuladosA, 0);
  assert.ok(!('enviadosA' in resultado.detalle[0]));
  assert.strictEqual(resultado.detalle[0].marcadoSinEnviar, true);
  assert.strictEqual(actualizacionesContacto.length, 1);
  assert.strictEqual(actualizacionesContacto[0].campana, CAMPANA_A);
  assert.strictEqual(actualizacionesContacto[0].contactoId, 'asistente-1');
  assert.strictEqual(incrementosReactivaciones.length, 0, 'A no incrementa reactivaciones');
  assert.deepStrictEqual(filasMarcadas, [['cita-1', 'cita-2', 'cita-3']]);
  assert.ok(estadosEnvio.every((e) => e.estado !== ESTADO_ENVIO_EN_CURSO), 'soloMarcar no pasa por En curso');
  assert.strictEqual(estadosEnvio[0].estado, ESTADO_ENVIO_ENVIADA);
}

async function casoSoloMarcarNoConviveConSimulacion() {
  limpiarEfectos();
  candidatas = [{ id: 'cita-9', asistentePageId: 'asistente-9' }];
  contacto = { id: 'asistente-9', nombre: 'Zoe', whatsapp: '523300000000' };

  await assert.rejects(
    () => dispararCampanasAprobadas({ soloMarcar: true, modoSimulacion: true }),
    /no pueden usarse juntos/
  );
  assert.strictEqual(envios.length, 0);
  assert.strictEqual(actualizacionesContacto.length, 0);
  assert.strictEqual(filasMarcadas.length, 0);
}

function casoMcpSinParametrosSoloMarcar() {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../src/mcp/server.js'), 'utf8');
  const bloque = src.match(
    /server\.tool\(\s*'disparar_campanas_aprobadas'[\s\S]*?^\s{2}\);/m
  );
  assert.ok(bloque, 'debe existir la tool disparar_campanas_aprobadas');
  assert.ok(/\{\s*\}/.test(bloque[0]), 'el schema de la tool debe seguir vacío');
  assert.ok(
    /await dispararCampanasAprobadas\(\)/.test(bloque[0]),
    'el agente no puede pasar flags'
  );
  assert.ok(!/soloMarcar/.test(bloque[0]), 'soloMarcar no se expone por MCP');
}

async function dispararReactivacion({ ultimaCampanaEnviada, reactivacionesEnviadas, fechaUltimaCampana, ahora, modoSimulacion = false, soloMarcar = false }) {
  limpiarEfectos();
  candidatas = [{ id: 'cita-c', asistentePageId: 'asistente-c' }];
  confirmados = new Set();
  contacto = {
    id: 'asistente-c',
    nombre: 'Dana',
    whatsapp: '523300000001',
    ultimaCampanaEnviada,
    fechaUltimaCampana,
    reactivacionesEnviadas,
  };
  return dispararCampanasAprobadas({ modoSimulacion, soloMarcar, ahora: new Date(ahora) });
}

async function casoContadorCeroUsaVariante1() {
  const resultado = await dispararReactivacion({
    ultimaCampanaEnviada: CAMPANA_C_LEGACY,
    reactivacionesEnviadas: 0,
    fechaUltimaCampana: '2026-08-03T20:00:00.000Z',
    ahora: '2026-08-23T20:00:00.000Z',
  });
  assert.strictEqual(resultado.enviadosC1, 1);
  assert.strictEqual(envios.length, 1);
  assert.strictEqual(actualizacionesContacto[0].campana, REACTIVACION_1);
  assert.strictEqual(incrementosReactivaciones.length, 1);
  assert.strictEqual(incrementosReactivaciones[0].nuevoValor, 1);
}

async function casoContadorUnoUsaVariante2() {
  const resultado = await dispararReactivacion({
    ultimaCampanaEnviada: REACTIVACION_1,
    reactivacionesEnviadas: 1,
    fechaUltimaCampana: '2026-08-03T20:00:00.000Z',
    ahora: '2026-08-23T20:00:00.000Z',
  });
  assert.strictEqual(resultado.enviadosC2, 1);
  assert.strictEqual(actualizacionesContacto[0].campana, REACTIVACION_2);
  assert.strictEqual(incrementosReactivaciones[0].nuevoValor, 2);
}

async function casoTopeGanaAunqueHayanPasadoCienDias() {
  const resultado = await dispararReactivacion({
    ultimaCampanaEnviada: REACTIVACION_2,
    reactivacionesEnviadas: 2,
    fechaUltimaCampana: '2026-05-15T20:00:00.000Z',
    ahora: '2026-08-23T20:00:00.000Z',
    modoSimulacion: true,
  });
  assert.strictEqual(resultado.sinEnviar, 1);
  assert.strictEqual(resultado.detalle[0].motivo, 'TOPE_REACTIVACIONES_ALCANZADO');
  assert.strictEqual(envios.length, 0);
  assert.strictEqual(incrementosReactivaciones.length, 0);
}

async function casoTopeNoBloqueaBSiYaReservo() {
  limpiarEfectos();
  candidatas = [{ id: 'cita-b', asistentePageId: 'asistente-b' }];
  confirmados = new Set(['asistente-b']);
  contacto = {
    id: 'asistente-b',
    nombre: 'Eva',
    whatsapp: '523300000002',
    ultimaCampanaEnviada: REACTIVACION_2,
    fechaUltimaCampana: '2026-05-15T20:00:00.000Z',
    reactivacionesEnviadas: 2,
  };
  const resultado = await dispararCampanasAprobadas({
    modoSimulacion: true,
    ahora: new Date('2026-08-23T20:00:00.000Z'),
  });
  assert.strictEqual(resultado.simuladosB, 1);
  assert.strictEqual(resultado.detalle[0].campana, CAMPANA_B);
  assert.strictEqual(incrementosReactivaciones.length, 0, 'B no incrementa reactivaciones');
}

async function casoContadorVacioSeTrataComoCero() {
  const resultado = await dispararReactivacion({
    ultimaCampanaEnviada: CAMPANA_B,
    reactivacionesEnviadas: undefined,
    fechaUltimaCampana: '2026-08-03T20:00:00.000Z',
    ahora: '2026-08-23T20:00:00.000Z',
    soloMarcar: true,
  });
  assert.strictEqual(resultado.marcadosSinEnviarC1, 1);
  assert.strictEqual(envios.length, 0);
  assert.strictEqual(incrementosReactivaciones.length, 1);
  assert.strictEqual(incrementosReactivaciones[0].nuevoValor, 1);
}

function casoEnCursoRecienteNoEsCandidata() {
  const ahora = new Date('2026-08-23T20:00:00.000Z');
  const hace5 = new Date(ahora.getTime() - 5 * 60 * 1000).toISOString();
  assert.strictEqual(
    esCandidataEnvioCampana({ estadoEnvioCampana: ESTADO_ENVIO_EN_CURSO, fechaInicioEnvio: hace5 }, ahora),
    false
  );
}

function casoEnCursoVencidoSiEsCandidata() {
  const ahora = new Date('2026-08-23T20:00:00.000Z');
  const hace15 = new Date(ahora.getTime() - 15 * 60 * 1000).toISOString();
  assert.strictEqual(
    esCandidataEnvioCampana({ estadoEnvioCampana: ESTADO_ENVIO_EN_CURSO, fechaInicioEnvio: hace15 }, ahora),
    true
  );
  assert.strictEqual(MINUTOS_TIMEOUT_ENVIO_EN_CURSO, 10);
  assert.strictEqual(
    esCandidataEnvioCampana({ estadoEnvioCampana: ESTADO_ENVIO_PENDIENTE }, ahora),
    true
  );
  assert.strictEqual(
    esCandidataEnvioCampana({ estadoEnvioCampana: ESTADO_ENVIO_FALLO }, ahora),
    true
  );
  assert.strictEqual(
    esCandidataEnvioCampana({ estadoEnvioCampana: ESTADO_ENVIO_ENVIADA }, ahora),
    false
  );
}

function casoBackoffIgualQueBooking() {
  assert.strictEqual(backoffUtil.INTENTOS_MAXIMOS, 3);
  assert.strictEqual(backoffUtil.MS_BASE_BACKOFF, 300);
}

async function casoEnvioOkPeroNotionFallaDejaRastroEnCurso() {
  limpiarEfectos();
  fallarMarcarCampanaEnviada = true;
  candidatas = [{ id: 'cita-x', asistentePageId: 'asistente-1' }];
  confirmados = new Set();
  contacto = {
    id: 'asistente-1',
    nombre: 'Ana',
    whatsapp: '523300000000',
    ultimaCampanaEnviada: null,
    fechaUltimaCampana: null,
  };
  const resultado = await dispararCampanasAprobadas({
    modoSimulacion: false,
    ahora: new Date('2026-08-23T20:00:00.000Z'),
  });
  assert.strictEqual(envios.length, 1);
  assert.strictEqual(llamadasEnviarPlantilla, 1);
  assert.strictEqual(llamadasMarcarEnviada, 3);
  assert.deepStrictEqual(esperasBackoff, [300, 600]);
  assert.strictEqual(resultado.errores.length, 1);
  assert.ok(resultado.errores[0].mensaje.includes('POST-envío'));
  assert.strictEqual(estadosEnvio[0].estado, ESTADO_ENVIO_EN_CURSO);
  assert.ok(estadosEnvio.every((e) => e.estado !== ESTADO_ENVIO_PENDIENTE));
  assert.ok(estadosEnvio.every((e) => e.estado !== ESTADO_ENVIO_ENVIADA));
  assert.ok(estadosEnvio.every((e) => e.estado !== ESTADO_ENVIO_FALLO));
}

async function casoNotionFallaDosVecesLuegoConfirma() {
  limpiarEfectos();
  fallosRestantesMarcarEnviada = 2;
  candidatas = [{ id: 'cita-ok', asistentePageId: 'asistente-1' }];
  confirmados = new Set();
  contacto = {
    id: 'asistente-1',
    nombre: 'Ana',
    whatsapp: '523300000000',
    ultimaCampanaEnviada: null,
    fechaUltimaCampana: null,
  };
  const resultado = await dispararCampanasAprobadas({
    modoSimulacion: false,
    ahora: new Date('2026-08-23T20:00:00.000Z'),
  });
  assert.strictEqual(resultado.errores.length, 0);
  assert.strictEqual(resultado.enviadosA, 1);
  assert.strictEqual(envios.length, 1);
  assert.strictEqual(llamadasMarcarEnviada, 3);
  assert.deepStrictEqual(esperasBackoff, [300, 600]);
  assert.strictEqual(estadosEnvio[0].estado, ESTADO_ENVIO_EN_CURSO);
  assert.strictEqual(estadosEnvio[estadosEnvio.length - 1].estado, ESTADO_ENVIO_ENVIADA);
}

async function casoEnCursoNoSeReintenta() {
  limpiarEfectos();
  fallarEnCurso = true;
  candidatas = [{ id: 'cita-z', asistentePageId: 'asistente-1' }];
  confirmados = new Set();
  contacto = {
    id: 'asistente-1',
    nombre: 'Ana',
    whatsapp: '523300000000',
    ultimaCampanaEnviada: null,
  };
  const resultado = await dispararCampanasAprobadas({
    modoSimulacion: false,
    ahora: new Date('2026-08-23T20:00:00.000Z'),
  });
  assert.strictEqual(llamadasActualizarEstado, 1);
  assert.strictEqual(llamadasEnviarPlantilla, 0);
  assert.strictEqual(llamadasMarcarEnviada, 0);
  assert.strictEqual(esperasBackoff.length, 0);
  assert.strictEqual(resultado.errores.length, 1);
  assert.ok(!resultado.errores[0].mensaje.includes('POST-envío'));
}

async function casoEnvioPlantillaFallaMarcaFallo() {
  limpiarEfectos();
  fallarEnvioPlantilla = true;
  candidatas = [{ id: 'cita-y', asistentePageId: 'asistente-1' }];
  confirmados = new Set();
  contacto = {
    id: 'asistente-1',
    nombre: 'Ana',
    whatsapp: '523300000000',
    ultimaCampanaEnviada: null,
  };
  const resultado = await dispararCampanasAprobadas({
    modoSimulacion: false,
    ahora: new Date('2026-08-23T20:00:00.000Z'),
  });
  assert.strictEqual(envios.length, 0);
  assert.strictEqual(llamadasEnviarPlantilla, 1);
  assert.strictEqual(llamadasMarcarEnviada, 0);
  assert.strictEqual(esperasBackoff.length, 0);
  assert.strictEqual(resultado.errores.length, 1);
  assert.ok(!resultado.errores[0].mensaje.includes('POST-envío'));
  assert.strictEqual(estadosEnvio[0].estado, ESTADO_ENVIO_EN_CURSO);
  assert.strictEqual(estadosEnvio[1].estado, ESTADO_ENVIO_FALLO);
}

async function main() {
  await casoAgrupadoA();
  console.log('✅ Tres aprobadas del mismo contacto producen una sola campaña A.');
  await casoReactivacionSimulada();
  console.log('✅ A con 20 días cae en C1 y sigue sin efectos en simulación.');
  await casoBPerdidaEntraAReactivacion();
  console.log('✅ B perdida (sin confirmada) entra a reactivación C1, no queda indefinida.');
  casoLimiteExactoCatorceDias();
  console.log('✅ A los 14 días exactos aún no se reactiva; debe haber pasado la ventana.');
  await casoSoloMarcarAgrupado();
  console.log('✅ soloMarcar marca las 3 filas y el contacto, sin llamar a Plática.');
  await casoSoloMarcarNoConviveConSimulacion();
  console.log('✅ soloMarcar + modoSimulacion:true truena y no escribe nada.');
  casoMcpSinParametrosSoloMarcar();
  console.log('✅ MCP sigue exponiendo disparar_campanas_aprobadas sin parámetros.');
  await casoContadorCeroUsaVariante1();
  console.log('✅ Contador 0 usa C1 y deja el contador en 1.');
  await casoContadorUnoUsaVariante2();
  console.log('✅ Contador 1 usa C2 y deja el contador en 2.');
  await casoTopeGanaAunqueHayanPasadoCienDias();
  console.log('✅ Contador en 2 no reactiva aunque hayan pasado 100 días.');
  await casoTopeNoBloqueaBSiYaReservo();
  console.log('✅ El tope no bloquea B si ya hay cita confirmada.');
  await casoContadorVacioSeTrataComoCero();
  console.log('✅ reactivacionesEnviadas vacío se trata como 0.');
  casoEnCursoRecienteNoEsCandidata();
  console.log('✅ En curso de hace 5 minutos no es candidata.');
  casoEnCursoVencidoSiEsCandidata();
  console.log('✅ En curso de hace 15 minutos sí se reintenta; Falló y Pendiente también.');
  casoBackoffIgualQueBooking();
  console.log('✅ Reintentos Notion post-envío: 3 intentos y 300*intento ms, igual que booking.');
  await casoEnvioOkPeroNotionFallaDejaRastroEnCurso();
  console.log('✅ Si WhatsApp sale y Notion falla 3 veces, queda En curso con error POST-envío.');
  await casoNotionFallaDosVecesLuegoConfirma();
  console.log('✅ Si Notion falla 2 veces y sale en la 3ª, termina Enviada.');
  await casoEnCursoNoSeReintenta();
  console.log('✅ Marcar En curso no usa backoff; si falla, no hay WhatsApp.');
  await casoEnvioPlantillaFallaMarcaFallo();
  console.log('✅ Si enviarPlantilla falla, el estado queda Falló (no En curso colgado).');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
