// tests/mocks/contactos.service.js — MOCK con datos en formato 2026.
// Actualizado el 30 de julio 2026 tras el rediseño de match directo:
// los asistentes ahora traen `area`, `solucionesBuscadas`, `quiereCitas1a1`
// y una `etapaDeNegocio` con los valores nuevos de Ticketópolis.

const CONTACTOS = [
  {
    id: 'carlos-medina',
    nombre: 'Carlos Medina (ejemplo)',
    categoria: 'Sponsor',
    empresa: 'NovaTech Retail Solutions',
    rolPuesto: 'CEO',
    servicios: 'Plataforma de e-commerce y POS para retail de moda',
    ticketTipo: null,
    etapaDeNegocio: null,
    // Este sponsor busca etapas avanzadas — Ana NO cae aquí, a propósito:
    // es el caso donde el filtro duro descarta correctamente.
    etapaClienteBuscada: ['Escalamiento de e-commerce', 'Estrategia omnicanal avanzada'],
    solucion: ['Plataforma eCommerce'],
    puestosBuscados: ['Direccion General / Founder / CEO', 'Retail / Expansion de tiendas'],
    clientesActuales: 'Liverpool, Coppel',
    clientesPotencialesDeseados: '',
    nivelPatrocinio: 'Diamante',
    citasMinimasPrometidas: 4,
    fuenteDato: 'Declarado',
    formatoRegistro: '2026',
  },
  {
    id: 'laura-espinoza',
    nombre: 'Laura Espinoza Rentería (ejemplo)',
    categoria: 'Sponsor',
    empresa: 'Textiles del Bajío',
    rolPuesto: 'Directora Comercial',
    servicios: 'Manufactura de calzado y maquila para marcas terceras',
    ticketTipo: null,
    etapaDeNegocio: null,
    // Usa "Venta por redes sociales" — el valor que necesita ALIAS para
    // cruzar con "Vendo principalmente por redes sociales" de Ana.
    etapaClienteBuscada: ['Venta por redes sociales'],
    solucion: ['Logistica / fulfillment'],
    puestosBuscados: ['Direccion General / Founder / CEO'],
    clientesActuales: 'Grupo Denim MX',
    clientesPotencialesDeseados: 'Boutique Marea',
    nivelPatrocinio: 'Oro',
    citasMinimasPrometidas: 2,
    fuenteDato: 'Inferido',
    formatoRegistro: '2026',
  },
  {
    id: 'ana-sofia-torres',
    nombre: 'Ana Sofía Torres (ejemplo)',
    categoria: 'Asistente',
    empresa: 'Boutique Marea',
    rolPuesto: 'Dueña',
    servicios: '',
    ticketTipo: 'Presencial',
    quiereCitas1a1: true,
    etapaDeNegocio: 'Vendo principalmente por redes sociales',
    area: 'Direccion General / Founder / CEO',
    solucionesBuscadas: ['Logistica / fulfillment'],
    otraSolucionBuscada: '',
    etapaClienteBuscada: [],
    solucion: [],
    puestosBuscados: [],
    clientesActuales: '',
    clientesPotencialesDeseados: '',
    nivelPatrocinio: null,
    citasMinimasPrometidas: 0,
    fuenteDato: 'Declarado',
    formatoRegistro: '2026',
    dadoDeBaja: false,
  },
];

/** Replica la elegibilidad real de la Capa 1 (ver contactos.service.js). */
function esElegibleParaCitas(c, incluirVirtual) {
  if (c.dadoDeBaja) return false;
  if (c.ticketTipo === 'Presencial VIP') return true;
  if (c.ticketTipo === 'Presencial') return c.quiereCitas1a1 === true;
  if (c.ticketTipo === 'Virtual') return incluirVirtual === true;
  return false; // Expo y cualquier otro
}

async function obtenerContacto(pageId) {
  const c = CONTACTOS.find((x) => x.id === pageId);
  if (!c) throw new Error(`[mock] contacto no encontrado: ${pageId}`);
  return c;
}

async function buscarAsistentesCandidatos({ etapasValidas, incluirVirtual = false }) {
  return CONTACTOS.filter((c) => {
    if (c.categoria !== 'Asistente') return false;
    if (!esElegibleParaCitas(c, incluirVirtual)) return false;
    if (etapasValidas && !etapasValidas.includes(c.etapaDeNegocio)) return false;
    return true;
  });
}

async function listarSponsorsActivos() {
  return CONTACTOS.filter((c) => c.categoria === 'Sponsor');
}

async function sugerirMatches({ sponsorPageId, asistentePageIds }) {
  console.log(`  [mock] escribiría Match Sugerido en ${sponsorPageId} -> [${asistentePageIds.join(', ')}]`);
  return { ok: true };
}

module.exports = { obtenerContacto, buscarAsistentesCandidatos, listarSponsorsActivos, sugerirMatches };
