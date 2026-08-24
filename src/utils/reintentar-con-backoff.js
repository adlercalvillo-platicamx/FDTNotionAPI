// Reintentos con backoff lineal — mismo criterio que booking.service.js
// (SMTP y confirmación Notion post-Calendar): 3 intentos, espera 300*intento ms.
// No reintenta envíos de WhatsApp; solo operaciones idempotentes (p. ej. PATCH Notion).

const INTENTOS_MAXIMOS = 3;
const MS_BASE_BACKOFF = 300;

let esperarBackoff = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function _setEsperarBackoffForTests(fn) {
  esperarBackoff = fn || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
}

async function reintentarConBackoff(fn) {
  let ultimoError;
  for (let intento = 1; intento <= INTENTOS_MAXIMOS; intento++) {
    try {
      return await fn();
    } catch (err) {
      ultimoError = err;
      if (intento < INTENTOS_MAXIMOS) {
        await esperarBackoff(MS_BASE_BACKOFF * intento);
      }
    }
  }
  throw ultimoError;
}

module.exports = {
  INTENTOS_MAXIMOS,
  MS_BASE_BACKOFF,
  reintentarConBackoff,
  _setEsperarBackoffForTests,
};
