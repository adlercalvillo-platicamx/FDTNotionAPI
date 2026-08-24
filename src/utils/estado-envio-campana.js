// Criterio de reintento del disparador de campañas. El estado vive en Notion;
// no hay cola ni jobs: la siguiente corrida vuelve a leer las filas.

const ESTADO_ENVIO_PENDIENTE = 'Pendiente';
const ESTADO_ENVIO_EN_CURSO = 'En curso';
const ESTADO_ENVIO_ENVIADA = 'Enviada';
const ESTADO_ENVIO_FALLO = 'Falló';
const MINUTOS_TIMEOUT_ENVIO_EN_CURSO = 10;

function esCandidataEnvioCampana({ estadoEnvioCampana, fechaInicioEnvio } = {}, ahora = new Date()) {
  if (estadoEnvioCampana === ESTADO_ENVIO_ENVIADA) return false;
  if (estadoEnvioCampana !== ESTADO_ENVIO_EN_CURSO) return true;

  if (!fechaInicioEnvio) return true;
  const inicio = new Date(fechaInicioEnvio);
  if (Number.isNaN(inicio.getTime())) return true;
  return ahora.getTime() - inicio.getTime() >= MINUTOS_TIMEOUT_ENVIO_EN_CURSO * 60 * 1000;
}

module.exports = {
  ESTADO_ENVIO_PENDIENTE,
  ESTADO_ENVIO_EN_CURSO,
  ESTADO_ENVIO_ENVIADA,
  ESTADO_ENVIO_FALLO,
  MINUTOS_TIMEOUT_ENVIO_EN_CURSO,
  esCandidataEnvioCampana,
};
