// Campañas agrupadas por contacto, sin Notion ni WhatsApp reales.
//
//   node tests/campanas-matchmaking.manual-test.js

const assert = require('assert');

process.env.CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO = 'true';
process.env.PLATICA_TEMPLATE_OFERTA_INICIAL = 'oferta-inicial-test';

const citasPath = require.resolve('../src/services/citas.service');
const contactosPath = require.resolve('../src/services/contactos.service');
const platicaPath = require.resolve('../src/services/platica-client.service');
const servicePath = require.resolve('../src/services/campanas-matchmaking.service');

let candidatas = [];
let confirmados = new Set();
let contacto = {};
let sponsors = {};
let horariosDisponibles = [];
let horariosPorSponsor = {};
let sponsorsConsultados = [];
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
    async cargarIndiceCitasConfirmadas() {
      return new Map();
    },
    bloquesDisponiblesParaSponsor({ sponsorPageId }) {
      sponsorsConsultados.push(sponsorPageId);
      if (Object.prototype.hasOwnProperty.call(horariosPorSponsor, sponsorPageId)) {
        return horariosPorSponsor[sponsorPageId];
      }
      return horariosDisponibles;
    },
    seleccionarHorariosParaOferta(bloques) {
      return bloques.slice(0, 3);
    },
    formatearHorarioLegible(inicio) {
      return `legible:${inicio}`;
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
    async obtenerContacto(id) {
      return sponsors[id] || contacto;
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
  OFERTA_INICIAL,
  CAMPANA_A,
  CAMPANA_B,
  CAMPANA_C_LEGACY,
  REACTIVACION_1,
  REACTIVACION_2,
  elegirCampana,
  payloadPara,
  primerNombreParaSaludo,
  nombreRepresentanteParaOferta,
  largoCuerpoOferta,
  maxLargoSugerencias,
  TOPE_CUERPO_META,
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
  sponsors = {};
  horariosDisponibles = [];
  horariosPorSponsor = {};
  sponsorsConsultados = [];
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

function configurarOferta({ cantidad = 5, conHorarios = true, campanaPrevia = null } = {}) {
  limpiarEfectos();
  contacto = {
    id: 'asistente-1',
    nombre: 'Ana',
    whatsapp: '523300000000',
    ultimaCampanaEnviada: campanaPrevia,
  };
  candidatas = Array.from({ length: cantidad }, (_, i) => ({
    id: `cita-${i + 1}`,
    asistentePageId: 'asistente-1',
    sponsorPageId: `sponsor-${i + 1}`,
    score: 100 - i,
  }));
  sponsors = Object.fromEntries(
    candidatas.map((fila, i) => [
      fila.sponsorPageId,
      {
        id: fila.sponsorPageId,
        nombre: `Persona ${i + 1}`,
        empresa: `Empresa ${i + 1}`,
        solucion: [`Solución ${i + 1}`],
      },
    ])
  );
  horariosDisponibles = conHorarios
    ? [
        { inicio: '2026-10-07T10:30:00-06:00', disponible: true },
        { inicio: '2026-10-07T14:00:00-06:00', disponible: true },
        { inicio: '2026-10-08T09:00:00-06:00', disponible: true },
      ]
    : [];
}

async function casoTopCuatroYParamsEstables() {
  configurarOferta();
  const resultado = await dispararCampanasAprobadas({ modoSimulacion: true });
  assert.strictEqual(resultado.simuladosOfertaInicial, 1);
  assert.deepStrictEqual(resultado.detalle[0].ofrecidas, ['cita-1', 'cita-2', 'cita-3', 'cita-4']);
  assert.deepStrictEqual(resultado.detalle[0].omitidas, ['cita-5']);
  const payload = resultado.detalle[0].payload;
  assert.strictEqual(payload.params.length, 2, 'la plantilla lleva solo nombre y sugerencias');
  assert.strictEqual(payload.params[0], 'Ana');
  assert.ok(payload.params[1].includes('1) *Persona 1* de *Empresa 1* (Solución 1)'));
  assert.ok(payload.params[1].includes('4) *Persona 4* de *Empresa 4* (Solución 4)'));
  assert.ok(!payload.params[1].includes('Empresa 5'));
  assert.ok(payload.params[1].startsWith('1) '), 'los sponsors van numerados');
  assert.strictEqual((payload.params[1].match(/ \| /g) || []).length, 3, 'tres barras entre cuatro sponsors');
  assert.ok(
    !/[\r\n\t]/.test(payload.params[1]),
    'WhatsApp rechaza saltos de línea dentro de una variable'
  );
  assert.ok(largoCuerpoOferta(payload.params[0], payload.params[1]) <= TOPE_CUERPO_META);
  assert.deepStrictEqual(sponsorsConsultados, [], 'la oferta ya no consulta disponibilidad');
  assert.ok(!JSON.stringify(resultado).match(/C1|C2|Reactivaci[oó]n/));
  assert.strictEqual(envios.length, 0);
  assert.strictEqual(filasMarcadas.length, 0);
}

async function casoParametroSaneadoParaWhatsApp() {
  configurarOferta();
  const payload = payloadPara({
    contacto: { ...contacto, nombre: 'Ana\nMaría' },
    sugerencias: [{ empresa: 'Revie', solucion: ['Reseñas\nde clientes', 'Marketing   por WhatsApp'] }],
    modoSimulacion: true,
  });
  assert.strictEqual(payload.params[0], 'Ana');
  assert.strictEqual(payload.params[1], '1) *Revie* (Reseñas de clientes, Marketing por WhatsApp)');
}

// Ticketópolis manda "NOMBRE APELLIDO" en mayúsculas al actualizar Notion.
async function casoSaludoSoloPrimerNombre() {
  assert.strictEqual(primerNombreParaSaludo('ANA MARIA PEREZ LOPEZ'), 'Ana');
  assert.strictEqual(primerNombreParaSaludo('JOSÉ  DE LA CRUZ'), 'José');
  assert.strictEqual(primerNombreParaSaludo('  adler  '), 'Adler');
  assert.strictEqual(primerNombreParaSaludo('ANA-MARÍA SOTO'), 'Ana-María');
  assert.strictEqual(primerNombreParaSaludo(''), '');
  assert.strictEqual(primerNombreParaSaludo(null), '');

  configurarOferta();
  const payload = payloadPara({
    contacto: { ...contacto, nombre: '   ' },
    sugerencias: [{ empresa: 'Revie', solucion: ['Omnichannel'] }],
    modoSimulacion: true,
  });
  assert.strictEqual(payload.params[0], 'Asistente', 'sin nombre usable cae al genérico');
}

// El catálogo completo del sponsor hacía que el cuerpo pasara 1024 caracteres
// (caso real: 4 sponsors × 5 soluciones = 1035) y Meta rechazaba el envío.
async function casoSolucionesCruzadasConLoQueBusca() {
  configurarOferta();
  const payload = payloadPara({
    contacto: { ...contacto, solucionesBuscadas: ['Omnichannel', 'Pagos', 'Analitica / data'] },
    sugerencias: [
      { empresa: 'Blip', solucion: ['Performance marketing', 'Omnichannel', 'Pagos', 'Analitica / data'] },
      { empresa: 'Envia.com', solucion: ['Otro'] },
    ],
    modoSimulacion: true,
  });
  assert.strictEqual(
    payload.params[1],
    '1) *Blip* (Omnichannel, Pagos) | 2) *Envia.com*'
  );
}

async function casoSugerenciasNoPasanElMargen() {
  configurarOferta();
  const largo = (n) => ({
    nombre: `Representante con varios apellidos extra número ${n} Uno Dos`,
    empresa: `Empresa con nombre larguísimo número ${n}`,
    solucion: ['Estrategia de marketing digital', 'Inteligencia artificial'],
  });
  const payload = payloadPara({
    contacto,
    sugerencias: [largo(1), largo(2), largo(3), largo(4)],
    modoSimulacion: true,
  });
  const tope = maxLargoSugerencias(payload.params[0]);
  assert.ok(payload.params[1].length <= tope, `{{2}} midió ${payload.params[1].length} (tope ${tope})`);
  assert.ok(
    largoCuerpoOferta(payload.params[0], payload.params[1]) <= TOPE_CUERPO_META,
    'el cuerpo armado no puede pasar de 1024'
  );
  assert.ok(payload.params[1].includes('Empresa con nombre larguísimo número 4'));
  assert.ok(
    !payload.params[1].includes('Inteligencia artificial'),
    'al no caber las dos soluciones, se recorta a una por sponsor antes de soltar gente'
  );
}

async function casoNombreRepresentanteDosTokens() {
  assert.strictEqual(nombreRepresentanteParaOferta('Marco Trujillo'), 'Marco Trujillo');
  assert.strictEqual(nombreRepresentanteParaOferta('RODRIGO CERDA SOMOZA'), 'Rodrigo Cerda');
  assert.strictEqual(
    nombreRepresentanteParaOferta('Zuleyma Jessamine Chávez Coronado'),
    'Zuleyma Chávez'
  );
  assert.strictEqual(nombreRepresentanteParaOferta('ANA-MARÍA SOTO'), 'Ana-María Soto');
  assert.strictEqual(nombreRepresentanteParaOferta(''), '');

  configurarOferta();
  const payload = payloadPara({
    contacto,
    sugerencias: [
      {
        nombre: 'ZULEYMA JESSAMINE CHÁVEZ CORONADO',
        empresa: 'Blip',
        solucion: ['Omnichannel'],
      },
      { nombre: 'Marco Trujillo', empresa: 'Platica.mx', solucion: ['Omnichannel'] },
    ],
    modoSimulacion: true,
  });
  assert.strictEqual(
    payload.params[1],
    '1) *Zuleyma Chávez* de *Blip* (Omnichannel) | 2) *Marco Trujillo* de *Platica.mx* (Omnichannel)'
  );
}

async function casoCampanaPreviaBloqueaReenvio() {
  configurarOferta({ campanaPrevia: 'A - Primera oferta' });
  const resultado = await dispararCampanasAprobadas({ modoSimulacion: false });
  assert.strictEqual(resultado.sinEnviar, 1);
  assert.strictEqual(resultado.detalle[0].motivo, 'CAMPANA_PREVIA');
  assert.strictEqual(envios.length, 0);
  assert.strictEqual(filasMarcadas.length, 0);
}

async function casoSinBloquesLibresIgualEnvia() {
  configurarOferta({ conHorarios: false });
  horariosPorSponsor = { 'sponsor-1': [], 'sponsor-2': [], 'sponsor-3': [], 'sponsor-4': [] };
  const resultado = await dispararCampanasAprobadas({ modoSimulacion: false });
  assert.strictEqual(resultado.sinEnviar, 0);
  assert.strictEqual(resultado.enviadosOfertaInicial, 1);
  assert.strictEqual(llamadasEnviarPlantilla, 1);
  assert.deepStrictEqual(sponsorsConsultados, []);
  assert.deepStrictEqual(filasMarcadas[0], candidatas.map((f) => f.id));
  assert.strictEqual(actualizacionesContacto[0].campana, OFERTA_INICIAL);
}

async function casoEnvioRealMarcaTodoElGrupo() {
  configurarOferta();
  const resultado = await dispararCampanasAprobadas({ modoSimulacion: false });
  assert.strictEqual(resultado.enviadosOfertaInicial, 1);
  assert.strictEqual(envios.length, 1);
  assert.strictEqual(envios[0].templateName, 'oferta-inicial-test');
  assert.deepStrictEqual(filasMarcadas[0], candidatas.map((f) => f.id));
  assert.strictEqual(actualizacionesContacto[0].campana, OFERTA_INICIAL);
  assert.strictEqual(incrementosReactivaciones.length, 0);
  assert.strictEqual(estadosEnvio[0].estado, ESTADO_ENVIO_EN_CURSO);
  assert.strictEqual(estadosEnvio[estadosEnvio.length - 1].estado, ESTADO_ENVIO_ENVIADA);
}

async function casoBackoffPostEnvio() {
  configurarOferta();
  fallarMarcarCampanaEnviada = true;
  const resultado = await dispararCampanasAprobadas({ modoSimulacion: false });
  assert.strictEqual(llamadasEnviarPlantilla, 1);
  assert.strictEqual(llamadasMarcarEnviada, 3);
  assert.deepStrictEqual(esperasBackoff, [300, 600]);
  assert.ok(resultado.errores[0].mensaje.includes('POST-envío'));
  assert.ok(estadosEnvio.every((e) => e.estado !== ESTADO_ENVIO_FALLO));
}

async function casoSoloMarcarTodaLaCola() {
  configurarOferta({ conHorarios: false, campanaPrevia: 'C2 - Reactivación' });
  const resultado = await dispararCampanasAprobadas({ soloMarcar: true });
  assert.strictEqual(resultado.marcadosSinEnviarOfertaInicial, 1);
  assert.strictEqual(envios.length, 0);
  assert.deepStrictEqual(filasMarcadas[0], candidatas.map((f) => f.id));
}

async function main() {
  await casoTopCuatroYParamsEstables();
  console.log('✅ Oferta única usa top 4 y 2 params: nombre y sponsors en una línea.');
  await casoParametroSaneadoParaWhatsApp();
  console.log('✅ Los params se sanean: sin saltos de línea ni espacios dobles.');
  await casoSaludoSoloPrimerNombre();
  console.log('✅ El saludo usa solo el primer nombre, capitalizado.');
  await casoSolucionesCruzadasConLoQueBusca();
  console.log('✅ {{2}} solo lleva las soluciones que el asistente buscaba, sin "Otro".');
  await casoNombreRepresentanteDosTokens();
  console.log('✅ El representante sale como nombre + apellido paterno, en negrita.');
  await casoSugerenciasNoPasanElMargen();
  console.log('✅ {{2}} se recorta para no pasar el tope de 1024 del cuerpo.');
  await casoCampanaPreviaBloqueaReenvio();
  console.log('✅ Una campaña previa bloquea cualquier segundo envío automático.');
  await casoSinBloquesLibresIgualEnvia();
  console.log('✅ Sin bloques libres se envía igual: la plantilla ya no lleva horarios.');
  await casoEnvioRealMarcaTodoElGrupo();
  console.log('✅ Envío real conserva send-state y marca incluso las filas omitidas del mensaje.');
  casoEnCursoRecienteNoEsCandidata();
  casoEnCursoVencidoSiEsCandidata();
  casoBackoffIgualQueBooking();
  await casoBackoffPostEnvio();
  console.log('✅ Backoff post-envío conserva 3 intentos y deja rastro En curso.');
  await casoSoloMarcarTodaLaCola();
  console.log('✅ soloMarcar procesa toda la cola sin WhatsApp ni cálculo de horarios.');
  await casoSoloMarcarNoConviveConSimulacion();
  casoMcpSinParametrosSoloMarcar();
  console.log('✅ Guardas de soloMarcar y MCP permanecen cerradas.');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
