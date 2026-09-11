/**
 * Web App: crea (o reusa) un evento de Calendar con Google Meet.
 * Organizador:  rp@fashiondigitaltalks.com
 *
 * Desplegar como esa cuenta. Calendar avanzado + conferenceDataVersion 1.
 * Secret en Script Properties: MEET_VIRTUAL_SECRET
 *
 * Idempotencia: el backend manda en `citaId` una clave hexadecimal de
 * fila + horario. Un reintento del mismo horario no duplica; una reagenda
 * manda otra clave y crea otra sala.
 */

var CALENDAR_ID = 'primary';
var TIME_ZONE = 'America/Mexico_City';

function doPost(e) {
  try {
    var body = parseBody_(e);
    var esperado = PropertiesService.getScriptProperties().getProperty('MEET_VIRTUAL_SECRET');
    if (!esperado || body.secret !== esperado) {
      return json_({ ok: false, error: 'UNAUTHORIZED' }, 401);
    }

    var citaId = String(body.citaId || '').trim();
    var eventId = eventIdFromCitaId(citaId);
    if (!eventId) {
      return json_({ ok: false, error: 'INVALID_CITA_ID' }, 400);
    }
    if (!body.inicio || !body.fin) {
      return json_({ ok: false, error: 'FALTAN_FECHAS' }, 400);
    }

    var asistente = body.asistente || {};
    var sponsor = body.sponsor || {};
    if (!asistente.email || !sponsor.email) {
      return json_({ ok: false, error: 'FALTAN_EMAILS' }, 400);
    }

    var existente = getEvento_(eventId);
    if (existente) {
      return json_(respuestaEvento_(existente, true));
    }

    var recurso = {
      id: eventId,
      summary: String(body.titulo || tituloPorDefecto_(asistente, sponsor)),
      description:
        'Cita 1a1 virtual Fashion Digital Talks.\n' +
        'Organiza FDT; el equipo no entra a la reunión.',
      start: { dateTime: body.inicio, timeZone: TIME_ZONE },
      end: { dateTime: body.fin, timeZone: TIME_ZONE },
      attendees: [
        attendee_(asistente),
        attendee_(sponsor),
      ],
      conferenceData: {
        createRequest: {
          requestId: eventId,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      guestsCanInviteOthers: false,
      guestsCanModify: false,
    };

    var creado;
    try {
      creado = Calendar.Events.insert(recurso, CALENDAR_ID, {
        conferenceDataVersion: 1,
        sendUpdates: 'all',
      });
    } catch (err) {
      if (esConflicto_(err)) {
        existente = getEvento_(eventId);
        if (existente) return json_(respuestaEvento_(existente, true));
      }
      throw err;
    }

    return json_(respuestaEvento_(creado, false));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) }, 500);
  }
}

function eventIdFromCitaId(citaId) {
  var hex = String(citaId || '').replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return '';
  return hex;
}

function getEvento_(eventId) {
  try {
    return Calendar.Events.get(CALENDAR_ID, eventId);
  } catch (err) {
    if (esNoEncontrado_(err)) return null;
    throw err;
  }
}

function attendee_(persona) {
  var display = [persona.nombre, persona.empresa].filter(Boolean).join(' · ');
  var att = { email: String(persona.email).trim() };
  if (display) att.displayName = display;
  return att;
}

function tituloPorDefecto_(asistente, sponsor) {
  var a = asistente.empresa || asistente.nombre || 'Asistente';
  var s = sponsor.empresa || sponsor.nombre || 'Sponsor';
  return 'Cita 1a1 virtual — ' + a + ' - ' + s;
}

function meetUrl_(evento) {
  if (evento && evento.hangoutLink) return evento.hangoutLink;
  var ep = evento && evento.conferenceData && evento.conferenceData.entryPoints;
  if (!ep) return '';
  for (var i = 0; i < ep.length; i++) {
    if (ep[i].entryPointType === 'video' && ep[i].uri) return ep[i].uri;
  }
  return '';
}

function respuestaEvento_(evento, existing) {
  return {
    ok: true,
    eventId: evento.id,
    meetUrl: meetUrl_(evento),
    htmlLink: evento.htmlLink || '',
    existing: !!existing,
  };
}

function parseBody_(e) {
  var raw = e && e.postData && e.postData.contents;
  if (!raw) return {};
  return JSON.parse(raw);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function esConflicto_(err) {
  var msg = String(err);
  return msg.indexOf('409') !== -1 || /already exists/i.test(msg);
}

function esNoEncontrado_(err) {
  var msg = String(err);
  return msg.indexOf('404') !== -1 || /Not Found/i.test(msg);
}
