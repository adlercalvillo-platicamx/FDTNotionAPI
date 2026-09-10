// Recordatorio 15 min antes, versión cron — mocks, sin Notion ni Plática reales.
//
// Lo que importa aquí: que el aviso salga de lo que Notion dice HOY (una
// cancelada no entra, una movida entra con su hora nueva) y que el estado en
// la fila impida mandar dos veces.
//
//   node tests/recordatorio-cita-15min.manual-test.js

const assert = require('assert');
const path = require('path');

process.env.PLATICA_API_BASE_URL = 'https://api.platica.mx';
process.env.PLATICA_API_KEY = 'test-key';
process.env.PLATICA_CHANNEL_ID = 'wb-test';
process.env.PLATICA_RESPONDER_AGENT_ID = 'c1IYnFsr0Jzfqq4NeLAs';
process.env.PLATICA_TEMPLATE_CITA_15MIN = 'notificacion_cita_15min_antes';
process.env.CITAS_ZONA_HORARIA_OFFSET = '-06:00';

const contactosPath = path.resolve(__dirname, '../src/services/contactos.service.js');
const citasPath = path.resolve(__dirname, '../src/services/citas.service.js');
const servicePath = path.resolve(__dirname, '../src/services/recordatorio-cita-15min.service.js');

const contactos = {};
const fetches = [];
/** Filas de Citas del mock, como las devolvería buscarCitasParaRecordatorio15min. */
let filas = [];
const marcas = [];
const meets = [];
let fallaAlMarcar = null;
let fallaMeet = null;
let meetSinUrl = false;

require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    async obtenerContacto(id) {
      const c = contactos[id];
      if (!c) {
        const err = new Error(`Contacto no encontrado: ${id}`);
        err.status = 404;
        throw err;
      }
      return c;
    },
  },
};

const RECLAMO_VENCIDO_MINUTOS = 10;

require.cache[citasPath] = {
  id: citasPath,
  filename: citasPath,
  loaded: true,
  exports: {
    ESTADO_RECORDATORIO_EN_CURSO: 'En curso',
    ESTADO_RECORDATORIO_ENVIADO: 'Enviado',
    ESTADO_RECORDATORIO_FALLO: 'Falló',
    ESTADO_RECORDATORIO_OMITIDO: 'Omitido',
    RECLAMO_RECORDATORIO_VENCIDO_MINUTOS: RECLAMO_VENCIDO_MINUTOS,
    // Réplica del filtro real: estatus + ventana + estado tomable.
    async buscarCitasParaRecordatorio15min({ desde, hasta, ahora }) {
      const ahoraMs = Date.parse(ahora);
      return filas
        .filter((f) => ['Confirmada', 'Confirmada sin notificar'].includes(f.estatus))
        .filter((f) => Date.parse(f.inicio) > Date.parse(desde) && Date.parse(f.inicio) <= Date.parse(hasta))
        .filter((f) => {
          if (!f.estadoRecordatorio15min || f.estadoRecordatorio15min === 'Falló') return true;
          if (f.estadoRecordatorio15min !== 'En curso') return false;
          const reclamado = Date.parse(f.fechaRecordatorio15min || '');
          if (!Number.isFinite(reclamado)) return true;
          return ahoraMs - reclamado >= RECLAMO_VENCIDO_MINUTOS * 60 * 1000;
        })
        .sort((a, b) => a.inicio.localeCompare(b.inicio));
    },
    async marcarEstadoRecordatorio15min({ notionPageId, estado, fecha, notas }) {
      if (fallaAlMarcar && fallaAlMarcar(estado)) throw new Error('Notion 502 al marcar');
      marcas.push({ notionPageId, estado, notas });
      const fila = filas.find((f) => f.id === notionPageId);
      if (fila) {
        fila.estadoRecordatorio15min = estado;
        fila.fechaRecordatorio15min = fecha || new Date().toISOString();
      }
      return {};
    },
    async persistirMeetVirtual({ notionPageId, eventId, meetUrl, intentos, notas }) {
      meets.push({ notionPageId, eventId, meetUrl, intentos, notas });
      const fila = filas.find((f) => f.id === notionPageId);
      if (fila) {
        if (eventId !== undefined) fila.googleMeetEventId = eventId;
        if (meetUrl !== undefined) fila.googleMeetUrl = meetUrl;
        if (intentos !== undefined) fila.intentosGoogleMeet = intentos;
        if (notas !== undefined) fila.notasGoogleMeet = notas;
      }
      return {};
    },
  },
};

function limpiar() {
  Object.keys(contactos).forEach((k) => delete contactos[k]);
  fetches.length = 0;
  marcas.length = 0;
  meets.length = 0;
  filas = [];
  fallaAlMarcar = null;
  fallaMeet = null;
  meetSinUrl = false;
  process.env.PLATICA_TEMPLATE_CITA_15MIN = 'notificacion_cita_15min_antes';
  process.env.PLATICA_TEMPLATE_CITA_15MIN_VIRTUAL = 'recordatorio_15min_antes_virtual';
  delete process.env.MEET_VIRTUAL_HABILITADO;
  process.env.MEET_VIRTUAL_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/test/exec';
  process.env.MEET_VIRTUAL_SECRET = 'secret-test';
  contactos['asistente-1'] = { nombre: 'JUAN PEREZ', whatsapp: '5215512345678', email: 'juan@test.com' };
  contactos['sponsor-1'] = { nombre: 'Pedro Sponsor', empresa: 'Infracommerce', email: 'pedro@sponsor.com' };
}

function fila(overrides = {}) {
  return {
    id: 'cita-1',
    estatus: 'Confirmada',
    inicio: '2026-10-07T10:30:00-06:00',
    fin: '2026-10-07T11:00:00-06:00',
    asistentePageId: 'asistente-1',
    sponsorPageId: 'sponsor-1',
    estadoRecordatorio15min: null,
    fechaRecordatorio15min: null,
    googleMeetEventId: null,
    googleMeetUrl: null,
    intentosGoogleMeet: 0,
    ...overrides,
  };
}

function cargarServicio() {
  delete require.cache[servicePath];
  return require(servicePath);
}

const originalFetch = global.fetch;
function fetchOk() {
  global.fetch = async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : {};
    fetches.push({ url, body, headers: opts?.headers });
    if (String(url).includes('script.google.com')) {
      if (fallaMeet) {
        return { ok: false, status: 500, async text() { return JSON.stringify({ ok: false, error: 'calendar boom' }); } };
      }
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            ok: true,
            eventId: '3d162dda199a812f9265ef6b3a1ee913',
            meetUrl: meetSinUrl ? '' : 'https://meet.google.com/abc-defg-hij',
            htmlLink: 'https://calendar.google.com/event',
            existing: false,
          });
        },
      };
    }
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ messageId: 'msg_test', status: 'sent' });
      },
    };
  };
}
fetchOk();

function ok(nombre, fn) {
  try {
    fn();
    console.log(`  OK  ${nombre}`);
  } catch (err) {
    console.error(`  FAIL ${nombre}`);
    throw err;
  }
}

async function okAsync(nombre, fn) {
  try {
    await fn();
    console.log(`  OK  ${nombre}`);
  } catch (err) {
    console.error(`  FAIL ${nombre}`);
    throw err;
  }
}

// 15 min antes de las 10:30 -06:00
const AHORA = '2026-10-07T10:15:00-06:00';

(async () => {
  const {
    ventanaRecordatorio,
    primerNombreParaSaludo,
    enviarRecordatorios15minPendientes,
    MINUTOS_ANTES,
  } = cargarServicio();

  console.log('\n=== Helpers ===');
  ok('ventana = ahora .. ahora + 15 min, en instantes', () => {
    const { desde, hasta } = ventanaRecordatorio({ ahora: AHORA });
    assert.strictEqual(desde, '2026-10-07T16:15:00.000Z');
    assert.strictEqual(hasta, '2026-10-07T16:30:00.000Z');
    assert.strictEqual(MINUTOS_ANTES, 15);
  });
  ok('primerNombre recorta Ticketópolis', () => {
    assert.strictEqual(primerNombreParaSaludo('ANA MARIA PEREZ LOPEZ'), 'Ana');
  });
  ok('"ahora" basura → INVALID_INPUT', () => {
    assert.throws(() => ventanaRecordatorio({ ahora: 'mañana' }), (err) => err.code === 'INVALID_INPUT');
  });

  console.log('\n=== Corrida del cron ===');
  await okAsync('cita confirmada en la ventana → plantilla sin scheduleTime + Enviado', async () => {
    limpiar();
    filas = [fila()];
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });

    assert.strictEqual(r.revisadas, 1);
    assert.strictEqual(r.enviados, 1);
    assert.strictEqual(r.fallidos, 0);
    assert.strictEqual(fetches.length, 1);
    assert.ok(String(fetches[0].url).endsWith('/v1/messages/template'));
    assert.ok(!('scheduleTime' in fetches[0].body), 'no debe programar, manda ya');
    assert.strictEqual(fetches[0].body.template.name, 'notificacion_cita_15min_antes');
    assert.deepStrictEqual(fetches[0].body.template.params, ['Juan', 'Infracommerce']);
    assert.strictEqual(fetches[0].body.conversationId, '5215512345678');
    assert.strictEqual(fetches[0].body.channelId, 'wb-test');
    assert.strictEqual(fetches[0].body.responderAgentId, 'c1IYnFsr0Jzfqq4NeLAs');
    assert.deepStrictEqual(
      marcas.map((m) => m.estado),
      ['En curso', 'Enviado'],
      'reclama antes de llamar a Plática'
    );
  });

  await okAsync('la razón de todo esto: una cancelada no recibe aviso', async () => {
    limpiar();
    filas = [fila({ estatus: 'Cancelada' })];
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.revisadas, 0);
    assert.strictEqual(fetches.length, 0);
    assert.strictEqual(marcas.length, 0);
  });

  await okAsync('una reprogramada avisa a su hora nueva, no a la vieja', async () => {
    limpiar();
    // Movida de 10:30 a 13:00: a las 10:15 no le toca nada.
    filas = [fila({ inicio: '2026-10-07T13:00:00-06:00' })];
    let r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.revisadas, 0);
    assert.strictEqual(fetches.length, 0);

    r = await enviarRecordatorios15minPendientes({ ahora: '2026-10-07T12:45:00-06:00' });
    assert.strictEqual(r.enviados, 1);
    assert.strictEqual(fetches.length, 1);
  });

  await okAsync('correr el cron dos veces no manda dos avisos', async () => {
    limpiar();
    filas = [fila()];
    await enviarRecordatorios15minPendientes({ ahora: AHORA });
    const r = await enviarRecordatorios15minPendientes({ ahora: '2026-10-07T10:20:00-06:00' });
    assert.strictEqual(r.revisadas, 0);
    assert.strictEqual(fetches.length, 1);
  });

  await okAsync('cita fuera de la ventana o ya empezada → no entra', async () => {
    limpiar();
    filas = [
      fila({ id: 'lejana', inicio: '2026-10-07T11:30:00-06:00' }),
      fila({ id: 'ya-empezo', inicio: '2026-10-07T10:00:00-06:00' }),
    ];
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.revisadas, 0);
    assert.strictEqual(fetches.length, 0);
  });

  await okAsync('varias citas en el mismo bloque → un aviso por cita', async () => {
    limpiar();
    contactos['asistente-2'] = { nombre: 'Ana', whatsapp: '5215599999999' };
    filas = [fila({ id: 'c1' }), fila({ id: 'c2', asistentePageId: 'asistente-2' })];
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.enviados, 2);
    assert.strictEqual(fetches.length, 2);
    assert.deepStrictEqual(
      fetches.map((f) => f.body.conversationId).sort(),
      ['5215512345678', '5215599999999']
    );
  });

  console.log('\n=== Fallos y reintentos ===');
  await okAsync('Plática 500 → Falló con motivo, y la siguiente corrida reintenta', async () => {
    limpiar();
    filas = [fila()];
    global.fetch = async () => ({ ok: false, status: 500, async text() { return 'boom'; } });
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.fallidos, 1);
    assert.strictEqual(r.enviados, 0);
    const ultima = marcas[marcas.length - 1];
    assert.strictEqual(ultima.estado, 'Falló');
    assert.ok(/Plática 500/.test(ultima.notas));

    fetchOk();
    const r2 = await enviarRecordatorios15minPendientes({ ahora: '2026-10-07T10:20:00-06:00' });
    assert.strictEqual(r2.enviados, 1, 'un Falló se reintenta mientras siga en ventana');
  });

  await okAsync('un fallo no deja sin aviso a las demás citas del lote', async () => {
    limpiar();
    contactos['asistente-2'] = { nombre: 'Ana', whatsapp: '5215599999999' };
    filas = [fila({ id: 'c1' }), fila({ id: 'c2', asistentePageId: 'asistente-2' })];
    let llamadas = 0;
    global.fetch = async (url, opts) => {
      llamadas += 1;
      if (llamadas === 1) throw new Error('socket hang up');
      const body = opts?.body ? JSON.parse(opts.body) : {};
      fetches.push({ url, body });
      return { ok: true, status: 200, async text() { return JSON.stringify({ messageId: 'msg_2' }); } };
    };
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.fallidos, 1);
    assert.strictEqual(r.enviados, 1);
    fetchOk();
  });

  await okAsync('asistente sin WhatsApp → Omitido terminal, no reintenta', async () => {
    limpiar();
    contactos['asistente-1'] = { nombre: 'Juan', whatsapp: '' };
    filas = [fila()];
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.omitidos, 1);
    assert.strictEqual(fetches.length, 0);
    assert.strictEqual(marcas[marcas.length - 1].estado, 'Omitido');

    const r2 = await enviarRecordatorios15minPendientes({ ahora: '2026-10-07T10:20:00-06:00' });
    assert.strictEqual(r2.revisadas, 0, 'Omitido no vuelve a entrar');
  });

  await okAsync('contacto que ya no existe → Falló, no tumba la corrida', async () => {
    limpiar();
    filas = [fila({ asistentePageId: 'borrado' })];
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.fallidos, 1);
    assert.strictEqual(fetches.length, 0);
    assert.ok(/Contacto no encontrado/.test(marcas[marcas.length - 1].notas));
  });

  await okAsync('si no se puede reclamar la fila, no se manda nada', async () => {
    limpiar();
    filas = [fila()];
    fallaAlMarcar = (estado) => estado === 'En curso';
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.fallidos, 1);
    assert.strictEqual(fetches.length, 0, 'sin reclamo no hay envío');
  });

  await okAsync('un "En curso" trabado se vuelve a tomar tras 10 min', async () => {
    limpiar();
    filas = [
      fila({
        estadoRecordatorio15min: 'En curso',
        fechaRecordatorio15min: '2026-10-07T09:50:00-06:00',
      }),
    ];
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.enviados, 1);
  });

  await okAsync('un "En curso" reciente se respeta (otra corrida lo tiene)', async () => {
    limpiar();
    filas = [
      fila({
        estadoRecordatorio15min: 'En curso',
        fechaRecordatorio15min: '2026-10-07T10:14:00-06:00',
      }),
    ];
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.revisadas, 0);
    assert.strictEqual(fetches.length, 0);
  });

  await okAsync('sin env de plantilla → corrida omitida sin tocar Notion', async () => {
    limpiar();
    delete process.env.PLATICA_TEMPLATE_CITA_15MIN;
    filas = [fila()];
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.deepStrictEqual(r, { omitido: true, motivo: 'SIN_PLANTILLA', ahora: AHORA });
    assert.strictEqual(fetches.length, 0);
    assert.strictEqual(marcas.length, 0);
  });

  await okAsync('{{2}} cae al nombre si el sponsor no tiene empresa', async () => {
    limpiar();
    contactos['sponsor-1'] = { nombre: 'Pedro', empresa: '', email: 'pedro@sponsor.com' };
    filas = [fila()];
    await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.deepStrictEqual(fetches[0].body.template.params, ['Juan', 'Pedro']);
  });

  console.log('\n=== Meet virtual ===');
  const CITA_V = '3d162dda-199a-812f-9265-ef6b3a1ee913';

  await okAsync('flag apagado: Virtual usa la plantilla presencial y no llama Apps Script', async () => {
    limpiar();
    contactos['asistente-1'].ticketTipo = 'Virtual';
    filas = [fila({ id: CITA_V })];
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.enviados, 1);
    assert.strictEqual(fetches.length, 1);
    assert.ok(String(fetches[0].url).endsWith('/v1/messages/template'));
    assert.strictEqual(fetches[0].body.template.name, 'notificacion_cita_15min_antes');
    assert.strictEqual(meets.length, 0);
  });

  await okAsync('Virtual + flag: Meet antes de WhatsApp, ambos invitados, plantilla virtual', async () => {
    limpiar();
    process.env.MEET_VIRTUAL_HABILITADO = 'true';
    contactos['asistente-1'].ticketTipo = 'Virtual';
    filas = [fila({ id: CITA_V, titulo: 'Cita — Marca - Infracommerce' })];
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.enviados, 1);
    assert.strictEqual(fetches.length, 2);
    assert.ok(String(fetches[0].url).includes('script.google.com'));
    assert.strictEqual(fetches[0].body.secret, 'secret-test');
    assert.strictEqual(fetches[0].body.asistente.email, 'juan@test.com');
    assert.strictEqual(fetches[0].body.sponsor.email, 'pedro@sponsor.com');
    assert.ok(String(fetches[1].url).endsWith('/v1/messages/template'));
    assert.strictEqual(fetches[1].body.template.name, 'recordatorio_15min_antes_virtual');
    assert.deepStrictEqual(fetches[1].body.template.params, [
      'Juan',
      'Infracommerce',
      'https://meet.google.com/abc-defg-hij',
    ]);
    assert.ok(meets.some((m) => m.eventId === '3d162dda199a812f9265ef6b3a1ee913'));
    assert.strictEqual(r.detalle[0].meetEventId, '3d162dda199a812f9265ef6b3a1ee913');
  });

  await okAsync('Meet ya persistido: no vuelve a llamar Apps Script; reintenta WhatsApp', async () => {
    limpiar();
    process.env.MEET_VIRTUAL_HABILITADO = 'true';
    contactos['asistente-1'].ticketTipo = 'Virtual';
    filas = [
      fila({
        id: CITA_V,
        googleMeetEventId: '3d162dda199a812f9265ef6b3a1ee913',
        googleMeetUrl: 'https://meet.google.com/abc-defg-hij',
        intentosGoogleMeet: 1,
      }),
    ];
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.enviados, 1);
    assert.strictEqual(fetches.filter((f) => String(f.url).includes('script.google.com')).length, 0);
    assert.strictEqual(fetches.length, 1);
    assert.strictEqual(fetches[0].body.template.name, 'recordatorio_15min_antes_virtual');
    assert.deepStrictEqual(fetches[0].body.template.params, [
      'Juan',
      'Infracommerce',
      'https://meet.google.com/abc-defg-hij',
    ]);
  });

  await okAsync('Meet 500: no manda plantilla virtual; al 3er intento Omitido', async () => {
    limpiar();
    process.env.MEET_VIRTUAL_HABILITADO = 'true';
    contactos['asistente-1'].ticketTipo = 'Virtual';
    filas = [fila({ id: CITA_V })];
    fallaMeet = true;

    const r1 = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r1.fallidos, 1);
    assert.strictEqual(fetches.filter((f) => String(f.url).includes('/v1/messages/template')).length, 0);
    assert.strictEqual(filas[0].intentosGoogleMeet, 1);
    filas[0].estadoRecordatorio15min = 'Falló';

    const r2 = await enviarRecordatorios15minPendientes({ ahora: '2026-10-07T10:20:00-06:00' });
    assert.strictEqual(r2.fallidos, 1);
    assert.strictEqual(filas[0].intentosGoogleMeet, 2);
    filas[0].estadoRecordatorio15min = 'Falló';

    const r3 = await enviarRecordatorios15minPendientes({ ahora: '2026-10-07T10:25:00-06:00' });
    assert.strictEqual(r3.omitidos, 1);
    assert.strictEqual(r3.detalle[0].motivo, 'MEET_AGOTADO');
    assert.strictEqual(marcas[marcas.length - 1].estado, 'Omitido');
    assert.strictEqual(fetches.filter((f) => String(f.url).includes('/v1/messages/template')).length, 0);
  });

  await okAsync('Meet sin URL: consume intentos y al 3ro queda Omitido', async () => {
    limpiar();
    process.env.MEET_VIRTUAL_HABILITADO = 'true';
    contactos['asistente-1'].ticketTipo = 'Virtual';
    filas = [fila({ id: CITA_V })];
    meetSinUrl = true;

    const r1 = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r1.fallidos, 1);
    assert.strictEqual(filas[0].intentosGoogleMeet, 1);
    assert.ok(filas[0].googleMeetEventId);
    filas[0].estadoRecordatorio15min = 'Falló';

    const r2 = await enviarRecordatorios15minPendientes({ ahora: '2026-10-07T10:20:00-06:00' });
    assert.strictEqual(r2.fallidos, 1);
    assert.strictEqual(filas[0].intentosGoogleMeet, 2);
    filas[0].estadoRecordatorio15min = 'Falló';

    const r3 = await enviarRecordatorios15minPendientes({ ahora: '2026-10-07T10:25:00-06:00' });
    assert.strictEqual(r3.omitidos, 1);
    assert.strictEqual(r3.detalle[0].motivo, 'MEET_AGOTADO');
    assert.strictEqual(filas[0].intentosGoogleMeet, 3);
    assert.strictEqual(fetches.filter((f) => String(f.url).includes('/v1/messages/template')).length, 0);
  });

  await okAsync('Virtual sin email → Omitido SIN_EMAIL, sin Meet ni WhatsApp', async () => {
    limpiar();
    process.env.MEET_VIRTUAL_HABILITADO = 'true';
    contactos['asistente-1'].ticketTipo = 'Virtual';
    contactos['asistente-1'].email = '';
    filas = [fila({ id: CITA_V })];
    const r = await enviarRecordatorios15minPendientes({ ahora: AHORA });
    assert.strictEqual(r.omitidos, 1);
    assert.strictEqual(r.detalle[0].motivo, 'SIN_EMAIL');
    assert.strictEqual(fetches.length, 0);
  });

  console.log('\n✅ recordatorio-cita-15min.manual-test.js');
})()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    global.fetch = originalFetch;
  });
