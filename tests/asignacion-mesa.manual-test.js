// tests/asignacion-mesa.manual-test.js
//
// Asignación automática de Mesa / Ubicacion en reservarCita.
// Cubre: orden de llegada, cancelación+reasignación por conteo, y
// concurrencia (mutex) — sin Notion ni Calendar reales.
//
//   node tests/asignacion-mesa.manual-test.js

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
  process.env.NOTION_CITAS_DATA_SOURCE_ID || 'fake-for-mesa-test';

const INICIO = '2026-10-07T10:30:00-06:00';
const FIN = '2026-10-07T11:00:00-06:00';

/** Estado en memoria que simula Notion Confirmada + Pendiente. */
function crearEstadoNotion() {
  /** @type {Map<string, { id: string, sponsor: string, inicio: string, estatus: string, mesa: number|null, requestId: string }>} */
  const porId = new Map();
  /** @type {Map<string, string>} */
  const porRequestId = new Map();
  let seq = 0;

  return {
    porId,
    seedConfirmada({ id, sponsor, inicio, mesa, requestId }) {
      const page = {
        id,
        sponsor,
        inicio,
        estatus: 'Confirmada',
        mesa,
        requestId: requestId || `seed-${id}`,
      };
      porId.set(id, page);
      porRequestId.set(page.requestId, id);
    },
    cancelar(id) {
      const page = porId.get(id);
      assert.ok(page, `cancelar: no existe ${id}`);
      page.estatus = 'Cancelada';
    },
    mock: {
      async buscarPorRequestId(requestId) {
        const id = porRequestId.get(requestId);
        if (!id) return null;
        const page = porId.get(id);
        return {
          id: page.id,
          properties: {
            Estatus: { select: { name: page.estatus } },
            'Mesa / Ubicacion': page.mesa
              ? { rich_text: [{ plain_text: `Mesa ${page.mesa}` }] }
              : { rich_text: [] },
          },
        };
      },
      async sponsorOcupadoEnBloque({ sponsorPageId, inicio }) {
        for (const page of porId.values()) {
          if (
            page.estatus === 'Confirmada' &&
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
          if (page.estatus === 'Confirmada' && page.inicio === inicio) n += 1;
        }
        return n;
      },
      async crearCitaPendiente({ requestId, sponsorPageId, inicio, mesa }) {
        seq += 1;
        const id = `cita-mock-${seq}`;
        const page = {
          id,
          sponsor: sponsorPageId,
          inicio,
          estatus: 'Pendiente Calendar',
          mesa: mesa ?? null,
          requestId,
        };
        porId.set(id, page);
        porRequestId.set(requestId, id);
        return { id };
      },
      async actualizarTituloCita({ notionPageId, titulo }) {
        const page = porId.get(notionPageId);
        if (page) page.titulo = titulo;
        return { id: notionPageId };
      },
      async confirmarCita({ notionPageId, eventoId }) {
        const page = porId.get(notionPageId);
        assert.ok(page, `confirmarCita: no existe ${notionPageId}`);
        page.estatus = 'Confirmada';
        page.eventoId = eventoId;
        return { id: notionPageId };
      },
      async marcarCitaFallida({ notionPageId }) {
        const page = porId.get(notionPageId);
        if (page) page.estatus = 'Fallida';
      },
      async archivarSugerenciasDelPar() {
        return { archivadas: 0, ids: [] };
      },
      async revertirCitaPendienteAMatch({ notionPageId, estatusPrevio }) {
        const page = porId.get(notionPageId);
        if (page) page.estatus = estatusPrevio || 'Aprobado';
      },
      // No usados por reservarCita en este flujo, pero el service real exporta más.
      async crearCitaSugerida() {
        throw new Error('no usado en este test');
      },
    },
  };
}

const citasPath = path.resolve(__dirname, '../src/services/citas.service.js');
const calendarPath = path.resolve(__dirname, '../src/services/calendar-client.service.js');
const contactosPath = path.resolve(__dirname, '../src/services/contactos.service.js');
const emailPath = path.resolve(__dirname, '../src/services/email.service.js');
const bookingPath = path.resolve(__dirname, '../src/services/booking.service.js');

// Limpiar si ya estaban cargados (p.ej. re-run en el mismo proceso).
delete require.cache[citasPath];
delete require.cache[calendarPath];
delete require.cache[contactosPath];
delete require.cache[emailPath];
delete require.cache[bookingPath];

// Helpers de grilla (obtenerFechasEvento / generarBloquesParaFecha / …)
// salen del service real; solo mockeamos lo que toca Notion.
const citasReal = require(citasPath);
const estado = crearEstadoNotion();
Object.assign(citasReal, estado.mock);

require.cache[calendarPath] = {
  id: calendarPath,
  filename: calendarPath,
  loaded: true,
  exports: {
    async createEvent() {
      return { evento_id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
    },
    async cancelEvent() {
      return { ok: true };
    },
  },
};

// Sin emails → se omite el correo (caso 5); este test solo verifica mesas.
require.cache[contactosPath] = {
  id: contactosPath,
  filename: contactosPath,
  loaded: true,
  exports: {
    async obtenerContacto(pageId) {
      return { id: pageId, nombre: 'Mock', empresa: '', email: '', whatsapp: '', rolPuesto: '' };
    },
  },
};
require.cache[emailPath] = {
  id: emailPath,
  filename: emailPath,
  loaded: true,
  exports: {
    async enviarConfirmacionCita() {
      throw new Error('email no debería llamarse en test de mesa (Contactos sin email)');
    },
    EmailError: class EmailError extends Error {
      constructor(categoria, message) {
        super(message);
        this.categoria = categoria;
      }
    },
  },
};

const { reservarCita, BookingError } = require(bookingPath);

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
    sponsor_notion_id: overrides.sponsor || `sponsor-${Math.random().toString(36).slice(2, 8)}`,
    asistente_notion_id: `asistente-${Math.random().toString(36).slice(2, 8)}`,
    inicio: INICIO,
    fin: FIN,
    request_id: overrides.request_id || `req-${Math.random().toString(36).slice(2, 10)}`,
    titulo: 'Cita test mesa',
    ...overrides,
  };
}

(async () => {
  console.log('\n=== Asignación de mesa — orden de llegada ===');
  await ok('1ª Confirmada en bloque vacío → Mesa 1', async () => {
    const r = await reservarCita(baseParams({ sponsor: 's-orden-1', request_id: 'req-orden-1' }));
    assert.strictEqual(r.estado, 'Confirmada');
    assert.strictEqual(r.mesa, 1);
    assert.strictEqual(estado.porId.get(r.notion_page_id).mesa, 1);
  });
  await ok('2ª Confirmada mismo bloque → Mesa 2', async () => {
    const r = await reservarCita(baseParams({ sponsor: 's-orden-2', request_id: 'req-orden-2' }));
    assert.strictEqual(r.mesa, 2);
  });

  console.log('\n=== Cancelación + reasignación por conteo (no por hueco libre) ===');
  // Reset parcial: 3 confirmadas mesas 1/2/3 → cancelar la de mesa 2 → nueva = Mesa 3
  const bloqueCancel = '2026-10-07T11:00:00-06:00';
  const finCancel = '2026-10-07T11:30:00-06:00';
  estado.seedConfirmada({ id: 'seed-m1', sponsor: 's-c1', inicio: bloqueCancel, mesa: 1 });
  estado.seedConfirmada({ id: 'seed-m2', sponsor: 's-c2', inicio: bloqueCancel, mesa: 2 });
  estado.seedConfirmada({ id: 'seed-m3', sponsor: 's-c3', inicio: bloqueCancel, mesa: 3 });

  await ok('Con 3 Confirmadas, cancelar Mesa 2 → contarCitasEnBloque = 2', async () => {
    estado.cancelar('seed-m2');
    const n = await estado.mock.contarCitasEnBloque({ inicio: bloqueCancel });
    assert.strictEqual(n, 2);
  });
  await ok('Reserva nueva tras cancelar Mesa 2 → recibe Mesa 3 (no 2 ni 4)', async () => {
    const r = await reservarCita(
      baseParams({
        sponsor: 's-c-nueva',
        request_id: 'req-post-cancel',
        inicio: bloqueCancel,
        fin: finCancel,
      })
    );
    assert.strictEqual(r.mesa, 3, `esperaba Mesa 3, got ${r.mesa}`);
    assert.strictEqual(estado.porId.get(r.notion_page_id).mesa, 3);
  });

  console.log('\n=== Concurrencia (mutex) — mismo bloque, dos reservas en paralelo ===');
  const bloqueConc = '2026-10-07T11:30:00-06:00';
  const finConc = '2026-10-07T12:00:00-06:00';
  await ok('Dos reservas simultáneas → mesas distintas (1 y 2), nunca el mismo número', async () => {
    const [a, b] = await Promise.all([
      reservarCita(
        baseParams({
          sponsor: 's-conc-a',
          request_id: 'req-conc-a',
          inicio: bloqueConc,
          fin: finConc,
        })
      ),
      reservarCita(
        baseParams({
          sponsor: 's-conc-b',
          request_id: 'req-conc-b',
          inicio: bloqueConc,
          fin: finConc,
        })
      ),
    ]);
    const mesas = [a.mesa, b.mesa].sort((x, y) => x - y);
    assert.deepStrictEqual(mesas, [1, 2], `mesas=${JSON.stringify(mesas)}`);
    assert.notStrictEqual(a.mesa, b.mesa);
  });

  console.log('\n=== Capacidad (regresión) ===');
  await ok('11 Confirmadas → CAPACIDAD_MESAS_LLENA', async () => {
    const bloqueFull = '2026-10-07T12:00:00-06:00';
    const finFull = '2026-10-07T12:30:00-06:00';
    for (let i = 1; i <= 11; i += 1) {
      estado.seedConfirmada({
        id: `full-${i}`,
        sponsor: `s-full-${i}`,
        inicio: bloqueFull,
        mesa: i,
      });
    }
    await assert.rejects(
      () =>
        reservarCita(
          baseParams({
            sponsor: 's-full-extra',
            request_id: 'req-full-extra',
            inicio: bloqueFull,
            fin: finFull,
          })
        ),
      (e) => e instanceof BookingError && e.code === 'CAPACIDAD_MESAS_LLENA'
    );
  });

  console.log(`\n=== Resultado: ${fallos === 0 ? 'TODOS PASARON' : `${fallos} FALLARON`} ===\n`);
  process.exit(fallos === 0 ? 0 : 1);
})();
