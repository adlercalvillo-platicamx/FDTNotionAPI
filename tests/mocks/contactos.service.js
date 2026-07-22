// test-run/notion-contactos.service.js — MOCK con datos reales de Notion
// (recién actualizados hoy en los 3 contactos de ejemplo), no el archivo real.
// matchmaking.service.js no se modifica: solo se ejecuta contra esta versión
// simulada de su dependencia para poder correrlo sin red.

const CONTACTOS = [
  {
    id: 'carlos-medina',
    nombre: 'Carlos Medina (ejemplo)',
    categoria: 'Sponsor',
    empresa: 'NovaTech Retail Solutions',
    rolPuesto: 'CEO',
    servicios: 'Plataforma de e-commerce y POS para retail de moda',
    intencionComercial: 'Busca leads calificados y visibilidad de marca frente a retailers de moda.',
    ticketTipo: null,
    etapaDeNegocio: null,
    etapaClienteBuscada: ['Escalamiento de e-commerce', 'Estrategia omnicanal avanzada'],
    solucion: ['Plataforma eCommerce'],
    puestosBuscados: ['Direccion General / Founder / CEO', 'Retail / Expansion de tiendas'],
    clientesActuales: 'Liverpool, Coppel',
    clientesPotencialesDeseados: '',
    nivelPatrocinio: null,
    citasMinimasPrometidas: 6,
    fuenteDato: 'Declarado',
    esVip: false,
    matchSugerido: [],
  },
  {
    id: 'laura-espinoza',
    nombre: 'Laura Espinoza Rentería (ejemplo)',
    categoria: 'Sponsor',
    empresa: 'Textiles del Bajío',
    rolPuesto: 'Directora Comercial',
    servicios: 'Manufactura de calzado y maquila para marcas terceras',
    intencionComercial: 'Busca ampliar canales de distribución y encontrar marcas para maquila.',
    ticketTipo: null,
    etapaDeNegocio: null,
    etapaClienteBuscada: ['Exploracion de e-commerce', 'Operacion basica de e-commerce'],
    solucion: ['Logistica / fulfillment'],
    puestosBuscados: ['Direccion General / Founder / CEO', 'Compras / Merchandising / Planeacion de producto'],
    clientesActuales: 'Grupo Denim MX',
    clientesPotencialesDeseados: 'Boutique Marea', // <- nombra literalmente a Ana. Prueba "oro molido".
    nivelPatrocinio: 'Oro',
    citasMinimasPrometidas: 3,
    fuenteDato: 'Inferido',
    esVip: false,
    matchSugerido: [],
  },
  {
    id: 'ana-sofia-torres',
    nombre: 'Ana Sofía Torres (ejemplo)',
    categoria: 'Asistente',
    empresa: 'Boutique Marea',
    rolPuesto: 'Dueña',
    servicios: '',
    intencionComercial: 'Busca tecnología para digitalizar su tienda y proveedores de producción nacional.',
    ticketTipo: 'Presencial',
    etapaDeNegocio: 'Ya vendo en redes sociales - por lanzar e-commerce',
    etapaClienteBuscada: [],
    solucion: [],
    puestosBuscados: [],
    clientesActuales: '',
    clientesPotencialesDeseados: '',
    nivelPatrocinio: null,
    citasMinimasPrometidas: 0,
    fuenteDato: 'Declarado',
    esVip: false,
    matchSugerido: [],
  },
];

async function obtenerContacto(pageId) {
  const c = CONTACTOS.find((x) => x.id === pageId);
  if (!c) throw new Error(`[mock] contacto no encontrado: ${pageId}`);
  return c;
}

async function buscarAsistentesCandidatos({ etapasValidas }) {
  return CONTACTOS.filter((c) => {
    if (c.categoria !== 'Asistente') return false;
    if (c.ticketTipo === 'Expo') return false;
    if (etapasValidas && !etapasValidas.includes(c.etapaDeNegocio)) return false;
    return true;
  });
}

async function sugerirMatches({ sponsorPageId, asistentePageIds }) {
  console.log(`  [mock] escribiría Match Sugerido en ${sponsorPageId} -> [${asistentePageIds.join(', ')}]`);
  return { ok: true };
}

module.exports = { obtenerContacto, buscarAsistentesCandidatos, sugerirMatches };
