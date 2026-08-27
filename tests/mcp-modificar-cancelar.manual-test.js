// Tools MCP modificar_cita / cancelar_cita y consultar_sugeridas_para_asistente.
//
//   node tests/mcp-modificar-cancelar.manual-test.js
//
// Los handlers MCP se prueban directo (misma función que registra server.tool).
// booking.service va mockeado: aquí se cubre presentación (lista para
// desambiguar, aviso si el correo falló, parámetros mínimos), no el mutex.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.NOTION_CITAS_DATA_SOURCE_ID = 'fake-mcp-citas';
process.env.NOTION_CONTACTOS_DATA_SOURCE_ID = 'fake-mcp-contactos';

class BookingError extends Error {
  constructor(code, message, detalle) {
    super(message);
    this.code = code;
    if (detalle !== undefined) this.detalle = detalle;
  }
}

const llamadas = [];
const bookingPath = require.resolve('../src/services/booking.service');
require.cache[bookingPath] = {
  id: bookingPath,
  filename: bookingPath,
  loaded: true,
  exports: {
    BookingError,
    async modificarCita(args) {
      llamadas.push(['modificar', { ...args }]);
      if (!args.citaId && args.telefono === '5512345678') {
        throw new BookingError(
          'VARIAS_CITAS_ACTIVAS',
          'Ese asistente tiene más de una cita confirmada.',
          {
            citas: [
              {
                citaId: 'cita-a',
                sponsor_empresa: 'Platica.mx',
                inicio: '2026-10-07T10:30:00-06:00',
                estatus: 'Confirmada',
              },
              {
                citaId: 'cita-b',
                sponsor_empresa: 'Otra Empresa',
                inicio: '2026-10-07T12:00:00-06:00',
                estatus: 'Confirmada',
              },
            ],
          }
        );
      }
      if (args.citaId === 'cita-ok') {
        return {
          notion_page_id: 'cita-ok',
          estado: 'Confirmada',
          inicio: '2026-10-07T12:00:00-06:00',
          fin: '2026-10-07T12:30:00-06:00',
          mesa: 2,
          horario_anterior: '2026-10-07T10:30:00-06:00',
        };
      }
      throw new Error(`modificarCita inesperado: ${JSON.stringify(args)}`);
    },
    async cancelarCita(args) {
      llamadas.push(['cancelar', { ...args }]);
      if (args.citaId === 'cita-mail') {
        return {
          notion_page_id: 'cita-mail',
          estado: 'Cancelada',
          aviso_pendiente: true,
          notificacion_error: { categoria: 'CORREO_INVALIDO', mensaje: '550 buzón' },
        };
      }
      if (args.citaId === 'cita-cancel') {
        return { notion_page_id: 'cita-cancel', estado: 'Cancelada', ya_estaba_cancelada: false };
      }
      throw new Error(`cancelarCita inesperado: ${JSON.stringify(args)}`);
    },
  },
};

const {
  ejecutarModificarCita,
  ejecutarCancelarCita,
  ejecutarConsultarSugeridasParaAsistente,
} = require('../src/mcp/server');

const citasService = require('../src/services/citas.service');
const consultarOriginal = citasService.consultarSugeridasPorIdentificador;
citasService.consultarSugeridasPorIdentificador = async (args) => ({
  asistente_notion_id: 'asistente-1',
  asistente_nombre: 'Ana',
  asistente_empresa: 'DINUS',
  whatsapp: args.whatsapp || null,
  sugeridas: [{ cita_page_id: 'sug-1', estatus: 'Aprobado', sponsor_empresa: 'Platica.mx' }],
  citasConfirmadas: [
    {
      sponsorNombre: 'Platica.mx',
      fechaHora: '2026-10-07T12:00:00-06:00',
      mesa: 'Mesa 2',
      citaId: 'cita-ok',
      checkInRealizado: false,
    },
  ],
});

function parse(result) {
  return JSON.parse(result.content[0].text);
}

let fallos = 0;
async function ok(nombre, fn) {
  llamadas.length = 0;
  try {
    await fn();
    console.log(`  ✅ ${nombre}`);
  } catch (err) {
    fallos += 1;
    console.log(`  ❌ ${nombre}`);
    console.log(`     ${err.stack || err.message}`);
  }
}

(async () => {
  console.log('\n=== modificar_cita ===');
  await ok('citaId directo → éxito con horario nuevo, sin isError', async () => {
    const r = await ejecutarModificarCita({
      citaId: 'cita-ok',
      nuevaFechaHora: '2026-10-07T12:00:00-06:00',
    });
    assert.ok(!r.isError);
    const body = parse(r);
    assert.strictEqual(body.estado, 'Confirmada');
    assert.strictEqual(body.notion_page_id, 'cita-ok');
    assert.ok(body.horario_nuevo_legible);
    assert.ok(!body.exito_parcial);
    assert.strictEqual(llamadas[0][0], 'modificar');
    assert.strictEqual(llamadas[0][1].citaId, 'cita-ok');
  });

  await ok('telefono con varias citas → lista para desambiguar, no elige una', async () => {
    const r = await ejecutarModificarCita({
      telefono: '5512345678',
      nuevaFechaHora: '2026-10-07T14:00:00-06:00',
    });
    assert.strictEqual(r.isError, true);
    const body = parse(r);
    assert.strictEqual(body.error, 'VARIAS_CITAS_ACTIVAS');
    assert.strictEqual(body.citas.length, 2);
    assert.ok(body.citas.every((c) => c.citaId && c.sponsor_empresa && c.inicio));
    assert.strictEqual(llamadas.length, 1);
  });

  await ok('sin telefono ni citaId → INVALID_INPUT, no llama al service', async () => {
    const r = await ejecutarModificarCita({ nuevaFechaHora: '2026-10-07T12:00:00-06:00' });
    assert.strictEqual(r.isError, true);
    assert.strictEqual(parse(r).error, 'INVALID_INPUT');
    assert.strictEqual(llamadas.length, 0);
  });

  await ok('citaId sin nuevaFechaHora → INVALID_INPUT, no llama al service', async () => {
    const r = await ejecutarModificarCita({ citaId: 'cita-ok' });
    assert.strictEqual(r.isError, true);
    assert.strictEqual(parse(r).error, 'INVALID_INPUT');
    assert.strictEqual(llamadas.length, 0);
  });

  console.log('\n=== cancelar_cita ===');
  await ok('caso exitoso', async () => {
    const r = await ejecutarCancelarCita({ citaId: 'cita-cancel' });
    assert.ok(!r.isError);
    const body = parse(r);
    assert.strictEqual(body.estado, 'Cancelada');
    assert.ok(!body.exito_parcial);
  });

  await ok('correo fallido → lo comunica, no lo oculta como éxito limpio', async () => {
    const r = await ejecutarCancelarCita({ citaId: 'cita-mail' });
    assert.ok(!r.isError, 'el cambio en Notion sí ocurrió; isError sería mentir que falló todo');
    const body = parse(r);
    assert.strictEqual(body.estado, 'Cancelada');
    assert.strictEqual(body.exito_parcial, true);
    assert.ok(body.aviso.includes('NO se envió'));
    assert.ok(body.aviso.includes('CORREO_INVALIDO'));
    assert.strictEqual(body.notificacion_error.categoria, 'CORREO_INVALIDO');
  });

  await ok('sin parámetros → INVALID_INPUT, no llama al service', async () => {
    const r = await ejecutarCancelarCita({});
    assert.strictEqual(r.isError, true);
    assert.strictEqual(parse(r).error, 'INVALID_INPUT');
    assert.strictEqual(llamadas.length, 0);
  });

  console.log('\n=== consultar_sugeridas_para_asistente ===');
  await ok('incluye citasConfirmadas además de sugeridas', async () => {
    const r = await ejecutarConsultarSugeridasParaAsistente({ whatsapp: '5512345678' });
    assert.ok(!r.isError);
    const body = parse(r);
    assert.ok(Array.isArray(body.sugeridas));
    assert.ok(Array.isArray(body.citasConfirmadas));
    assert.strictEqual(body.citasConfirmadas[0].citaId, 'cita-ok');
    assert.ok(!JSON.stringify(body).includes('calendarioGoogleId'));
    assert.ok(!JSON.stringify(body).includes('sponsor_calendario_id'));
  });

  await ok('la descripción de la tool ya no habla de calendarioGoogleId', async () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/mcp/server.js'), 'utf8');
    const bloque = src.match(
      /server\.tool\(\s*'consultar_sugeridas_para_asistente'[\s\S]*?^\s{2}\);/m
    );
    assert.ok(bloque, 'debe existir la tool');
    assert.ok(bloque[0].includes('citasConfirmadas'));
    assert.ok(!bloque[0].includes('calendarioGoogleId'));
  });

  citasService.consultarSugeridasPorIdentificador = consultarOriginal;
  if (fallos) process.exit(1);
  console.log('\n=== Resultado: TODOS PASARON ===\n');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
