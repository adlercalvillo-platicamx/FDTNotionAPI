// Respaldo Notion → R2. Mocks de Notion y S3; sin red.
//
//   node tests/notion-respaldo.manual-test.js

const assert = require('assert');
const zlib = require('zlib');
const path = require('path');
const {
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} = require('@aws-sdk/client-s3');

process.env.R2_ACCESS_KEY_ID = 'test-key';
process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
process.env.R2_BUCKET = 'fdt-respaldos-notion';
process.env.R2_ENDPOINT = 'https://example.r2.cloudflarestorage.com';
process.env.NOTION_CONTACTOS_DATA_SOURCE_ID = 'ds-contactos';
process.env.NOTION_CITAS_DATA_SOURCE_ID = 'ds-citas';
process.env.R2_RETENCION_DIAS = '14';

const notionPath = path.resolve(__dirname, '../src/utils/notion-client.js');
const servicePath = path.resolve(__dirname, '../src/services/notion-respaldo.service.js');

const llamadasNotion = [];
let paginasContactos = [];
let paginasCitas = [];

require.cache[notionPath] = {
  id: notionPath,
  filename: notionPath,
  loaded: true,
  exports: {
    async notionFetch(ruta, options = {}) {
      llamadasNotion.push({ ruta, method: options.method || 'GET' });
      if (ruta === '/data_sources/ds-contactos') {
        return { id: 'ds-contactos', title: [{ plain_text: 'Contactos' }], properties: { Nombre: { type: 'title' } } };
      }
      if (ruta === '/data_sources/ds-citas') {
        return { id: 'ds-citas', title: [{ plain_text: 'Citas' }], properties: { Estatus: { type: 'select' } } };
      }
      if (ruta === '/data_sources/ds-contactos/query') {
        const body = JSON.parse(options.body || '{}');
        if (!body.start_cursor) {
          return {
            results: paginasContactos.slice(0, 1),
            has_more: paginasContactos.length > 1,
            next_cursor: paginasContactos.length > 1 ? 'c2' : null,
          };
        }
        return { results: paginasContactos.slice(1), has_more: false };
      }
      if (ruta === '/data_sources/ds-citas/query') {
        return { results: paginasCitas, has_more: false };
      }
      if (ruta.startsWith('/views?')) {
        const ds = new URLSearchParams(ruta.slice(ruta.indexOf('?') + 1)).get('data_source_id');
        if (ds === 'ds-contactos') return { results: [{ id: 'v-co-1' }], has_more: false };
        if (ds === 'ds-citas') return { results: [{ id: 'v-ci-1' }], has_more: false };
        return { results: [], has_more: false };
      }
      if (ruta === '/views/v-co-1') {
        return { id: 'v-co-1', name: 'Raw contactos', type: 'table', data_source_id: 'ds-contactos', filter: null, sorts: [] };
      }
      if (ruta === '/views/v-ci-1') {
        return {
          id: 'v-ci-1',
          name: 'Confirmadas',
          type: 'table',
          data_source_id: 'ds-citas',
          filter: { property: 'Estatus', select: { equals: 'Confirmada' } },
          sorts: [],
        };
      }
      throw new Error(`ruta inesperada ${ruta}`);
    },
  },
};

delete require.cache[servicePath];
const { respaldarNotion, RespaldoError, sanitizarProperties } = require('../src/services/notion-respaldo.service');

function check(nombre, cond) {
  assert.ok(cond, nombre);
  console.log(`  ok  ${nombre}`);
}

async function casoSinCredenciales() {
  const prev = process.env.R2_BUCKET;
  delete process.env.R2_BUCKET;
  let caught;
  try {
    await respaldarNotion();
  } catch (e) {
    caught = e;
  }
  process.env.R2_BUCKET = prev;
  check('sin bucket lanza RESPALDO_NO_CONFIGURADO', caught instanceof RespaldoError && caught.code === 'RESPALDO_NO_CONFIGURADO');
  check('status 503', caught.status === 503);
}

async function casoFelizYRotacion() {
  llamadasNotion.length = 0;
  paginasContactos = [
    {
      id: 'p-a',
      created_time: '2026-09-01T00:00:00.000Z',
      last_edited_time: '2026-09-01T00:00:00.000Z',
      properties: {
        Nombre: { type: 'title', title: [{ plain_text: 'Ana' }] },
        Foto: {
          type: 'files',
          files: [{ name: 'cara.png', type: 'file', file: { url: 'https://secret.example/file' } }],
        },
      },
    },
    {
      id: 'p-b',
      created_time: '2026-09-02T00:00:00.000Z',
      last_edited_time: '2026-09-02T00:00:00.000Z',
      properties: { Nombre: { type: 'title', title: [{ plain_text: 'Beto' }] } },
    },
  ];
  paginasCitas = [
    {
      id: 'c-1',
      created_time: '2026-09-03T00:00:00.000Z',
      last_edited_time: '2026-09-03T00:00:00.000Z',
      properties: { Estatus: { type: 'select', select: { name: 'Confirmada' } } },
    },
  ];

  const enviados = [];
  const ahora = new Date('2026-09-23T09:00:00.000Z');
  const s3 = {
    async send(cmd) {
      if (cmd instanceof PutObjectCommand) {
        enviados.push(cmd.input);
        return {};
      }
      if (cmd instanceof ListObjectsV2Command) {
        return {
          Contents: [
            { Key: 'notion-fdt/viejo/contactos-citas.json.gz', LastModified: new Date('2026-08-01T00:00:00.000Z') },
            { Key: 'notion-fdt/nuevo/contactos-citas.json.gz', LastModified: ahora },
          ],
          IsTruncated: false,
        };
      }
      if (cmd instanceof DeleteObjectsCommand) {
        enviados.push({ delete: cmd.input.Delete.Objects });
        return {};
      }
      throw new Error(`comando S3 inesperado ${cmd.constructor.name}`);
    },
  };

  const r = await respaldarNotion({ s3, ahora });
  check('ok true', r.ok === true);
  check('key bajo notion-fdt/', r.key.startsWith('notion-fdt/') && r.key.endsWith('/contactos-citas.json.gz'));
  check('conteos 2 contactos 1 cita', r.conteos.contactos === 2 && r.conteos.citas === 1);
  check('retencion 14', r.retencionDias === 14);
  check('rotacion borra 1 viejo', r.rotacion.borrados === 1);
  check('Notion paginó contactos (schema + 2 queries)', llamadasNotion.filter((c) => c.ruta.includes('ds-contactos')).length >= 3);

  const put = enviados.find((e) => e.Body);
  check('PutObject gzip', put.ContentType === 'application/gzip');
  const json = JSON.parse(zlib.gunzipSync(put.Body).toString('utf8'));
  check('payload tiene 2 filas contactos', json.filas.contactos.length === 2);
  check('vistas 1 contactos 1 citas', json.vistas.contactos.length === 1 && json.vistas.citas[0].name === 'Confirmadas');
  check('conteos vistas', r.conteos.vistasContactos === 1 && r.conteos.vistasCitas === 1);
  const foto = json.filas.contactos[0].properties.Foto;
  check('files sin url', foto.files[0].name === 'cara.png' && foto.files[0].url === undefined && !JSON.stringify(foto).includes('secret.example'));
  check('delete solo el viejo', enviados.some((e) => e.delete && e.delete.length === 1 && e.delete[0].Key.includes('viejo')));
}

function casoSanitizar() {
  const limpio = sanitizarProperties({
    a: { type: 'rich_text', rich_text: [] },
    b: { type: 'files', files: [{ name: 'x', type: 'external', external: { url: 'https://x' } }] },
  });
  check('rich_text intacto', limpio.a.type === 'rich_text');
  check('external url no viaja', JSON.stringify(limpio.b).includes('https://x') === false);
}

async function main() {
  console.log('notion-respaldo.manual-test');
  await casoSinCredenciales();
  casoSanitizar();
  await casoFelizYRotacion();
  console.log('todos los checks ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
