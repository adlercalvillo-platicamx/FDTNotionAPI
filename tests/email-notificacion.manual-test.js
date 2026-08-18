// tests/email-notificacion.manual-test.js
//
// Casos 1–8 (+ 5b, SIN_DESTINATARIOS, CONTACTO_NO_RESUELTO, sin huérfana,
// existeCitaActivaEntre) del diseño email/.ics 17-ago — con mocks.
//
//   node tests/email-notificacion.manual-test.js

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
  process.env.NOTION_CITAS_DATA_SOURCE_ID || 'fake-for-email-test';
process.env.EMAIL_MAX_INTENTOS = '5';

const INICIO = '2026-10-07T12:00:00-06:00';
const FIN = '2026-10-07T12:30:00-06:00';

const citasPath = path.resolve(__dirname, '../src/services/citas.service.js');
const calendarPath = path.resolve(__dirname, '../src/services/calendar-client.service.js');
const contactosPath = path.resolve(__dirname, '../src/services/contactos.service.js');
const emailPath = path.resolve(__dirname, '../src/services/email.service.js');
const bookingPath = path.resolve(__dirname, '../src/services/booking.service.js');
const jobPath = path.resolve(__dirname, '../src/jobs/reintentar-notificaciones.job.js');

function limpiarCache() {
  for (const p of [citasPath, calendarPath, contactosPath, emailPath, bookingPath, jobPath]) {
    delete require.cache[p];
  }
}

class EmailError extends Error {
  constructor(categoria, message) {
    super(message);
    this.name = 'EmailError';
    this.categoria = categoria;
  }
}

function crearHarness({
  emailsPorId = {},
  emailFailCategoria = null,
  calendarCreateCalls = [],
  emailCalls = [],
} = {}) {
  limpiarCache();

  const citasReal = require(citasPath);
  /** @type {Map<string, any>} */
  const porId = new Map();
  /** @type {Map<string, string>} */
  const porRequestId = new Map();
  let seq = 0;

  const mockCitas = {
    async buscarPorRequestId(requestId) {
      const id = porRequestId.get(requestId);
      if (!id) return null;
      return toPage(porId.get(id));
    },
    async sponsorOcupadoEnBloque({ sponsorPageId, inicio }) {
      for (const page of porId.values()) {
        if (
          ['Confirmada', 'Confirmada sin notificar'].includes(page.estatus) &&
          page.sponsor === sponsorPageId &&
          page.inicio === inicio
        ) {
          return true;
        }
      }
      return false;
    },
    async contarCitasEnBloque({ inicio }) {
      let n = 0;
      for (const page of porId.values()) {
        if (['Confirmada', 'Confirmada sin notificar'].includes(page.estatus) && page.inicio === inicio) {
          n += 1;
        }
      }
      return n;
    },
    async crearCitaPendiente({ requestId, sponsorPageId, asistentePageId, inicio, fin, mesa }) {
      seq += 1;
      const id = `cita-${seq}`;
      const page = {
        id,
        sponsor: sponsorPageId,
        asistente: asistentePageId,
        inicio,
        fin,
        estatus: 'Pendiente Calendar',
        mesa: mesa ?? null,
        requestId,
        intentos: 0,
        notasEnvio: null,
        eventoId: null,
      };
      porId.set(id, page);
      porRequestId.set(requestId, id);
      return { id };
    },
    async confirmarCita({ notionPageId, eventoId }) {
      const page = porId.get(notionPageId);
      page.estatus = 'Confirmada';
      page.eventoId = eventoId;
      return { id: notionPageId };
    },
    async marcarCitaFallida({ notionPageId, motivo }) {
      const page = porId.get(notionPageId);
      if (page) {
        page.estatus = 'Fallida';
        page.motivoFallida = motivo;
      }
    },
    async marcarCitaConfirmadaSinNotificar({ notionPageId, motivoCategoria, motivoDetalle, intentosPrevios }) {
      const page = porId.get(notionPageId);
      page.estatus = 'Confirmada sin notificar';
      page.notasEnvio = `[${motivoCategoria}] ${motivoDetalle}`;
      page.intentos = (intentosPrevios || 0) + 1;
      return { id: notionPageId };
    },
    async confirmarNotificacionEnviada(notionPageId) {
      const page = porId.get(notionPageId);
      page.estatus = 'Confirmada';
      page.notasEnvio = null;
      page.intentos = 0;
      return { id: notionPageId };
    },
    async obtenerCitaPorId(notionPageId) {
      const page = porId.get(notionPageId);
      if (!page) throw new Error(`cita no existe: ${notionPageId}`);
      return toPage(page);
    },
    async buscarCitasSinNotificarParaReintentar(maxIntentos) {
      return [...porId.values()]
        .filter((p) => p.estatus === 'Confirmada sin notificar' && (p.intentos || 0) < maxIntentos)
        .map((p) => toPage(p));
    },
    async existeCitaActivaEntre({ sponsorPageId, asistentePageId }) {
      for (const page of porId.values()) {
        if (
          page.sponsor === sponsorPageId &&
          page.asistente === asistentePageId &&
          ['Sugerido', 'Aprobado', 'Confirmada', 'Confirmada sin notificar', 'Pendiente Calendar'].includes(
            page.estatus
          )
        ) {
          return true;
        }
      }
      return false;
    },
  };

  function toPage(page) {
    return {
      id: page.id,
      properties: {
        Estatus: { select: { name: page.estatus } },
        'Intentos Envio Email': { number: page.intentos || 0 },
        'Notas Envio Email': page.notasEnvio
          ? { rich_text: [{ plain_text: page.notasEnvio, text: { content: page.notasEnvio } }] }
          : { rich_text: [] },
        'Contacto Match': { relation: page.sponsor ? [{ id: page.sponsor }] : [] },
        'Contacto Principal': { relation: page.asistente ? [{ id: page.asistente }] : [] },
        'Fecha y Hora': { date: { start: page.inicio, end: page.fin } },
        'Mesa / Ubicacion': page.mesa
          ? { rich_text: [{ plain_text: `Mesa ${page.mesa}`, text: { content: `Mesa ${page.mesa}` } }] }
          : { rich_text: [] },
        Nombre: { title: [{ plain_text: `Cita ${page.id}`, text: { content: `Cita ${page.id}` } }] },
        'Idempotency Key': {
          rich_text: [{ plain_text: page.requestId || '', text: { content: page.requestId || '' } }],
        },
      },
    };
  }

  Object.assign(citasReal, mockCitas);

  require.cache[calendarPath] = {
    id: calendarPath,
    filename: calendarPath,
    loaded: true,
    exports: {
      async createEvent(args) {
        calendarCreateCalls.push(args);
        return { evento_id: `evt-${calendarCreateCalls.length}` };
      },
      async cancelEvent() {
        return { ok: true };
      },
    },
  };

  require.cache[contactosPath] = {
    id: contactosPath,
    filename: contactosPath,
    loaded: true,
    exports: {
      async obtenerContacto(pageId) {
        if (!pageId) throw new Error('obtenerContacto(undefined) — no debería llegar aquí');
        const email = emailsPorId[pageId];
        return {
          id: pageId,
          nombre: `Nombre ${pageId}`,
          empresa: `Empresa ${pageId}`,
          rolPuesto: 'CEO',
          email: email === undefined ? 'sponsor@test.com' : email,
          whatsapp: '555',
        };
      },
    },
  };

  require.cache[emailPath] = {
    id: emailPath,
    filename: emailPath,
    loaded: true,
    exports: {
      EmailError,
      CATEGORIAS: {
        CORREO_INVALIDO: 'CORREO_INVALIDO',
        SMTP_NO_DISPONIBLE: 'SMTP_NO_DISPONIBLE',
        AUTH_INVALIDA: 'AUTH_INVALIDA',
      },
      async enviarConfirmacionCita(args) {
        emailCalls.push(args);
        if (emailFailCategoria) {
          throw new EmailError(emailFailCategoria, `mock fail ${emailFailCategoria}`);
        }
        return { ok: true };
      },
    },
  };

  const booking = require(bookingPath);
  return { booking, porId, mockCitas, calendarCreateCalls, emailCalls, citasReal };
}

let fallos = 0;
async function ok(nombre, fn) {
  try {
    await fn();
    console.log(`  ✅ ${nombre}`);
  } catch (err) {
    fallos += 1;
    console.log(`  ❌ ${nombre}`);
    console.log(`     ${err.stack || err.message}`);
  }
}

function baseParams(overrides = {}) {
  return {
    sponsor_calendario_id: 'cal-test',
    sponsor_notion_id: overrides.sponsor || 'sponsor-a',
    asistente_notion_id: overrides.asistente || 'asistente-b',
    inicio: overrides.inicio || INICIO,
    fin: overrides.fin || FIN,
    request_id: overrides.request_id || `req-${Math.random().toString(36).slice(2, 10)}`,
    titulo: 'Cita test email',
    ...overrides,
  };
}

(async () => {
  console.log('\n=== Caso 1 — reserva + 2 correos (sponsor / asistente) ===');
  await ok('estado Confirmada, 2 emails distintos, Calendar con descripción del sponsor', async () => {
    const h = crearHarness({ emailsPorId: { 'sponsor-a': 'a@t.com', 'asistente-b': 'b@t.com' } });
    const r = await h.booking.reservarCita(baseParams({ request_id: 'req-caso1' }));
    assert.strictEqual(r.estado, 'Confirmada');
    assert.strictEqual(r.mesa, 1);
    assert.strictEqual(h.emailCalls.length, 2);

    const mailSponsor = h.emailCalls.find((c) => c.destinatarios.includes('a@t.com'));
    const mailAsistente = h.emailCalls.find((c) => c.destinatarios.includes('b@t.com'));
    assert.ok(mailSponsor, 'debe haber correo al sponsor');
    assert.ok(mailAsistente, 'debe haber correo al asistente');

    // Sponsor: apertura por empresas; abajo datos de la persona asistente
    assert.ok(mailSponsor.descripcion.includes('Empresa asistente-b agendó un espacio con Empresa sponsor-a'));
    assert.ok(mailSponsor.descripcion.includes('Datos de contacto del asistente'));
    assert.ok(mailSponsor.descripcion.includes('Nombre: Nombre asistente-b'));
    assert.ok(mailSponsor.descripcion.includes('Agregar al calendario'));
    assert.ok(mailSponsor.descripcion.includes('¡Te esperamos en Fashion Digital Talks 2026!'));

    // Asistente: solo empresa del sponsor, SIN datos de contacto
    assert.ok(mailAsistente.descripcion.includes('Agendaste un espacio con Empresa sponsor-a'));
    assert.ok(mailAsistente.descripcion.includes('Agregar al calendario'));
    assert.ok(!mailAsistente.descripcion.includes('Datos de contacto'));
    assert.ok(!mailAsistente.descripcion.includes('Nombre sponsor-a'));
    assert.ok(!mailAsistente.descripcion.includes('a@t.com'));
    assert.ok(!mailAsistente.descripcion.includes('Teléfono'));

    assert.ok(h.calendarCreateCalls[0].descripcion.includes('Empresa asistente-b agendó'));
    assert.strictEqual(h.porId.get(r.notion_page_id).estatus, 'Confirmada');
  });

  console.log('\n=== Casos 2–4 — correo falla, cita NO se revierte ===');
  for (const { cat, label } of [
    { cat: 'CORREO_INVALIDO', label: '550 / CORREO_INVALIDO' },
    { cat: 'SMTP_NO_DISPONIBLE', label: 'ETIMEDOUT / SMTP_NO_DISPONIBLE' },
    { cat: 'AUTH_INVALIDA', label: '535 / AUTH_INVALIDA' },
  ]) {
    await ok(`${label} → Confirmada sin notificar + evento Calendar intacto`, async () => {
      const h = crearHarness({
        emailsPorId: { 'sponsor-a': 'a@t.com', 'asistente-b': 'b@t.com' },
        emailFailCategoria: cat,
      });
      const r = await h.booking.reservarCita(baseParams({ request_id: `req-${cat}` }));
      assert.strictEqual(r.estado, 'Confirmada sin notificar');
      assert.strictEqual(r.notificacion_error.categoria, cat);
      const page = h.porId.get(r.notion_page_id);
      assert.strictEqual(page.estatus, 'Confirmada sin notificar');
      assert.ok(page.notasEnvio.includes(cat));
      assert.strictEqual(page.intentos, 1);
      assert.ok(page.eventoId, 'debe conservar evento de Calendar');
      assert.strictEqual(h.calendarCreateCalls.length, 1);
    });
  }

  console.log('\n=== Caso 5 — sin emails en Contactos ni body ===');
  await ok('omite correo, queda Confirmada', async () => {
    const h = crearHarness({
      emailsPorId: { 'sponsor-a': '', 'asistente-b': '' },
    });
    const r = await h.booking.reservarCita(
      baseParams({ request_id: 'req-caso5', asistentes_email: [] })
    );
    assert.strictEqual(r.estado, 'Confirmada');
    assert.strictEqual(h.emailCalls.length, 0);
  });

  console.log('\n=== Caso 5b — body vacío, Contactos sí tiene email (solo sponsor) ===');
  await ok('correo SÍ se envía desde Contactos (1 envío al sponsor)', async () => {
    const h = crearHarness({
      emailsPorId: { 'sponsor-a': 'solo-contactos@t.com', 'asistente-b': '' },
    });
    const r = await h.booking.reservarCita(
      baseParams({ request_id: 'req-caso5b', asistentes_email: [] })
    );
    assert.strictEqual(r.estado, 'Confirmada');
    assert.strictEqual(h.emailCalls.length, 1);
    assert.deepStrictEqual(h.emailCalls[0].destinatarios, ['solo-contactos@t.com']);
    assert.ok(h.emailCalls[0].descripcion.includes('Datos de contacto del asistente'));
  });

  console.log('\n=== Caso 5c — solo asistente tiene email ===');
  await ok('1 envío corto al asistente, sin datos del sponsor', async () => {
    const h = crearHarness({
      emailsPorId: { 'sponsor-a': '', 'asistente-b': 'solo-asistente@t.com' },
    });
    const r = await h.booking.reservarCita(
      baseParams({ request_id: 'req-caso5c', asistentes_email: [] })
    );
    assert.strictEqual(r.estado, 'Confirmada');
    assert.strictEqual(h.emailCalls.length, 1);
    assert.deepStrictEqual(h.emailCalls[0].destinatarios, ['solo-asistente@t.com']);
    assert.ok(h.emailCalls[0].descripcion.includes('Agendaste un espacio con Empresa sponsor-a'));
    assert.ok(!h.emailCalls[0].descripcion.includes('Datos de contacto'));
  });

  console.log('\n=== Caso 6 — doble-booking: Confirmada sin notificar cuenta ===');
  await ok('sponsorOcupadoEnBloque + contarCitasEnBloque cuentan el estado nuevo', async () => {
    const h = crearHarness({ emailsPorId: { 'sponsor-a': '', 'asistente-b': '' } });
    // Seed directa en memoria (como si ya falló el correo)
    h.porId.set('seed-sin-notif', {
      id: 'seed-sin-notif',
      sponsor: 'sponsor-ocupado',
      asistente: 'asistente-x',
      inicio: INICIO,
      fin: FIN,
      estatus: 'Confirmada sin notificar',
      mesa: 1,
      intentos: 1,
      requestId: 'seed',
    });
    assert.strictEqual(
      await h.mockCitas.sponsorOcupadoEnBloque({ sponsorPageId: 'sponsor-ocupado', inicio: INICIO }),
      true
    );
    assert.strictEqual(await h.mockCitas.contarCitasEnBloque({ inicio: INICIO }), 1);
  });

  console.log('\n=== Caso 7 — ESTATUS_ACTIVOS / pares activos (vía existeCitaActivaEntre mock) ===');
  await ok('existeCitaActivaEntre true con Confirmada sin notificar', async () => {
    const h = crearHarness();
    h.porId.set('seed-par', {
      id: 'seed-par',
      sponsor: 'A',
      asistente: 'B',
      inicio: INICIO,
      fin: FIN,
      estatus: 'Confirmada sin notificar',
      mesa: 1,
      intentos: 1,
      requestId: 'seed-par',
    });
    assert.strictEqual(
      await h.mockCitas.existeCitaActivaEntre({ sponsorPageId: 'A', asistentePageId: 'B' }),
      true
    );
  });

  // También verificar que el filtro real de ESTATUS_ACTIVOS en el módulo incluye el estado
  await ok('ESTATUS_ACTIVOS del service real incluye Confirmada sin notificar', async () => {
    limpiarCache();
    // Leer el source string — la constante no se exporta; verificamos via existeCitaActivaEntre
    // del archivo real usando grep conceptual: re-require y mirar que la función
    // fue parcheada leyendo el archivo.
    const src = require('fs').readFileSync(citasPath, 'utf8');
    assert.ok(src.includes("'Confirmada sin notificar'"));
    assert.ok(
      /ESTATUS_ACTIVOS\s*=\s*\[[^\]]*Confirmada sin notificar/.test(src.replace(/\n/g, ' '))
    );
  });

  console.log('\n=== Caso 8 — límite de intentos ===');
  await ok('LIMITE_INTENTOS_ALCANZADO sin llamar Nodemailer', async () => {
    const h = crearHarness({
      emailsPorId: { 'sponsor-a': 'a@t.com', 'asistente-b': 'b@t.com' },
    });
    h.porId.set('cita-limite', {
      id: 'cita-limite',
      sponsor: 'sponsor-a',
      asistente: 'asistente-b',
      inicio: INICIO,
      fin: FIN,
      estatus: 'Confirmada sin notificar',
      mesa: 1,
      intentos: 5,
      requestId: 'limite',
    });
    await assert.rejects(
      () => h.booking.reintentarNotificacion('cita-limite'),
      (e) => e instanceof h.booking.BookingError && e.code === 'LIMITE_INTENTOS_ALCANZADO'
    );
    assert.strictEqual(h.emailCalls.length, 0);
  });

  console.log('\n=== SIN_DESTINATARIOS en reintento ===');
  await ok('relations OK pero sin Email → SIN_DESTINATARIOS', async () => {
    const h = crearHarness({
      emailsPorId: { 'sponsor-a': '', 'asistente-b': '' },
    });
    h.porId.set('cita-sin-mail', {
      id: 'cita-sin-mail',
      sponsor: 'sponsor-a',
      asistente: 'asistente-b',
      inicio: INICIO,
      fin: FIN,
      estatus: 'Confirmada sin notificar',
      mesa: 1,
      intentos: 1,
      requestId: 'sin-mail',
    });
    await assert.rejects(
      () => h.booking.reintentarNotificacion('cita-sin-mail'),
      (e) => e instanceof h.booking.BookingError && e.code === 'SIN_DESTINATARIOS'
    );
    assert.strictEqual(h.emailCalls.length, 0);
  });

  console.log('\n=== CONTACTO_NO_RESUELTO ===');
  await ok('relation vacía → CONTACTO_NO_RESUELTO sin obtenerContacto(undefined)', async () => {
    const h = crearHarness();
    h.porId.set('cita-huerfana-rel', {
      id: 'cita-huerfana-rel',
      sponsor: null,
      asistente: 'asistente-b',
      inicio: INICIO,
      fin: FIN,
      estatus: 'Confirmada sin notificar',
      mesa: 1,
      intentos: 1,
      requestId: 'huerfana',
    });
    await assert.rejects(
      () => h.booking.reintentarNotificacion('cita-huerfana-rel'),
      (e) => e instanceof h.booking.BookingError && e.code === 'CONTACTO_NO_RESUELTO'
    );
  });

  console.log('\n=== Sin fila huérfana si falla resolución en reservarCita ===');
  await ok('crearCitaPendiente existe pero se marca Fallida; Calendar no se llama', async () => {
    limpiarCache();
    const citasReal = require(citasPath);
    const porId = new Map();
    let seq = 0;
    Object.assign(citasReal, {
      async buscarPorRequestId() {
        return null;
      },
      async sponsorOcupadoEnBloque() {
        return false;
      },
      async contarCitasEnBloque() {
        return 0;
      },
      async crearCitaPendiente({ requestId, sponsorPageId, asistentePageId, inicio }) {
        seq += 1;
        const id = `pend-${seq}`;
        porId.set(id, { id, estatus: 'Pendiente Calendar', requestId, sponsorPageId, asistentePageId, inicio });
        return { id };
      },
      async marcarCitaFallida({ notionPageId, motivo }) {
        porId.get(notionPageId).estatus = 'Fallida';
        porId.get(notionPageId).motivo = motivo;
      },
    });
    const calendarCalls = [];
    require.cache[calendarPath] = {
      id: calendarPath,
      filename: calendarPath,
      loaded: true,
      exports: {
        async createEvent() {
          calendarCalls.push(1);
          return { evento_id: 'x' };
        },
        async cancelEvent() {
          return {};
        },
      },
    };
    require.cache[contactosPath] = {
      id: contactosPath,
      filename: contactosPath,
      loaded: true,
      exports: {
        async obtenerContacto() {
          throw new Error('Notion boom');
        },
      },
    };
    require.cache[emailPath] = {
      id: emailPath,
      filename: emailPath,
      loaded: true,
      exports: { async enviarConfirmacionCita() {}, EmailError },
    };
    const { reservarCita, BookingError } = require(bookingPath);
    await assert.rejects(
      () =>
        reservarCita({
          sponsor_calendario_id: 'cal',
          sponsor_notion_id: 's1',
          asistente_notion_id: 'a1',
          inicio: INICIO,
          fin: FIN,
          request_id: 'req-huerfana-fallida',
        }),
      (e) => e instanceof BookingError && e.code === 'CONTACTO_NO_RESUELTO'
    );
    const page = [...porId.values()][0];
    assert.strictEqual(page.estatus, 'Fallida');
    assert.strictEqual(calendarCalls.length, 0);
  });

  console.log('\n=== Reintento exitoso resetea intentos ===');
  await ok('reintentarNotificacion OK → Confirmada + intentos 0 + 2 correos', async () => {
    const h = crearHarness({
      emailsPorId: { 'sponsor-a': 'a@t.com', 'asistente-b': 'b@t.com' },
    });
    h.porId.set('cita-retry', {
      id: 'cita-retry',
      sponsor: 'sponsor-a',
      asistente: 'asistente-b',
      inicio: INICIO,
      fin: FIN,
      estatus: 'Confirmada sin notificar',
      mesa: 3,
      intentos: 2,
      requestId: 'retry',
    });
    const r = await h.booking.reintentarNotificacion('cita-retry');
    assert.strictEqual(r.estado, 'Confirmada');
    assert.strictEqual(h.porId.get('cita-retry').estatus, 'Confirmada');
    assert.strictEqual(h.porId.get('cita-retry').intentos, 0);
    assert.strictEqual(h.emailCalls.length, 2);
    assert.ok(h.emailCalls.every((c) => c.secuencia === 3));
  });

  console.log('\n=== clasificarErrorSmtp (email.service real) ===');
  await ok('clasifica 550 / ETIMEDOUT / 535', async () => {
    limpiarCache();
    const { clasificarErrorSmtp, CATEGORIAS } = require(emailPath);
    assert.strictEqual(clasificarErrorSmtp({ responseCode: 550 }), CATEGORIAS.CORREO_INVALIDO);
    assert.strictEqual(clasificarErrorSmtp({ code: 'ETIMEDOUT' }), CATEGORIAS.SMTP_NO_DISPONIBLE);
    assert.strictEqual(clasificarErrorSmtp({ responseCode: 535 }), CATEGORIAS.AUTH_INVALIDA);
  });

  console.log(`\n=== Resultado: ${fallos === 0 ? 'TODOS PASARON' : `${fallos} FALLARON`} ===\n`);
  process.exit(fallos === 0 ? 0 : 1);
})();
