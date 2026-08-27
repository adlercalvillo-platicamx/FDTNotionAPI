// tests/modificar-cancelar-cita.manual-test.js
//
// POST /citas/modificar-cita y POST /citas/cancelar-cita
// (booking.service.js → modificarCita / cancelarCita).
//
// Cubre: disponibilidad del horario nuevo, degradación por fallo de
// correo, validación de que la cita sea de quien la pide, las dos reglas
// de coherencia temporal (margen de 5 min al horario destino / check-in
// de la cita original) y el reintento del aviso de cancelación.
//
// Notion, Contactos y Calendar son mocks en memoria. El correo NO: se usa
// el email.service real con un transporter falso, para poder afirmar
// sobre el .ics de verdad (UID estable, SEQUENCE creciente, STATUS).
//
//   node tests/modificar-cancelar-cita.manual-test.js

const assert = require('assert');
const path = require('path');

process.env.CITAS_FECHAS_EVENTO = '2026-10-07,2026-10-08';
process.env.CITAS_DURACION_BLOQUE_MINUTOS = '30';
process.env.CITAS_ZONA_HORARIA_OFFSET = '-06:00';
process.env.CITAS_HORA_INICIO_2026_10_07 = '10:30';
process.env.CITAS_HORA_FIN_2026_10_07 = '19:00';
process.env.CITAS_HORA_INICIO_2026_10_08 = '09:00';
process.env.CITAS_HORA_FIN_2026_10_08 = '18:00';
process.env.NOTION_CITAS_DATA_SOURCE_ID =
  process.env.NOTION_CITAS_DATA_SOURCE_ID || 'fake-para-modificar-cancelar';

const SPONSOR_PLATICA = 'sponsor-platica';
const SPONSOR_OTRO = 'sponsor-otro';
const ASISTENTE_DINUS = 'asistente-dinus';
const ASISTENTE_AJENO = 'asistente-ajeno';
const TELEFONO_DINUS = '5512345678';

const CONTACTOS = {
  [SPONSOR_PLATICA]: {
    id: SPONSOR_PLATICA,
    nombre: 'Sam Sponsor',
    empresa: 'Platica.mx',
    email: 'sponsor@platica.test',
    calendarioGoogleId: 'cal-platica',
  },
  [SPONSOR_OTRO]: {
    id: SPONSOR_OTRO,
    nombre: 'Otro Sponsor',
    empresa: 'Otra Empresa',
    email: 'otro@sponsor.test',
    calendarioGoogleId: 'cal-otro',
  },
  [ASISTENTE_DINUS]: {
    id: ASISTENTE_DINUS,
    nombre: 'Ana Dinus',
    empresa: 'DINUS',
    email: 'ana@dinus.test',
    whatsapp: `+52 ${TELEFONO_DINUS}`,
    rolPuesto: 'Directora',
  },
  [ASISTENTE_AJENO]: {
    id: ASISTENTE_AJENO,
    nombre: 'Beto Ajeno',
    empresa: 'Otra Marca',
    email: 'beto@otramarca.test',
    whatsapp: '+52 5599999999',
  },
};

// ─────────────────────────────────────────────────────────────
// Notion falso: páginas de Citas con el shape real de properties,
// para que datosDeCita() del service se ejercite de verdad.
// ─────────────────────────────────────────────────────────────
const citasPath = path.resolve(__dirname, '../src/services/citas.service.js');
const contactosPath = path.resolve(__dirname, '../src/services/contactos.service.js');
const emailPath = path.resolve(__dirname, '../src/services/email.service.js');
const bookingPath = path.resolve(__dirname, '../src/services/booking.service.js');

for (const p of [citasPath, contactosPath, emailPath, bookingPath]) {
  delete require.cache[p];
}

const paginas = new Map();

function texto(valor) {
  return valor ? { rich_text: [{ plain_text: valor, text: { content: valor } }] } : { rich_text: [] };
}

function crearPagina({
  id,
  estatus = 'Confirmada',
  inicio,
  fin,
  mesa = 'Mesa 1',
  sponsor = SPONSOR_PLATICA,
  asistente = ASISTENTE_DINUS,
  checkIn = false,
  googleEventId = 'evt-google-1',
  titulo = 'Cita — DINUS - Platica.mx',
  notasEnvioEmail = '',
  horarioOriginal = null,
}) {
  const pagina = {
    id,
    properties: {
      Nombre: { title: [{ plain_text: titulo, text: { content: titulo } }] },
      Estatus: { select: { name: estatus } },
      'Fecha y Hora': { date: { start: inicio, end: fin } },
      'Mesa / Ubicacion': texto(mesa),
      'Contacto Match': { relation: [{ id: sponsor }] },
      'Contacto Principal': { relation: [{ id: asistente }] },
      'Check-in Realizado': { checkbox: checkIn },
      'Google Event ID': texto(googleEventId),
      'Notas Envio Email': texto(notasEnvioEmail),
      'Reprogramada Horario Original': { date: horarioOriginal ? { start: horarioOriginal } : null },
      Reprogramada: { checkbox: false },
    },
  };
  paginas.set(id, pagina);
  return pagina;
}

function estatusDe(id) {
  return paginas.get(id).properties.Estatus.select.name;
}
function inicioDe(id) {
  return paginas.get(id).properties['Fecha y Hora'].date.start;
}
function notasEnvioDe(id) {
  return paginas.get(id).properties['Notas Envio Email'].rich_text?.[0]?.plain_text || '';
}

const citasReal = require(citasPath);

function esCitaReal(pagina) {
  return citasReal.ESTATUS_CITA_REAL.includes(pagina.properties.Estatus.select.name);
}

Object.assign(citasReal, {
  async obtenerCitaPorId(id) {
    const pagina = paginas.get(id);
    if (!pagina) {
      const err = new Error(`No existe la página ${id}`);
      err.status = 404;
      throw err;
    }
    return pagina;
  },
  async listarCitasRealesPorAsistente(asistentePageId) {
    return [...paginas.values()]
      .filter((p) => p.properties['Contacto Principal'].relation[0].id === asistentePageId)
      .filter(esCitaReal)
      .map((p) => {
        const datos = citasReal.datosDeCita(p);
        const sponsor = CONTACTOS[datos.sponsorPageId] || {};
        return {
          ...datos,
          sponsorEmpresa: sponsor.empresa || null,
          sponsorNombre: sponsor.nombre || null,
          sponsorCalendarioId: sponsor.calendarioGoogleId || null,
        };
      });
  },
  async sponsorOcupadoEnBloque({ sponsorPageId, inicio, exceptPageId }) {
    return [...paginas.values()].some(
      (p) =>
        p.id !== exceptPageId &&
        esCitaReal(p) &&
        p.properties['Contacto Match'].relation[0].id === sponsorPageId &&
        p.properties['Fecha y Hora'].date.start === inicio
    );
  },
  async contarCitasEnBloque({ inicio, exceptPageId }) {
    return [...paginas.values()].filter(
      (p) => p.id !== exceptPageId && esCitaReal(p) && p.properties['Fecha y Hora'].date.start === inicio
    ).length;
  },
  async reprogramarCita({ notionPageId, inicio, fin, mesa, horarioOriginal, horarioOriginalYaGuardado }) {
    const pagina = paginas.get(notionPageId);
    pagina.properties.Estatus = { select: { name: 'Confirmada' } };
    pagina.properties['Fecha y Hora'] = { date: { start: inicio, end: fin } };
    pagina.properties['Mesa / Ubicacion'] = texto(`Mesa ${mesa}`);
    pagina.properties.Reprogramada = { checkbox: true };
    pagina.properties['Notas Envio Email'] = texto('');
    if (horarioOriginal && !horarioOriginalYaGuardado) {
      pagina.properties['Reprogramada Horario Original'] = { date: { start: horarioOriginal } };
    }
    return pagina;
  },
  async marcarCitaCancelada({ notionPageId }) {
    const pagina = paginas.get(notionPageId);
    pagina.properties.Estatus = { select: { name: 'Cancelada' } };
    pagina.properties['Notas Envio Email'] = texto('');
    return pagina;
  },
  async marcarCitaConfirmadaSinNotificar({ notionPageId, motivoCategoria, motivoDetalle }) {
    const pagina = paginas.get(notionPageId);
    pagina.properties.Estatus = { select: { name: 'Confirmada sin notificar' } };
    pagina.properties['Notas Envio Email'] = texto(`[${motivoCategoria}] ${motivoDetalle}`);
    return pagina;
  },
  async marcarCancelacionSinNotificar({ notionPageId, motivoCategoria, motivoDetalle }) {
    const pagina = paginas.get(notionPageId);
    pagina.properties.Estatus = { select: { name: 'Cancelada' } };
    pagina.properties['Notas Envio Email'] = texto(
      `${citasReal.MARCA_CANCELACION_PENDIENTE} [${motivoCategoria}] ${motivoDetalle}`
    );
    return pagina;
  },
  async marcarCancelacionNotificada(notionPageId) {
    const pagina = paginas.get(notionPageId);
    pagina.properties['Notas Envio Email'] = texto('');
    return pagina;
  },
  async confirmarNotificacionEnviada(notionPageId) {
    const pagina = paginas.get(notionPageId);
    pagina.properties.Estatus = { select: { name: 'Confirmada' } };
    pagina.properties['Notas Envio Email'] = texto('');
    return pagina;
  },
});

require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    async obtenerContacto(pageId) {
      const contacto = CONTACTOS[pageId];
      if (!contacto) {
        const err = new Error(`Contacto ${pageId} no existe`);
        err.status = 404;
        throw err;
      }
      return contacto;
    },
    async buscarAsistentePorWhatsApp(telefono) {
      const soloDigitos = String(telefono).replace(/\D/g, '').slice(-10);
      return (
        Object.values(CONTACTOS).find(
          (c) => c.whatsapp && c.whatsapp.replace(/\D/g, '').slice(-10) === soloDigitos
        ) || null
      );
    },
  },
};

const emailService = require(emailPath);
const correos = [];
let smtpFalla = false;
emailService._setTransporterForTests({
  async sendMail(mensaje) {
    if (smtpFalla) {
      const err = new Error('550 5.1.1 buzón inexistente');
      err.responseCode = 550;
      throw err;
    }
    correos.push(mensaje);
    return { messageId: `fake-${correos.length}` };
  },
});

const { modificarCita, cancelarCita, reintentarNotificacion, BookingError } = require(bookingPath);

function campoIcs(contenido, campo) {
  const match = String(contenido).match(new RegExp(`^${campo}:(.*)$`, 'm'));
  return match ? match[1].trim() : null;
}

function ultimoIcs() {
  return correos[correos.length - 1].icalEvent.content;
}

let fallos = 0;
async function ok(nombre, fn) {
  correos.length = 0;
  try {
    await fn();
    console.log(`  ✅ ${nombre}`);
  } catch (err) {
    fallos += 1;
    console.log(`  ❌ ${nombre}`);
    console.log(`     ${err.stack || err.message}`);
  }
}

const AHORA_ANTES_DEL_EVENTO = '2026-10-01T09:00:00-06:00';

(async () => {
  console.log('\n=== Modificar: caso normal ===');
  await ok('Horario nuevo disponible → Notion movido y .ics con mismo UID y SEQUENCE mayor', async () => {
    paginas.clear();
    crearPagina({
      id: 'cita-1',
      inicio: '2026-10-07T10:30:00-06:00',
      fin: '2026-10-07T11:00:00-06:00',
    });

    const r = await modificarCita({
      citaId: 'cita-1',
      nuevaFechaHora: '2026-10-07T12:00:00-06:00',
      ahora: AHORA_ANTES_DEL_EVENTO,
    });

    assert.strictEqual(r.estado, 'Confirmada');
    assert.strictEqual(r.inicio, '2026-10-07T12:00:00-06:00');
    assert.strictEqual(r.fin, '2026-10-07T12:30:00-06:00');
    assert.strictEqual(r.horario_anterior, '2026-10-07T10:30:00-06:00');
    assert.strictEqual(inicioDe('cita-1'), '2026-10-07T12:00:00-06:00');
    assert.strictEqual(paginas.get('cita-1').properties.Reprogramada.checkbox, true);
    assert.strictEqual(
      paginas.get('cita-1').properties['Reprogramada Horario Original'].date.start,
      '2026-10-07T10:30:00-06:00'
    );

    assert.strictEqual(correos.length, 2, 'sponsor + asistente');
    const ics = ultimoIcs();
    assert.strictEqual(campoIcs(ics, 'UID'), 'cita-1@fashiondigitaltalks.com');
    assert.strictEqual(campoIcs(ics, 'STATUS'), 'CONFIRMED');
    assert.ok(Number(campoIcs(ics, 'SEQUENCE')) > 0, 'SEQUENCE debe superar el 0 del envío original');
    assert.strictEqual(campoIcs(ics, 'DTSTART'), '20261007T180000Z', '12:00 -06:00 = 18:00Z');
    assert.ok(correos[0].subject.startsWith('Cambio de horario —'));
  });

  await ok('Dos modificaciones seguidas → SEQUENCE estrictamente creciente', async () => {
    paginas.clear();
    crearPagina({
      id: 'cita-seq',
      inicio: '2026-10-07T10:30:00-06:00',
      fin: '2026-10-07T11:00:00-06:00',
    });
    await modificarCita({
      citaId: 'cita-seq',
      nuevaFechaHora: '2026-10-07T12:00:00-06:00',
      ahora: AHORA_ANTES_DEL_EVENTO,
    });
    const primera = Number(campoIcs(ultimoIcs(), 'SEQUENCE'));
    await modificarCita({
      citaId: 'cita-seq',
      nuevaFechaHora: '2026-10-07T13:00:00-06:00',
      ahora: AHORA_ANTES_DEL_EVENTO,
    });
    const segunda = Number(campoIcs(ultimoIcs(), 'SEQUENCE'));
    assert.ok(segunda > primera, `esperaba ${segunda} > ${primera}`);
  });

  await ok('Segunda reprogramación conserva el horario original de la primera', async () => {
    assert.strictEqual(
      paginas.get('cita-seq').properties['Reprogramada Horario Original'].date.start,
      '2026-10-07T10:30:00-06:00'
    );
  });

  console.log('\n=== Modificar: horario nuevo no disponible ===');
  await ok('Sponsor ya ocupado en el horario nuevo → no toca Notion', async () => {
    paginas.clear();
    crearPagina({ id: 'cita-a', inicio: '2026-10-07T10:30:00-06:00', fin: '2026-10-07T11:00:00-06:00' });
    crearPagina({
      id: 'cita-ocupa',
      inicio: '2026-10-07T12:00:00-06:00',
      fin: '2026-10-07T12:30:00-06:00',
      asistente: ASISTENTE_AJENO,
    });

    await assert.rejects(
      () =>
        modificarCita({
          citaId: 'cita-a',
          nuevaFechaHora: '2026-10-07T12:00:00-06:00',
          ahora: AHORA_ANTES_DEL_EVENTO,
        }),
      (e) => e instanceof BookingError && e.code === 'SPONSOR_YA_OCUPADO'
    );
    assert.strictEqual(inicioDe('cita-a'), '2026-10-07T10:30:00-06:00', 'la cita no se movió');
    assert.strictEqual(correos.length, 0, 'no se manda correo si no hubo cambio');
  });

  await ok('11 mesas llenas en el horario nuevo → CAPACIDAD_MESAS_LLENA, sin tocar Notion', async () => {
    paginas.clear();
    crearPagina({ id: 'cita-mover', inicio: '2026-10-07T10:30:00-06:00', fin: '2026-10-07T11:00:00-06:00' });
    for (let i = 1; i <= 11; i += 1) {
      crearPagina({
        id: `llena-${i}`,
        inicio: '2026-10-07T12:00:00-06:00',
        fin: '2026-10-07T12:30:00-06:00',
        sponsor: `sponsor-llena-${i}`,
        asistente: `asistente-llena-${i}`,
      });
    }
    await assert.rejects(
      () =>
        modificarCita({
          citaId: 'cita-mover',
          nuevaFechaHora: '2026-10-07T12:00:00-06:00',
          ahora: AHORA_ANTES_DEL_EVENTO,
        }),
      (e) => e instanceof BookingError && e.code === 'CAPACIDAD_MESAS_LLENA'
    );
    assert.strictEqual(inicioDe('cita-mover'), '2026-10-07T10:30:00-06:00');
  });

  await ok('Horario nuevo fuera de la grilla del evento → INVALID_INPUT', async () => {
    paginas.clear();
    crearPagina({ id: 'cita-grid', inicio: '2026-10-07T10:30:00-06:00', fin: '2026-10-07T11:00:00-06:00' });
    await assert.rejects(
      () =>
        modificarCita({
          citaId: 'cita-grid',
          nuevaFechaHora: '2026-10-07T12:07:00-06:00',
          ahora: AHORA_ANTES_DEL_EVENTO,
        }),
      (e) => e instanceof BookingError && e.code === 'INVALID_INPUT'
    );
    assert.strictEqual(inicioDe('cita-grid'), '2026-10-07T10:30:00-06:00');
  });

  console.log('\n=== Modificar: falla el correo después de cambiar Notion ===');
  await ok('Cita queda con el horario nuevo, marcada para reintento', async () => {
    paginas.clear();
    crearPagina({ id: 'cita-mail', inicio: '2026-10-07T10:30:00-06:00', fin: '2026-10-07T11:00:00-06:00' });
    smtpFalla = true;
    const r = await modificarCita({
      citaId: 'cita-mail',
      nuevaFechaHora: '2026-10-07T12:00:00-06:00',
      ahora: AHORA_ANTES_DEL_EVENTO,
    });
    smtpFalla = false;

    assert.strictEqual(r.estado, 'Confirmada sin notificar');
    assert.strictEqual(r.inicio, '2026-10-07T12:00:00-06:00');
    assert.strictEqual(inicioDe('cita-mail'), '2026-10-07T12:00:00-06:00', 'el cambio no se pierde');
    assert.strictEqual(estatusDe('cita-mail'), 'Confirmada sin notificar');
    assert.ok(notasEnvioDe('cita-mail').includes('Modificación de horario sin avisar'));
    assert.strictEqual(r.notificacion_error.categoria, 'CORREO_INVALIDO');
  });

  await ok('El reintento posterior manda el horario NUEVO, no el viejo', async () => {
    const r = await reintentarNotificacion('cita-mail');
    assert.strictEqual(r.tipo, 'confirmacion');
    assert.strictEqual(estatusDe('cita-mail'), 'Confirmada');
    assert.strictEqual(campoIcs(ultimoIcs(), 'DTSTART'), '20261007T180000Z');
  });

  console.log('\n=== Cancelar ===');
  await ok('Caso exitoso → Cancelada, .ics CANCELLED y bloque libre', async () => {
    paginas.clear();
    crearPagina({ id: 'cita-cancel', inicio: '2026-10-07T10:30:00-06:00', fin: '2026-10-07T11:00:00-06:00' });

    const r = await cancelarCita({ citaId: 'cita-cancel' });
    assert.strictEqual(r.estado, 'Cancelada');
    assert.strictEqual(r.ya_estaba_cancelada, false);
    assert.strictEqual(estatusDe('cita-cancel'), 'Cancelada');

    const ics = ultimoIcs();
    assert.strictEqual(campoIcs(ics, 'UID'), 'cita-cancel@fashiondigitaltalks.com');
    assert.strictEqual(campoIcs(ics, 'STATUS'), 'CANCELLED');
    assert.strictEqual(campoIcs(ics, 'METHOD'), 'CANCEL');
    assert.strictEqual(correos[0].icalEvent.method, 'CANCEL');
    assert.ok(correos[0].subject.startsWith('Cita cancelada —'));

    const enBloque = await citasReal.contarCitasEnBloque({ inicio: '2026-10-07T10:30:00-06:00' });
    assert.strictEqual(enBloque, 0, 'el horario queda libre para otros');
  });

  await ok('Falla el correo → sigue Cancelada (no vuelve a ocupar mesa) y queda marcada', async () => {
    paginas.clear();
    crearPagina({ id: 'cita-cancel-mail', inicio: '2026-10-07T10:30:00-06:00', fin: '2026-10-07T11:00:00-06:00' });
    smtpFalla = true;
    const r = await cancelarCita({ citaId: 'cita-cancel-mail' });
    smtpFalla = false;

    assert.strictEqual(r.aviso_pendiente, true);
    assert.strictEqual(estatusDe('cita-cancel-mail'), 'Cancelada');
    assert.ok(notasEnvioDe('cita-cancel-mail').startsWith(citasReal.MARCA_CANCELACION_PENDIENTE));
    const enBloque = await citasReal.contarCitasEnBloque({ inicio: '2026-10-07T10:30:00-06:00' });
    assert.strictEqual(enBloque, 0, 'una cancelación sin avisar NO puede volver a ocupar mesa');
  });

  await ok('Reintento de una cancelación pendiente reenvía el .ics de baja', async () => {
    const r = await reintentarNotificacion('cita-cancel-mail');
    assert.strictEqual(r.tipo, 'cancelacion');
    assert.strictEqual(r.estado, 'Cancelada');
    assert.strictEqual(estatusDe('cita-cancel-mail'), 'Cancelada', 'nunca vuelve a Confirmada');
    assert.strictEqual(notasEnvioDe('cita-cancel-mail'), '');
    assert.strictEqual(campoIcs(ultimoIcs(), 'STATUS'), 'CANCELLED');
  });

  await ok('Cancelar dos veces es idempotente', async () => {
    const r = await cancelarCita({ citaId: 'cita-cancel-mail' });
    assert.strictEqual(r.ya_estaba_cancelada, true);
    assert.strictEqual(correos.length, 0);
  });

  console.log('\n=== Seguridad: la cita tiene que ser de quien la pide ===');
  await ok('DINUS manda su teléfono + el citaId de otro asistente → RECHAZADO', async () => {
    paginas.clear();
    crearPagina({ id: 'cita-dinus', inicio: '2026-10-07T10:30:00-06:00', fin: '2026-10-07T11:00:00-06:00' });
    crearPagina({
      id: 'cita-ajena',
      inicio: '2026-10-07T13:00:00-06:00',
      fin: '2026-10-07T13:30:00-06:00',
      sponsor: SPONSOR_OTRO,
      asistente: ASISTENTE_AJENO,
    });

    await assert.rejects(
      () =>
        modificarCita({
          telefono: TELEFONO_DINUS,
          citaId: 'cita-ajena',
          nuevaFechaHora: '2026-10-07T15:00:00-06:00',
          ahora: AHORA_ANTES_DEL_EVENTO,
        }),
      (e) => e instanceof BookingError && e.code === 'CITA_NO_PERTENECE'
    );
    await assert.rejects(
      () => cancelarCita({ telefono: TELEFONO_DINUS, citaId: 'cita-ajena' }),
      (e) => e instanceof BookingError && e.code === 'CITA_NO_PERTENECE'
    );
    assert.strictEqual(inicioDe('cita-ajena'), '2026-10-07T13:00:00-06:00');
    assert.strictEqual(estatusDe('cita-ajena'), 'Confirmada');
  });

  await ok('Laura/Liz con citaId directo (sin teléfono) sí puede sobre cualquier cita', async () => {
    const r = await modificarCita({
      citaId: 'cita-ajena',
      nuevaFechaHora: '2026-10-07T15:00:00-06:00',
      ahora: AHORA_ANTES_DEL_EVENTO,
    });
    assert.strictEqual(r.estado, 'Confirmada');
    assert.strictEqual(inicioDe('cita-ajena'), '2026-10-07T15:00:00-06:00');
  });

  await ok('Teléfono + su propia cita → permitido', async () => {
    const r = await modificarCita({
      telefono: TELEFONO_DINUS,
      citaId: 'cita-dinus',
      nuevaFechaHora: '2026-10-07T16:00:00-06:00',
      ahora: AHORA_ANTES_DEL_EVENTO,
    });
    assert.strictEqual(inicioDe('cita-dinus'), '2026-10-07T16:00:00-06:00');
    assert.strictEqual(r.horario_anterior, '2026-10-07T10:30:00-06:00');
  });

  await ok('Teléfono de alguien sin citas reales → SIN_CITAS_ACTIVAS', async () => {
    paginas.clear();
    await assert.rejects(
      () => cancelarCita({ telefono: TELEFONO_DINUS }),
      (e) => e instanceof BookingError && e.code === 'SIN_CITAS_ACTIVAS'
    );
  });

  await ok('Teléfono desconocido → ASISTENTE_NO_ENCONTRADO', async () => {
    await assert.rejects(
      () => cancelarCita({ telefono: '5500000000' }),
      (e) => e instanceof BookingError && e.code === 'ASISTENTE_NO_ENCONTRADO'
    );
  });

  console.log('\n=== Identificación por teléfono sin citaId ===');
  await ok('Una sola cita activa → se resuelve sin llamada extra', async () => {
    paginas.clear();
    crearPagina({ id: 'cita-unica', inicio: '2026-10-07T10:30:00-06:00', fin: '2026-10-07T11:00:00-06:00' });
    const r = await modificarCita({
      telefono: TELEFONO_DINUS,
      nuevaFechaHora: '2026-10-07T11:30:00-06:00',
      ahora: AHORA_ANTES_DEL_EVENTO,
    });
    assert.strictEqual(r.notion_page_id, 'cita-unica');
  });

  await ok('Varias citas activas → VARIAS_CITAS_ACTIVAS con la lista para elegir', async () => {
    paginas.clear();
    crearPagina({ id: 'cita-platica', inicio: '2026-10-07T10:30:00-06:00', fin: '2026-10-07T11:00:00-06:00' });
    crearPagina({
      id: 'cita-otra',
      inicio: '2026-10-07T13:00:00-06:00',
      fin: '2026-10-07T13:30:00-06:00',
      sponsor: SPONSOR_OTRO,
    });

    await assert.rejects(
      () => cancelarCita({ telefono: TELEFONO_DINUS }),
      (e) => {
        assert.ok(e instanceof BookingError);
        assert.strictEqual(e.code, 'VARIAS_CITAS_ACTIVAS');
        assert.strictEqual(e.detalle.citas.length, 2);
        assert.ok(e.detalle.citas.every((c) => c.citaId && c.sponsor_empresa && c.inicio));
        return true;
      }
    );
    assert.strictEqual(estatusDe('cita-platica'), 'Confirmada');
    assert.strictEqual(estatusDe('cita-otra'), 'Confirmada');
  });

  await ok('sponsorEmpresa desambigua ("la de Platica")', async () => {
    const r = await cancelarCita({ telefono: TELEFONO_DINUS, sponsorEmpresa: 'platica' });
    assert.strictEqual(r.notion_page_id, 'cita-platica');
    assert.strictEqual(estatusDe('cita-platica'), 'Cancelada');
    assert.strictEqual(estatusDe('cita-otra'), 'Confirmada', 'la otra cita no se toca');
  });

  console.log('\n=== Regla 1: el horario destino no puede estar en el pasado ===');
  await ok('Son las 11:06 y se pide mover a las 11:00 (6 min) → RECHAZADO', async () => {
    paginas.clear();
    crearPagina({ id: 'cita-margen', inicio: '2026-10-07T14:00:00-06:00', fin: '2026-10-07T14:30:00-06:00' });
    await assert.rejects(
      () =>
        modificarCita({
          citaId: 'cita-margen',
          nuevaFechaHora: '2026-10-07T11:00:00-06:00',
          ahora: '2026-10-07T11:06:00-06:00',
        }),
      (e) => e instanceof BookingError && e.code === 'HORARIO_EN_PASADO'
    );
    assert.strictEqual(inicioDe('cita-margen'), '2026-10-07T14:00:00-06:00');
  });

  await ok('Son las 11:04 y se pide mover a las 11:00 (4 min) → PERMITIDO', async () => {
    const r = await modificarCita({
      citaId: 'cita-margen',
      nuevaFechaHora: '2026-10-07T11:00:00-06:00',
      ahora: '2026-10-07T11:04:00-06:00',
    });
    assert.strictEqual(r.inicio, '2026-10-07T11:00:00-06:00');
    assert.strictEqual(inicioDe('cita-margen'), '2026-10-07T11:00:00-06:00');
  });

  await ok('Horario claramente futuro → sin cambios de comportamiento', async () => {
    const r = await modificarCita({
      citaId: 'cita-margen',
      nuevaFechaHora: '2026-10-07T17:00:00-06:00',
      ahora: '2026-10-07T11:04:00-06:00',
    });
    assert.strictEqual(r.inicio, '2026-10-07T17:00:00-06:00');
  });

  console.log('\n=== Regla 2: cita original ya pasada + check-in ===');
  await ok('Cita pasada SIN check-in → se puede recuperar a un horario futuro', async () => {
    paginas.clear();
    crearPagina({
      id: 'cita-noshow',
      inicio: '2026-10-07T10:30:00-06:00',
      fin: '2026-10-07T11:00:00-06:00',
      checkIn: false,
    });
    const r = await modificarCita({
      citaId: 'cita-noshow',
      nuevaFechaHora: '2026-10-07T16:00:00-06:00',
      ahora: '2026-10-07T13:00:00-06:00',
    });
    assert.strictEqual(r.inicio, '2026-10-07T16:00:00-06:00');
  });

  await ok('Cita pasada CON check-in → RECHAZADO, ya ocurrió de verdad', async () => {
    paginas.clear();
    crearPagina({
      id: 'cita-asistio',
      inicio: '2026-10-07T10:30:00-06:00',
      fin: '2026-10-07T11:00:00-06:00',
      checkIn: true,
    });
    await assert.rejects(
      () =>
        modificarCita({
          citaId: 'cita-asistio',
          nuevaFechaHora: '2026-10-07T16:00:00-06:00',
          ahora: '2026-10-07T13:00:00-06:00',
        }),
      (e) => e instanceof BookingError && e.code === 'CITA_YA_OCURRIO'
    );
    assert.strictEqual(inicioDe('cita-asistio'), '2026-10-07T10:30:00-06:00');
  });

  await ok('Cita futura con check-in marcado por error → el check-in no interfiere', async () => {
    paginas.clear();
    crearPagina({
      id: 'cita-futura-checkin',
      inicio: '2026-10-07T16:00:00-06:00',
      fin: '2026-10-07T16:30:00-06:00',
      checkIn: true,
    });
    const r = await modificarCita({
      citaId: 'cita-futura-checkin',
      nuevaFechaHora: '2026-10-07T17:00:00-06:00',
      ahora: '2026-10-07T13:00:00-06:00',
    });
    assert.strictEqual(r.inicio, '2026-10-07T17:00:00-06:00');
  });

  console.log('\n=== Estatus que no se pueden tocar ===');
  await ok('Cita en Sugerido → ESTADO_INVALIDO en ambos endpoints', async () => {
    paginas.clear();
    crearPagina({
      id: 'cita-sugerida',
      estatus: 'Sugerido',
      inicio: '2026-10-07T10:30:00-06:00',
      fin: '2026-10-07T11:00:00-06:00',
    });
    await assert.rejects(
      () =>
        modificarCita({
          citaId: 'cita-sugerida',
          nuevaFechaHora: '2026-10-07T16:00:00-06:00',
          ahora: AHORA_ANTES_DEL_EVENTO,
        }),
      (e) => e instanceof BookingError && e.code === 'ESTADO_INVALIDO'
    );
    await assert.rejects(
      () => cancelarCita({ citaId: 'cita-sugerida' }),
      (e) => e instanceof BookingError && e.code === 'ESTADO_INVALIDO'
    );
  });

  await ok('citaId inexistente → CITA_NO_ENCONTRADA', async () => {
    await assert.rejects(
      () => cancelarCita({ citaId: 'cita-que-no-existe' }),
      (e) => e instanceof BookingError && e.code === 'CITA_NO_ENCONTRADA'
    );
  });

  console.log(`\n=== Resultado: ${fallos === 0 ? 'TODOS PASARON' : `${fallos} FALLARON`} ===\n`);
  process.exit(fallos === 0 ? 0 : 1);
})();
