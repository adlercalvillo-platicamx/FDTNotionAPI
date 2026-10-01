// Plantilla quiere_citas_no para quien marcó Quiere Citas = No y aun así
// es elegible por giro, boleto (Presencial / Virtual / Breakfast) y tamaño.
// Grande o Mediana entran por el tamaño declarado. Pequeña, Micro o sin
// tamaño entran solo con Madurez Negocio (Exa) Consolidado o PyME.
// No crea filas Sugerido. Follow-up y last call no leen esta campaña.
// Simulación por default: no llama a Plática ni escribe Notion.

const contactosService = require('./contactos.service');
const platicaClient = require('./platica-client.service');
const { primerNombreParaSaludo } = require('./campanas-matchmaking.service');
const { reintentarConBackoff } = require('../utils/reintentar-con-backoff');

const TEMPLATE_ENV = 'PLATICA_TEMPLATE_QUIERE_CITAS_NO';
const TEMPLATE_DEFAULT = 'quiere_citas_no';
const CAMPANA = contactosService.CAMPANA_QUIERE_CITAS_NO;

const TAMANO_GRANDE = 'Grande - más de 250 empleados';
const TAMANO_MEDIANA = 'Mediana - 50 a 250 empleados';
const TAMANO_PEQUENA = 'Pequeña - 10 a 50 empleados';
const TAMANO_MICRO = 'Micro - menos de 10 empleados';
const EXA_QUE_ENTRAN = new Set(['Consolidado', 'PyME']);

function categoriaTamano(tamano) {
  if (tamano === TAMANO_GRANDE) return 'Grande';
  if (tamano === TAMANO_MEDIANA) return 'Mediana';
  if (tamano === TAMANO_PEQUENA) return 'Pequeña';
  if (tamano === TAMANO_MICRO) return 'Micro';
  return null;
}

function viaTamanoQuiereCitasNo(contacto) {
  const categoria = categoriaTamano(contacto?.tamanoNegocio);
  const exa = contacto?.madurezNegocioExa;
  const exaEntra = EXA_QUE_ENTRAN.has(exa);
  if (categoria === 'Grande' || categoria === 'Mediana') return categoria;
  if ((categoria === 'Pequeña' || categoria === 'Micro') && exaEntra) {
    return `${categoria}+${exa}`;
  }
  if (!categoria && exaEntra) return `legacy_${exa}`;
  return null;
}

function esAudienciaQuiereCitasNo(contacto) {
  if (!contacto || contacto.categoria !== 'Asistente' || contacto.dadoDeBaja) return false;
  if (contacto.quiereCitas1a1 !== 'No') return false;
  if (!contactosService.GIROS_ELEGIBLES_MATCHMAKING.includes(contacto.giroIndustria)) return false;
  if (!contactosService.TIPOS_BOLETO_CON_OPTIN.has(contacto.ticketTipo)) return false;
  return Boolean(viaTamanoQuiereCitasNo(contacto));
}

function motivoNoEnviar(contacto) {
  if (!contacto.whatsapp) return 'SIN_WHATSAPP';
  if (contacto.ultimaCampanaEnviada) return 'YA_TIENE_CAMPANA';
  if ((contacto.citasConfirmadasAsistente || 0) > 0) return 'YA_TIENE_CITAS';
  return null;
}

function modoSimulacionQuiereCitasNo(modoSimulacion) {
  return modoSimulacion !== undefined
    ? Boolean(modoSimulacion)
    : process.env.QUIERE_CITAS_NO_MODO_SIMULACION !== 'false';
}

function exigirEnvioRealHabilitado(simulando) {
  if (!simulando && process.env.QUIERE_CITAS_NO_ENVIO_REAL_HABILITADO !== 'true') {
    throw new Error(
      'Envío real de quiere_citas_no deshabilitado. Define QUIERE_CITAS_NO_ENVIO_REAL_HABILITADO=true solo después de revisar la simulación.'
    );
  }
}

function plantillaQuiereCitasNo(modoSimulacion) {
  const configurada = process.env[TEMPLATE_ENV];
  if (configurada) return configurada;
  if (modoSimulacion) return TEMPLATE_DEFAULT;
  throw new Error(`Falta ${TEMPLATE_ENV}; no se puede enviar quiere_citas_no`);
}

function payloadQuiereCitasNo(contacto, modoSimulacion) {
  return {
    phone: contacto.whatsapp,
    templateName: plantillaQuiereCitasNo(modoSimulacion),
    params: [primerNombreParaSaludo(contacto.nombre) || 'Asistente'],
  };
}

async function enviarQuiereCitasNo({ modoSimulacion } = {}) {
  const simulando = modoSimulacionQuiereCitasNo(modoSimulacion);
  exigirEnvioRealHabilitado(simulando);

  const contactos = await contactosService.listarAsistentesConQuiereCitasNo();
  const audiencia = contactos.filter(esAudienciaQuiereCitasNo);
  const resumen = {
    modoSimulacion: simulando,
    campana: CAMPANA,
    revisados: contactos.length,
    audiencia: audiencia.length,
    simulados: 0,
    enviados: 0,
    omitidos: 0,
    errores: [],
    detalle: [],
  };

  for (const contacto of audiencia) {
    const motivo = motivoNoEnviar(contacto);
    if (motivo) {
      resumen.omitidos += 1;
      resumen.detalle.push({
        contactoId: contacto.id,
        nombre: contacto.nombre,
        empresa: contacto.empresa,
        motivo,
      });
      continue;
    }

    const payload = payloadQuiereCitasNo(contacto, simulando);
    const ficha = {
      contactoId: contacto.id,
      nombre: contacto.nombre,
      empresa: contacto.empresa,
      ticketTipo: contacto.ticketTipo,
      via: viaTamanoQuiereCitasNo(contacto),
      whatsapp: contacto.whatsapp,
      payload,
    };

    if (simulando) {
      resumen.simulados += 1;
      resumen.detalle.push({ ...ficha, simulado: true });
      continue;
    }

    try {
      await platicaClient.enviarPlantilla(payload);
      const fechaEnvio = new Date().toISOString();
      await reintentarConBackoff(async () => {
        await contactosService.actualizarEstadoCampana({
          contactoId: contacto.id,
          campana: CAMPANA,
          fechaEnvio,
        });
      });
      resumen.enviados += 1;
      resumen.detalle.push({ ...ficha, simulado: false, fechaEnvio });
    } catch (error) {
      resumen.errores.push({
        contactoId: contacto.id,
        nombre: contacto.nombre,
        empresa: contacto.empresa,
        mensaje: error.message || String(error),
      });
    }
  }

  return resumen;
}

module.exports = {
  CAMPANA,
  TEMPLATE_DEFAULT,
  viaTamanoQuiereCitasNo,
  esAudienciaQuiereCitasNo,
  motivoNoEnviar,
  payloadQuiereCitasNo,
  enviarQuiereCitasNo,
};
