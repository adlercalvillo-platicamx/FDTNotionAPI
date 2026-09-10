// Cliente HTTP del Apps Script que crea el Meet. Sin googleapis y sin
// calendar-client.service.js: Notion sigue arbitrando la cita; esto solo
// pide una sala e invitaciones 15 min antes, para asistentes Virtual.

const MAX_INTENTOS_MEET = 3;
const ORGANIZADOR_MEET = 'rp@fashiondigitaltalks.com';

function meetVirtualHabilitado() {
  return String(process.env.MEET_VIRTUAL_HABILITADO || '').trim() === 'true';
}

function esAsistenteVirtual(asistente) {
  return String(asistente?.ticketTipo || '').trim() === 'Virtual';
}

/**
 * Calendar solo acepta [a-v0-9] en el event id. Un UUID de Notion en hex
 * (sin guiones) cabe. El mismo citaId siempre produce el mismo id.
 */
function eventIdFromCitaId(citaId) {
  const hex = String(citaId || '').replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return '';
  return hex;
}

function personaMeet(contacto) {
  return {
    nombre: String(contacto?.nombre || '').trim(),
    empresa: String(contacto?.empresa || '').trim(),
    email: String(contacto?.email || '').trim(),
  };
}

async function asegurarMeetVirtual({ cita, asistente, sponsor }) {
  const url = String(process.env.MEET_VIRTUAL_APPS_SCRIPT_URL || '').trim();
  const secret = String(process.env.MEET_VIRTUAL_SECRET || '').trim();
  if (!url) {
    const err = new Error('Falta MEET_VIRTUAL_APPS_SCRIPT_URL');
    err.code = 'MEET_SIN_CONFIG';
    throw err;
  }
  if (!secret) {
    const err = new Error('Falta MEET_VIRTUAL_SECRET');
    err.code = 'MEET_SIN_CONFIG';
    throw err;
  }

  const eventId = eventIdFromCitaId(cita.id);
  if (!eventId) {
    const err = new Error('citaId no es un UUID de Notion');
    err.code = 'INVALID_CITA_ID';
    throw err;
  }

  const asistentePersona = personaMeet(asistente);
  const sponsorPersona = personaMeet(sponsor);
  if (!asistentePersona.email || !sponsorPersona.email) {
    const err = new Error('Falta email de asistente o sponsor para el Meet');
    err.code = 'SIN_EMAIL';
    throw err;
  }

  const titulo =
    cita.titulo ||
    `Cita 1a1 virtual — ${asistentePersona.empresa || asistentePersona.nombre || 'Asistente'} - ${
      sponsorPersona.empresa || sponsorPersona.nombre || 'Sponsor'
    }`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret,
      citaId: cita.id,
      inicio: cita.inicio,
      fin: cita.fin,
      titulo,
      asistente: asistentePersona,
      sponsor: sponsorPersona,
    }),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok || json.ok === false) {
    const err = new Error(`Meet ${res.status}: ${text.slice(0, 400)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return {
    eventId: json.eventId || eventId,
    meetUrl: json.meetUrl || '',
    htmlLink: json.htmlLink || '',
    existing: !!json.existing,
  };
}

module.exports = {
  meetVirtualHabilitado,
  esAsistenteVirtual,
  eventIdFromCitaId,
  personaMeet,
  asegurarMeetVirtual,
  MAX_INTENTOS_MEET,
  ORGANIZADOR_MEET,
};
