// Push manual a filas Sugerido (Infracommerce / Revie), curadas en Notion.
// Si el asistente ya tiene Última Campaña = Oferta inicial → propuesta_cita.
// Si no → agendar_cita_inicial_aprobado_* (misma lógica que la oferta inicial).

const citasService = require('./citas.service');
const contactosService = require('./contactos.service');
const platicaClient = require('./platica-client.service');
const {
  prepararPayloadPropuestaCita,
  prepararPayloadOfertaInicialParaPush,
  persistirOfertaInicialTrasEnvio,
  contactoEsAmazon,
  ESTADO_ENVIO_EN_CURSO,
  ESTADO_ENVIO_ENVIADA,
  ESTADO_ENVIO_FALLO,
} = require('./campanas-matchmaking.service');
const { reintentarConBackoff } = require('../utils/reintentar-con-backoff');
const { esCandidataEnvioCampana } = require('../utils/estado-envio-campana');

const SPONSORES = Object.freeze({
  infracommerce: {
    pageId: '3bc62dda-199a-81bb-b769-f4ef0eab9a5f',
    empresa: 'Infracommerce',
  },
  revie: {
    pageId: '3bc62dda-199a-8189-805d-ee8b4fcca080',
    empresa: 'Revie',
  },
});

const BOLETOS_EXCLUIDOS = new Set(['Speaker', 'Expo']);

function modoSimulacionPush(modoSimulacion) {
  if (typeof modoSimulacion === 'boolean') return modoSimulacion;
  return process.env.PUSH_OPORTUNIDAD_SPONSOR_MODO_SIMULACION !== 'false';
}

function exigirEnvioRealHabilitado(simulando) {
  if (!simulando && process.env.PUSH_OPORTUNIDAD_SPONSOR_ENVIO_REAL_HABILITADO !== 'true') {
    throw new Error(
      'Envío real de push oportunidad sponsor deshabilitado. Define PUSH_OPORTUNIDAD_SPONSOR_ENVIO_REAL_HABILITADO=true solo después de revisar la simulación.'
    );
  }
}

function yaRecibioOfertaInicial(contacto) {
  return contacto.ultimaCampanaEnviada === contactosService.CAMPANA_OFERTA_INICIAL;
}

function resolverSponsor(clave) {
  const normalizada = String(clave || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  const alias = {
    infracommerce: 'infracommerce',
    infra: 'infracommerce',
    revie: 'revie',
  };
  const key = alias[normalizada] || normalizada;
  const sponsor = SPONSORES[key];
  if (!sponsor) {
    const err = new Error(`Sponsor desconocido: "${clave}". Usa infracommerce o revie.`);
    err.code = 'SPONSOR_DESCONOCIDO';
    throw err;
  }
  return { key, ...sponsor };
}

async function armarPayload({ contacto, sponsor, simulando }) {
  if (yaRecibioOfertaInicial(contacto)) {
    return prepararPayloadPropuestaCita({ contacto, sponsor, modoSimulacion: simulando });
  }
  const filasAprobado = await citasService.listarAprobadosSinCampanaPorAsistente(contacto.id);
  return prepararPayloadOfertaInicialParaPush({
    contacto,
    filasAprobado,
    sponsorUnico: sponsor,
    modoSimulacion: simulando,
  });
}

async function persistirTrasEnvio({ contacto, payload, filaSugeridoId, ahora }) {
  const fechaEnvio = ahora.toISOString();
  if (payload.tipoPlantilla === 'oferta_inicial') {
    await reintentarConBackoff(async () => {
      await persistirOfertaInicialTrasEnvio({
        contactoId: contacto.id,
        filasAprobadoIds: payload.filasAprobadoMarcar || [],
        fechaEnvio,
      });
      await citasService.actualizarEstadoEnvioCampana([filaSugeridoId], {
        estado: ESTADO_ENVIO_ENVIADA,
        fechaInicioEnvio: fechaEnvio,
      });
    });
    return;
  }
  await reintentarConBackoff(async () => {
    await citasService.actualizarEstadoEnvioCampana([filaSugeridoId], {
      estado: ESTADO_ENVIO_ENVIADA,
      fechaInicioEnvio: fechaEnvio,
    });
  });
}

async function ejecutarPushOportunidadSponsor({ sponsor: sponsorClave, modoSimulacion, ahora = new Date() } = {}) {
  const { key, pageId, empresa } = resolverSponsor(sponsorClave);
  const simulando = modoSimulacionPush(modoSimulacion);
  exigirEnvioRealHabilitado(simulando);

  const sponsor = await contactosService.obtenerContacto(pageId);
  const filas = await citasService.listarSugeridasParaPushOportunidad(pageId);
  const resumen = {
    sponsor: key,
    sponsorPageId: pageId,
    sponsorEmpresa: sponsor.empresa || empresa,
    modoSimulacion: simulando,
    candidatos: filas.length,
    enviados: 0,
    enviadosPropuestaCita: 0,
    enviadosOfertaInicial: 0,
    simulados: 0,
    simuladosPropuestaCita: 0,
    simuladosOfertaInicial: 0,
    omitidosEstado: 0,
    omitidosBoleto: 0,
    omitidosAmazon: 0,
    omitidosSinWhatsapp: 0,
    omitidosSinPayload: 0,
    errores: [],
    detalle: [],
  };

  for (const fila of filas) {
    try {
      if (!esCandidataEnvioCampana(fila, ahora)) {
        resumen.omitidosEstado += 1;
        resumen.detalle.push({
          citaId: fila.id,
          asistentePageId: fila.asistentePageId,
          motivo: 'YA_ENVIADO_O_EN_CURSO',
        });
        continue;
      }

      const contacto = await contactosService.obtenerContacto(fila.asistentePageId);
      if (contactoEsAmazon(contacto)) {
        resumen.omitidosAmazon += 1;
        resumen.detalle.push({
          citaId: fila.id,
          asistentePageId: fila.asistentePageId,
          motivo: 'AMAZON',
        });
        continue;
      }
      if (BOLETOS_EXCLUIDOS.has(contacto.ticketTipo)) {
        resumen.omitidosBoleto += 1;
        resumen.detalle.push({
          citaId: fila.id,
          asistentePageId: fila.asistentePageId,
          nombre: contacto.nombre,
          boleto: contacto.ticketTipo,
          motivo: 'BOLETO_EXCLUIDO',
        });
        continue;
      }
      if (!contacto.whatsapp) {
        resumen.omitidosSinWhatsapp += 1;
        resumen.detalle.push({
          citaId: fila.id,
          asistentePageId: fila.asistentePageId,
          motivo: 'SIN_WHATSAPP',
        });
        continue;
      }

      let payload;
      try {
        payload = await armarPayload({ contacto, sponsor, simulando });
      } catch (errPayload) {
        resumen.omitidosSinPayload += 1;
        resumen.detalle.push({
          citaId: fila.id,
          asistentePageId: fila.asistentePageId,
          nombre: contacto.nombre,
          motivo: 'SIN_PAYLOAD',
          mensaje: errPayload.message,
        });
        continue;
      }

      const rama = payload.tipoPlantilla === 'oferta_inicial' ? 'oferta_inicial' : 'propuesta_cita';
      const detalleBase = {
        citaId: fila.id,
        asistentePageId: fila.asistentePageId,
        nombre: contacto.nombre,
        whatsapp: contacto.whatsapp,
        rama,
        ultimaCampanaEnviada: contacto.ultimaCampanaEnviada || null,
        payload,
      };

      if (simulando) {
        resumen.simulados += 1;
        if (rama === 'oferta_inicial') resumen.simuladosOfertaInicial += 1;
        else resumen.simuladosPropuestaCita += 1;
        resumen.detalle.push({ ...detalleBase, simulado: true });
        continue;
      }

      await citasService.actualizarEstadoEnvioCampana([fila.id], {
        estado: ESTADO_ENVIO_EN_CURSO,
        fechaInicioEnvio: ahora.toISOString(),
      });

      try {
        await platicaClient.enviarPlantilla(payload);
      } catch (errorEnvio) {
        try {
          await citasService.actualizarEstadoEnvioCampana([fila.id], {
            estado: ESTADO_ENVIO_FALLO,
          });
        } catch (_) {
          /* En curso vence en 10 min */
        }
        throw errorEnvio;
      }

      await persistirTrasEnvio({ contacto, payload, filaSugeridoId: fila.id, ahora });

      resumen.enviados += 1;
      if (rama === 'oferta_inicial') resumen.enviadosOfertaInicial += 1;
      else resumen.enviadosPropuestaCita += 1;
      resumen.detalle.push({ ...detalleBase, simulado: false });
    } catch (error) {
      resumen.errores.push({
        citaId: fila.id,
        asistentePageId: fila.asistentePageId,
        mensaje: error.message || String(error),
      });
    }
  }

  return resumen;
}

module.exports = {
  SPONSORES,
  ejecutarPushOportunidadSponsor,
  resolverSponsor,
  yaRecibioOfertaInicial,
};
