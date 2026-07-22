const { evaluarChecklist } = require('../src/services/checklist.service');

const carlos = {
  categoria: 'Sponsor', esSpeaker: true, empresa: 'NovaTech Retail Solutions', rolPuesto: 'CEO',
  email: 'carlos.ejemplo@novatechretail.com', whatsapp: '+52 33 9876 5432',
  solucion: ['Plataforma eCommerce'], servicios: 'Plataforma de e-commerce y POS para retail de moda',
  etapaClienteBuscada: ['Escalamiento de e-commerce', 'Estrategia omnicanal avanzada'],
  puestosBuscados: ['Direccion General / Founder / CEO', 'Retail / Expansion de tiendas'],
  bio: 'Fundador de NovaTech, 10 años ayudando a marcas mexicanas de moda a vender en línea.',
  fotoSpeaker: '', sitioWebEmpresa: '', logoEmpresaSpeaker: '', instagram: '', linkedIn: '',
};

const laura = {
  categoria: 'Sponsor', esSpeaker: false, empresa: 'Textiles del Bajío', rolPuesto: 'Directora Comercial',
  email: 'laura.ejemplo@textilesdelbajio.mx', whatsapp: '+52 477 123 4567',
  solucion: ['Logistica / fulfillment'], servicios: 'Manufactura de calzado y maquila para marcas terceras',
  etapaClienteBuscada: ['Exploracion de e-commerce', 'Operacion basica de e-commerce'],
  puestosBuscados: ['Direccion General / Founder / CEO', 'Compras / Merchandising / Planeacion de producto'],
};

console.log('=== Carlos Medina (Sponsor + Speaker) ===');
console.log(JSON.stringify(evaluarChecklist(carlos), null, 2));
console.log('\n=== Laura Espinoza (solo Sponsor) ===');
console.log(JSON.stringify(evaluarChecklist(laura), null, 2));
