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
let ultimaConsultaSugeridas = null;
let escenarioDisponibilidad = 'variado';
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
  ejecutarConsultarDisponibilidadCita,
} = require('../src/mcp/server');

const citasService = require('../src/services/citas.service');
const consultarOriginal = citasService.consultarSugeridasPorIdentificador;
citasService.consultarSugeridasPorIdentificador = async (args) => {
  ultimaConsultaSugeridas = args;
  return {
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
  };
};
const obtenerDisponibilidadOriginal = citasService.obtenerDisponibilidadSponsor;
const obtenerFechasOriginal = citasService.obtenerFechasEvento;
citasService.obtenerFechasEvento = () => ['2026-10-07', '2026-10-08'];
citasService.obtenerDisponibilidadSponsor = async ({ sponsorPageId, fecha, asistentePageId }) => {
  assert.strictEqual(sponsorPageId, 'sponsor-1');
  if (escenarioDisponibilidad === 'cruce-dias') {
    if (fecha === '2026-10-07') {
      return [
        {
          inicio: `${fecha}T10:30:00-06:00`,
          fin: `${fecha}T11:00:00-06:00`,
          disponible: true,
          motivo: null,
        },
        {
          inicio: `${fecha}T11:00:00-06:00`,
          fin: `${fecha}T11:30:00-06:00`,
          disponible: true,
          motivo: null,
        },
      ];
    }
    return [
      {
        inicio: `${fecha}T14:00:00-06:00`,
        fin: `${fecha}T14:30:00-06:00`,
        disponible: true,
        motivo: null,
      },
      {
        inicio: `${fecha}T14:30:00-06:00`,
        fin: `${fecha}T15:00:00-06:00`,
        disponible: true,
        motivo: null,
      },
    ];
  }
  if (escenarioDisponibilidad === 'asistente-ocupado') {
    if (fecha === '2026-10-07') {
      return [
        {
          inicio: `${fecha}T10:30:00-06:00`,
          fin: `${fecha}T11:00:00-06:00`,
          disponible: true,
          motivo: null,
        },
        {
          inicio: `${fecha}T11:00:00-06:00`,
          fin: `${fecha}T11:30:00-06:00`,
          disponible: !asistentePageId,
          motivo: asistentePageId ? 'ASISTENTE_YA_OCUPADO' : null,
        },
        {
          inicio: `${fecha}T14:00:00-06:00`,
          fin: `${fecha}T14:30:00-06:00`,
          disponible: true,
          motivo: null,
        },
        {
          inicio: `${fecha}T15:00:00-06:00`,
          fin: `${fecha}T15:30:00-06:00`,
          disponible: true,
          motivo: null,
        },
      ];
    }
    return [
      {
        inicio: `${fecha}T10:30:00-06:00`,
        fin: `${fecha}T11:00:00-06:00`,
        disponible: true,
        motivo: null,
      },
      {
        inicio: `${fecha}T11:30:00-06:00`,
        fin: `${fecha}T12:00:00-06:00`,
        disponible: true,
        motivo: null,
      },
      {
        inicio: `${fecha}T15:00:00-06:00`,
        fin: `${fecha}T15:30:00-06:00`,
        disponible: true,
        motivo: null,
      },
    ];
  }
  if (escenarioDisponibilidad === 'con-14-y-15') {
    return [
      {
        inicio: `${fecha}T10:30:00-06:00`,
        fin: `${fecha}T11:00:00-06:00`,
        disponible: true,
        motivo: null,
      },
      {
        inicio: `${fecha}T11:00:00-06:00`,
        fin: `${fecha}T11:30:00-06:00`,
        disponible: true,
        motivo: null,
      },
      {
        inicio: `${fecha}T14:00:00-06:00`,
        fin: `${fecha}T14:30:00-06:00`,
        disponible: true,
        motivo: null,
      },
      {
        inicio: `${fecha}T15:00:00-06:00`,
        fin: `${fecha}T15:30:00-06:00`,
        disponible: true,
        motivo: null,
      },
    ];
  }
  const manana = {
    inicio: `${fecha}T10:30:00-06:00`,
    fin: `${fecha}T11:00:00-06:00`,
    disponible: true,
    motivo: null,
  };
  const mediodia = {
    inicio: `${fecha}T11:30:00-06:00`,
    fin: `${fecha}T12:00:00-06:00`,
    disponible: true,
    motivo: null,
  };
  const tarde = {
    inicio: `${fecha}T15:00:00-06:00`,
    fin: `${fecha}T15:30:00-06:00`,
    disponible: true,
    motivo: null,
  };
  const ocupado = {
    inicio: `${fecha}T11:00:00-06:00`,
    fin: `${fecha}T11:30:00-06:00`,
    disponible: false,
    motivo: 'SPONSOR_YA_OCUPADO',
  };
  return [manana, ocupado, mediodia, tarde];
};

function parse(result) {
  return JSON.parse(result.content[0].text);
}

function argsDispo(extra = {}) {
  return { sponsorPageId: 'sponsor-1', asistentePageId: 'asistente-1', ...extra };
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
    assert.strictEqual(ultimaConsultaSugeridas.soloAprobado, true);
    assert.ok(Array.isArray(body.sugeridas));
    assert.ok(body.sugeridas.every((s) => s.estatus === 'Aprobado'));
    assert.ok(Array.isArray(body.citasConfirmadas));
    assert.strictEqual(body.citasConfirmadas[0].citaId, 'cita-ok');
    assert.strictEqual(body.sugeridas_para_ofrecer.length, 1);
    assert.strictEqual(body.hay_mas_sugeridas, false);
    assert.ok(!JSON.stringify(body).includes('calendarioGoogleId'));
    assert.ok(!JSON.stringify(body).includes('sponsor_calendario_id'));
  });

  await ok('4 Aprobado → las ofrece todas, hay_mas_sugeridas false', async () => {
    const previa = citasService.consultarSugeridasPorIdentificador;
    citasService.consultarSugeridasPorIdentificador = async (args) => ({
      ...(await previa(args)),
      sugeridas: [1, 2, 3, 4].map((n) => ({
        cita_page_id: `sug-${n}`,
        estatus: 'Aprobado',
        sponsor_empresa: `Empresa ${n}`,
      })),
    });
    const body = parse(await ejecutarConsultarSugeridasParaAsistente({ whatsapp: '5512345678' }));
    assert.strictEqual(body.sugeridas_para_ofrecer.length, 4);
    assert.strictEqual(body.hay_mas_sugeridas, false);
    assert.ok(body.aviso.includes('máximo 4'));
    citasService.consultarSugeridasPorIdentificador = previa;
  });

  await ok('5 Aprobado → ofrece 4 y hay_mas_sugeridas true', async () => {
    const previa = citasService.consultarSugeridasPorIdentificador;
    citasService.consultarSugeridasPorIdentificador = async (args) => ({
      ...(await previa(args)),
      sugeridas: [1, 2, 3, 4, 5].map((n) => ({
        cita_page_id: `sug-${n}`,
        estatus: 'Aprobado',
        sponsor_empresa: `Empresa ${n}`,
      })),
    });
    const body = parse(await ejecutarConsultarSugeridasParaAsistente({ whatsapp: '5512345678' }));
    assert.strictEqual(body.sugeridas_para_ofrecer.length, 4);
    assert.strictEqual(body.hay_mas_sugeridas, true);
    citasService.consultarSugeridasPorIdentificador = previa;
  });

  await ok('la descripción dice solo Aprobado, no Sugerido como ofrecible', async () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/mcp/server.js'), 'utf8');
    const bloque = src.match(
      /server\.tool\(\s*'consultar_sugeridas_para_asistente'[\s\S]*?^\s{2}\);/m
    );
    assert.ok(bloque, 'debe existir la tool');
    assert.ok(bloque[0].includes('citasConfirmadas'));
    assert.ok(bloque[0].includes('Aprobado'));
    assert.ok(!bloque[0].includes('calendarioGoogleId'));
    assert.ok(!/Sugerido o Aprobado/.test(bloque[0]));
  });

  console.log('\n=== consultar_disponibilidad_cita ===');
  await ok('sin fecha consulta ambos días y ofrece máximo 3 horarios libres', async () => {
    escenarioDisponibilidad = 'variado';
    const r = await ejecutarConsultarDisponibilidadCita(argsDispo());
    assert.ok(!r.isError);
    const body = parse(r);
    assert.ok(!body.disponibilidad, 'no debe devolver la grilla completa');
    assert.strictEqual(body.opciones_para_ofrecer.length, 3);
    assert.strictEqual(body.hay_mas, true);
    assert.strictEqual(body.total_libres, 6);
    assert.ok(body.opciones_para_ofrecer.every((h) => h.inicio && h.fin && h.horario_legible));
    assert.deepStrictEqual(
      body.opciones_para_ofrecer.map((h) => h.inicio),
      [
        '2026-10-07T10:30:00-06:00',
        '2026-10-07T15:00:00-06:00',
        '2026-10-08T10:30:00-06:00',
      ],
      'casillas: Día 1 Mañana, Día 1 Tarde, Día 2'
    );
    assert.ok(body.aviso.includes('SOLO estas 3'));
  });

  await ok('sin Tarde Día 1 rellena la casilla con Día 2 y no repite', async () => {
    escenarioDisponibilidad = 'cruce-dias';
    const body = parse(
      await ejecutarConsultarDisponibilidadCita(argsDispo())
    );
    const inicios = body.opciones_para_ofrecer.map((h) => h.inicio);
    assert.deepStrictEqual(inicios, [
      '2026-10-07T10:30:00-06:00',
      '2026-10-07T11:00:00-06:00',
      '2026-10-08T14:00:00-06:00',
    ]);
    assert.strictEqual(new Set(inicios).size, 3);
  });

  await ok('con fecha mira solo ese día y respeta el tope de 3', async () => {
    escenarioDisponibilidad = 'variado';
    const r = await ejecutarConsultarDisponibilidadCita(
      argsDispo({ fecha: '2026-10-08' })
    );
    const body = parse(r);
    assert.ok(body.opciones_para_ofrecer.every((h) => h.inicio.startsWith('2026-10-08')));
    assert.strictEqual(body.opciones_para_ofrecer.length, 3);
    assert.strictEqual(body.hay_mas, false);
    assert.strictEqual(body.total_libres, 3);
  });

  await ok('consulta en vivo no ofrece bloques del mismo día que ya pasaron', async () => {
    escenarioDisponibilidad = 'variado';
    const r = await ejecutarConsultarDisponibilidadCita(
      argsDispo({ fecha: '2026-10-07' }),
      { ahora: new Date('2026-10-07T12:05:01-06:00') }
    );
    const body = parse(r);
    assert.deepStrictEqual(
      body.opciones_para_ofrecer.map((h) => h.inicio),
      ['2026-10-07T15:00:00-06:00']
    );
    assert.strictEqual(body.total_libres, 1);
    assert.strictEqual(body.hay_mas, false);
  });

  await ok('excluirInicios pide el siguiente lote', async () => {
    escenarioDisponibilidad = 'variado';
    const primero = parse(await ejecutarConsultarDisponibilidadCita(argsDispo()));
    const r = await ejecutarConsultarDisponibilidadCita(
      argsDispo({ excluirInicios: primero.opciones_para_ofrecer.map((h) => h.inicio) })
    );
    const body = parse(r);
    assert.strictEqual(body.opciones_para_ofrecer.length, 3);
    assert.strictEqual(body.hay_mas, false);
    const yaOfrecidos = new Set(primero.opciones_para_ofrecer.map((h) => h.inicio));
    assert.ok(body.opciones_para_ofrecer.every((h) => !yaOfrecidos.has(h.inicio)));
  });

  await ok('no ofrece el bloque donde el asistente ya tiene cita (otro sponsor libre)', async () => {
    escenarioDisponibilidad = 'asistente-ocupado';
    const body = parse(await ejecutarConsultarDisponibilidadCita(argsDispo()));
    const inicios = body.opciones_para_ofrecer.map((h) => h.inicio);
    assert.ok(!inicios.includes('2026-10-07T11:00:00-06:00'));
    assert.deepStrictEqual(inicios, [
      '2026-10-07T10:30:00-06:00',
      '2026-10-07T14:00:00-06:00',
      '2026-10-08T10:30:00-06:00',
    ]);
  });

  await ok('las 15:00 están libres pero las casillas no las eligen si hay 14:00', async () => {
    escenarioDisponibilidad = 'con-14-y-15';
    const body = parse(
      await ejecutarConsultarDisponibilidadCita(argsDispo({ fecha: '2026-10-07' }))
    );
    const inicios = body.opciones_para_ofrecer.map((h) => h.inicio);
    assert.ok(!inicios.includes('2026-10-07T15:00:00-06:00'));
    assert.ok(inicios.includes('2026-10-07T14:00:00-06:00'));
    assert.ok(!body.horario_solicitado);
  });

  await ok('hora=15:00 mete ese bloque en las opciones y lo marca disponible', async () => {
    escenarioDisponibilidad = 'con-14-y-15';
    const body = parse(
      await ejecutarConsultarDisponibilidadCita(
        argsDispo({ fecha: '2026-10-07', hora: '15:00' })
      )
    );
    assert.strictEqual(body.opciones_para_ofrecer[0].inicio, '2026-10-07T15:00:00-06:00');
    assert.strictEqual(body.horario_solicitado.length, 1);
    assert.strictEqual(body.horario_solicitado[0].disponible, true);
    assert.ok(body.aviso.includes('SÍ está libre'));
  });

  await ok('sin asistente ni whatsapp → INVALID_INPUT', async () => {
    const r = await ejecutarConsultarDisponibilidadCita({ sponsorPageId: 'sponsor-1' });
    assert.strictEqual(r.isError, true);
    assert.strictEqual(parse(r).error, 'INVALID_INPUT');
  });

  await ok('sin sponsorPageId → INVALID_INPUT', async () => {
    const r = await ejecutarConsultarDisponibilidadCita({});
    assert.strictEqual(r.isError, true);
    assert.strictEqual(parse(r).error, 'INVALID_INPUT');
  });

  citasService.consultarSugeridasPorIdentificador = consultarOriginal;
  citasService.obtenerDisponibilidadSponsor = obtenerDisponibilidadOriginal;
  citasService.obtenerFechasEvento = obtenerFechasOriginal;
  if (fallos) process.exit(1);
  console.log('\n=== Resultado: TODOS PASARON ===\n');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
