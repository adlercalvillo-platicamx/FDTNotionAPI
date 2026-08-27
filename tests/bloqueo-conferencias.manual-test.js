// Bloqueo de conferencias: ocupa al sponsor, no resta mesas; Comite/Team
// no entra a matchmaking aunque tenga tamaño Grande.
//
//   node tests/bloqueo-conferencias.manual-test.js

const assert = require('assert');

process.env.NOTION_CITAS_DATA_SOURCE_ID = 'fake-bloqueo-conferencias';
process.env.NOTION_CONTACTO_BLOQUEO_AGENDA_ID = '3c990fe2-7345-8121-92a6-f9e09a540d2e';
process.env.CITAS_FECHAS_EVENTO = '2026-10-07,2026-10-08';
process.env.CITAS_HORA_INICIO_2026_10_07 = '10:30';
process.env.CITAS_HORA_FIN_2026_10_07 = '19:00';
process.env.CITAS_HORA_INICIO_2026_10_08 = '09:00';
process.env.CITAS_HORA_FIN_2026_10_08 = '18:00';
process.env.CITAS_DURACION_BLOQUE_MINUTOS = '30';
process.env.CITAS_ZONA_HORARIA_OFFSET = '-06:00';

const BLOQUEO = process.env.NOTION_CONTACTO_BLOQUEO_AGENDA_ID;
const BLIP = 'sponsor-blip';
const OTRO = 'sponsor-onceavo';
const INICIO = '2026-10-07T12:00:00-06:00';

const {
  construirIndiceCitasConfirmadas,
  bloquesDisponiblesParaSponsor,
  armarBloqueDisponibilidad,
  requireContactoBloqueoAgenda,
  contactoBloqueoAgendaId,
  CONTACTO_BLOQUEO_AGENDA_ID_DEFAULT,
} = require('../src/services/citas.service');

// data sources reales de Laura (14-ago) — solo para simular el ambiente.
const CITAS_PRODUCCION = '3b162dda199a803fbd71fb15af9dc9a4';
const CONTACTOS_PRODUCCION = '3b162dda199a80a5831eefa14b9748bf';
const BLOQUEO_PRODUCCION_HIPOTETICO = '3d000000-0000-4000-8000-000000000001';

function fila({ inicio, sponsorId, asistentePageId }) {
  return { inicio, sponsorId, asistentePageId };
}

function casoIndiceYDisponibilidad() {
  const reales = [];
  for (let i = 0; i < 10; i += 1) {
    reales.push(fila({ inicio: INICIO, sponsorId: `real-${i}`, asistentePageId: `asistente-${i}` }));
  }
  const indice = construirIndiceCitasConfirmadas([
    ...reales,
    fila({ inicio: INICIO, sponsorId: BLIP, asistentePageId: BLOQUEO }),
  ]);
  const entrada = indice.get(INICIO);
  assert.strictEqual(entrada.count, 10, 'el bloqueo no debe contar como mesa');
  assert.ok(entrada.sponsorIds.has(BLIP), 'Blip sí queda ocupado por el bloqueo');

  const paraBlip = armarBloqueDisponibilidad({
    inicio: INICIO,
    sponsorOcupado: entrada.sponsorIds.has(BLIP),
    citasEnBloque: entrada.count,
  });
  assert.strictEqual(paraBlip.disponible, false);
  assert.strictEqual(paraBlip.motivo, 'SPONSOR_YA_OCUPADO');

  const paraOtro = armarBloqueDisponibilidad({
    inicio: INICIO,
    sponsorOcupado: entrada.sponsorIds.has(OTRO),
    citasEnBloque: entrada.count,
  });
  assert.strictEqual(paraOtro.disponible, true);
  assert.strictEqual(paraOtro.motivo, null);
  assert.strictEqual(paraOtro.mesas_ocupadas, 10);
  assert.strictEqual(paraOtro.mesas_libres, 1);

  const libresOtro = bloquesDisponiblesParaSponsor({
    sponsorPageId: OTRO,
    indiceConfirmadas: indice,
  });
  assert.ok(libresOtro.some((b) => b.inicio === INICIO), 'un 11.º sponsor distinto sí puede usar el bloque');

  const libresBlip = bloquesDisponiblesParaSponsor({
    sponsorPageId: BLIP,
    indiceConfirmadas: indice,
  });
  assert.ok(!libresBlip.some((b) => b.inicio === INICIO), 'Blip no ve libre su horario de conferencia');
}

async function casoMatchmakingExcluyeComite() {
  const contactosPath = require.resolve('../src/services/contactos.service');
  const citasPath = require.resolve('../src/services/citas.service');
  const servicePath = require.resolve('../src/services/matchmaking.service');

  const sponsor = {
    id: 'sponsor-1',
    nombre: 'Sponsor Test',
    categoria: 'Sponsor',
    empresa: 'Acme',
    nivelPatrocinio: 'Oro',
    citasMinimasPrometidas: 2,
    etapaClienteBuscada: [],
    clientesActuales: '',
    clientesPotencialesDeseados: '',
    puestosBuscados: [],
    solucion: [],
  };

  const asistenteReal = {
    id: 'asistente-grande',
    nombre: 'Marca Grande',
    empresa: 'Marca Grande',
    categoria: 'Asistente',
    ticketTipo: 'Virtual',
    tamanoNegocio: 'Grande - más de 250 empleados',
  };
  const bloqueoAgenda = {
    id: BLOQUEO,
    nombre: 'Bloqueo de Agenda (Programa del Evento)',
    empresa: '',
    categoria: 'Comite/Team',
    ticketTipo: 'Virtual',
    tamanoNegocio: 'Grande - más de 250 empleados',
  };

  require.cache[contactosPath] = {
    id: contactosPath,
    filename: contactosPath,
    loaded: true,
    exports: {
      async obtenerContacto(id) {
        if (id === sponsor.id) return sponsor;
        return [asistenteReal, bloqueoAgenda].find((a) => a.id === id);
      },
      async buscarAsistentesCandidatos() {
        return [asistenteReal, bloqueoAgenda];
      },
    },
  };
  require.cache[citasPath] = {
    id: citasPath,
    filename: citasPath,
    loaded: true,
    exports: {
      async existeCitaActivaEntre() {
        return false;
      },
      async contarCitasConfirmadasPorSponsor() {
        return 0;
      },
    },
  };
  delete require.cache[servicePath];
  const { sugerirMatchesParaSponsor } = require('../src/services/matchmaking.service');
  const r = await sugerirMatchesParaSponsor(sponsor.id, { topN: 20, escribirEnNotion: false });
  const ids = r.sugerencias.map((s) => s.id);
  assert.deepStrictEqual(ids, ['asistente-grande']);
  assert.ok(!ids.includes(BLOQUEO));
}

/**
 * Corre `fn` con el ambiente de env dado y restaura al terminar, para no
 * contaminar los otros casos (el service lee process.env en cada llamada).
 */
function conEnv(vars, fn) {
  const previo = {};
  for (const [clave, valor] of Object.entries(vars)) {
    previo[clave] = process.env[clave];
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
  try {
    return fn();
  } finally {
    for (const [clave, valor] of Object.entries(previo)) {
      if (valor === undefined) delete process.env[clave];
      else process.env[clave] = valor;
    }
  }
}

function casoProduccionSinVariableFalla() {
  const base = {
    NOTION_CITAS_DATA_SOURCE_ID: CITAS_PRODUCCION,
    NOTION_CONTACTOS_DATA_SOURCE_ID: CONTACTOS_PRODUCCION,
  };

  for (const [descripcion, valor] of [
    ['sin configurar', undefined],
    ['con el default de pruebas', CONTACTO_BLOQUEO_AGENDA_ID_DEFAULT],
    ['vacía (exclusión apagada)', ''],
  ]) {
    conEnv({ ...base, NOTION_CONTACTO_BLOQUEO_AGENDA_ID: valor }, () => {
      assert.throws(
        () => requireContactoBloqueoAgenda(),
        (err) =>
          err.status === 503 && /NOTION_CONTACTO_BLOQUEO_AGENDA_ID/.test(err.message),
        `producción ${descripcion} debe fallar explícito`
      );
      // Las funciones que consumen la variable también fallan, no siguen en silencio.
      assert.throws(() => contactoBloqueoAgendaId(), /NOTION_CONTACTO_BLOQUEO_AGENDA_ID/);
    });
  }
}

function casoProduccionConVariableFunciona() {
  conEnv(
    {
      NOTION_CITAS_DATA_SOURCE_ID: CITAS_PRODUCCION,
      NOTION_CONTACTOS_DATA_SOURCE_ID: CONTACTOS_PRODUCCION,
      NOTION_CONTACTO_BLOQUEO_AGENDA_ID: BLOQUEO_PRODUCCION_HIPOTETICO,
    },
    () => {
      requireContactoBloqueoAgenda();
      assert.strictEqual(contactoBloqueoAgendaId(), BLOQUEO_PRODUCCION_HIPOTETICO);
    }
  );
}

function casoPruebasNoCambia() {
  // Tal cual corre hoy el backend: data sources de pruebas, con y sin variable.
  conEnv({ NOTION_CONTACTO_BLOQUEO_AGENDA_ID: undefined }, () => {
    requireContactoBloqueoAgenda();
    assert.strictEqual(contactoBloqueoAgendaId(), CONTACTO_BLOQUEO_AGENDA_ID_DEFAULT);
  });
  conEnv({ NOTION_CONTACTO_BLOQUEO_AGENDA_ID: '' }, () => {
    requireContactoBloqueoAgenda();
    assert.strictEqual(contactoBloqueoAgendaId(), null);
  });
  assert.strictEqual(contactoBloqueoAgendaId(), CONTACTO_BLOQUEO_AGENDA_ID_DEFAULT);
}

async function main() {
  casoIndiceYDisponibilidad();
  console.log('✅ Bloqueo de Blip a las 12:00: SPONSOR_YA_OCUPADO; 10 citas reales + bloqueo = 10 mesas; otro sponsor sí agenda.');
  casoProduccionSinVariableFalla();
  console.log('✅ Producción sin variable / con el default de pruebas / vacía → error 503 explícito.');
  casoProduccionConVariableFunciona();
  console.log('✅ Producción con el page_id real de Laura → funciona normal.');
  casoPruebasNoCambia();
  console.log('✅ Workspace de pruebas: sigue usando el default sin fallar (sin cambios).');
  await casoMatchmakingExcluyeComite();
  console.log('✅ Comite/Team (Bloqueo de Agenda) no sale como candidato aunque tenga tamaño Grande.');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
