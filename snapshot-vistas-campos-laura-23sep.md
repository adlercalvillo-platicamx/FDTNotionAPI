# Snapshot vistas y campos — Notion Laura (23sep 2026)

Handoff de estructura, no de filas. Código/API gana si esto se desactualiza.
Generado 2026-09-24T05:00:23.171Z (solo GET). Contactos `3b162dda-199a-8029-8d58-000b6d1fed37`, Citas `3b162dda-199a-8053-8098-000b00916893`.

JSON completo local (gitignore): `.local-backups/schema-vistas-laura-23sep.json`.
Desde el commit de esta noche, el gzip diario de R2 (`POST /notion/respaldar`) también lleva `schema` + `vistas` + `filas`.
Recrear vistas por API es posible; fórmulas que cruzan relaciones a veces no.

## Contactos FDT: 90 campos

| Campo | Detalle |
|---|---|
| Actividades Incluidas | multi_select · Otro |
| Area | select · Direccion General / Founder / CEO, Comercial / Ventas / Business Development, Marketing / Branding / Comunicacion / PR, eCommerce / Canal Digital / Omnicanal, Retail / Expansion de tiendas, Compras / Merchandising / Planeacion de producto, Operaciones / Logistica / Supply Chain, Tecnologia / Innovacion / Transformacion Digital, Diseno / Desarrollo de Producto, Consultoria / Servicios para la industria, Otro |
| Bio | rich_text |
| Boletos Individuales Incluidos | rich_text |
| Cantidad | number · number |
| Caracteristicas | rich_text |
| Categoria | select · Sponsor, Asistente, Aliado, Prensa, Comite/Team |
| Checklist Completado | checkbox |
| Citas (relacional) | relation · ds=3b162dda-199a-8053-8098-000b00916893 · dual=undefined |
| Citas Aprobadas (Count) | formula · prop("Citas (relacional)") .filter(current.prop("Estatus") == "Aprobado") .length() |
| Citas como asistente | relation · ds=3b162dda-199a-8053-8098-000b00916893 · dual=undefined |
| Citas Confirmadas (Count) | formula · prop("Citas (relacional)") .filter(   and(     or(       current.prop("Estatus") == "Confirmada",       current.prop("Estatus") == "Confirmada sin notificar",       current.prop("Estatus") == "Completada"     ),     current.prop("Contacto Principal").map(current.prop("Nombre")).join("") != "Bloqueo de Agenda (Programa del Evento)"   ) ) .length() |
| Citas Confirmadas Asistente (Count) | formula · prop("Citas Confirmadas Asistente (rollup)") |
| Citas Confirmadas Asistente (rollup) | rollup · Citas como asistente → Confirmada asistente (1/0) (sum) |
| Citas Faltantes | formula · max(0, toNumber(prop("Citas Minimas Prometidas")) - toNumber(prop("Citas Confirmadas (Count)"))) |
| Citas Minimas Prometidas | number · number |
| Ciudad | rich_text |
| Clientes Actuales | rich_text |
| Clientes Potenciales Deseados | rich_text |
| Codigo Promocion | rich_text |
| Cupo Citas (rollup) | rollup · Citas como asistente → En cupo (1/0) (sum) |
| Cupo Citas 1a1 (asistente) | formula · prop("Cupo Citas (rollup)") |
| Dado de Baja | checkbox |
| Datos Facturacion | rich_text |
| Detalle Checklist | rich_text |
| Email | email |
| Empresa | rich_text |
| Es Speaker | checkbox |
| Estado Follow-up 72h | select · En curso, Enviado, Falló |
| Estado Lastcall | select · En curso, Enviado, Falló |
| Estado Web (Exa) | select · Con web, Sin web |
| Estatus Citas (rollup) | rollup · Citas (relacional) → Estatus (show_original) |
| Estatus Ticketopolis | rich_text |
| Etapa Cliente Buscada | multi_select · Exploracion de e-commerce, Operacion basica de e-commerce, Escalamiento de e-commerce, Estrategia omnicanal avanzada, Venta por redes sociales, Grande, Mediana, Pequeña, Micro |
| Etapa de Negocio | select · Exploracion de e-commerce, Operacion basica de e-commerce, Escalamiento de e-commerce, Estrategia omnicanal avanzada, Vendo principalmente por redes sociales |
| Etapa de Negocio (Legacy) | select · Por lanzar mi marca o negocio, Ya vendo en redes sociales - por lanzar e-commerce, Ya tengo mi e-commerce propio y quiero crecer ventas, Ya tengo tienda en linea - quiero mas rentabilidad, Ninguna de las anteriores |
| Fecha Autorizacion | date |
| Fecha Follow-up 72h | date |
| Fecha Lastcall | date |
| Fecha Reservacion | date |
| Fecha Respuesta Oferta Inicial | date |
| Fecha Última Campaña | date |
| Fecha Ultimo Enriquecimiento | date |
| Folio Boleto | rich_text |
| Folio Reservacion | rich_text |
| Formato Registro | select · 2026, Legacy pre-2026 |
| Foto Speaker | url |
| Fuente | select · Ticketopolis, Prospeccion Agente 3, Referido, Importacion Historica |
| Fuente del Dato ICP/Intencion | select · Declarado, Inferido, Sin dato |
| Giro / Industria | select · Marca de moda / Fashion brand (ropa - calzado - accesorios - belleza), Retailer / tienda multimarca / Marketplace, Proveedor de tecnologia para eCommerce, Agencia de marketing / Consultoria / Servicios digitales, Logistica / fulfillment / ultima milla, Pagos / fintech, Manufactura / produccion / sourcing, Medios de comunicacion / contenido, Camara / asociacion / organizacion de industria, Academia / universidad |
| Giro Detectado (Exa) | rich_text |
| ICP Moda/Ecommerce | select · Sí, No, Ambiguo |
| Importe Pagado | number · number |
| Incluye Entrada Evento | select · Sí, No |
| Intentos Enriquecimiento (Exa) | number · number |
| LinkedIn/Instagram | rich_text |
| Logo Empresa Speaker | url |
| Madurez Ecommerce (Exa) | rich_text |
| Madurez Negocio (Exa) | select · Temprano, PyME, Consolidado |
| Modelo de Negocio (Exa) | select · B2B, B2C, D2C, Agencia de servicios, Sin determinar |
| Nivel de Patrocinio | select · Principal, Diamante, Cristal, Oro, Bronce |
| Nombre | title |
| Nombre Asistente 2 | rich_text |
| Nombre Asistente 3 | rich_text |
| Nombre Asistente 4 | rich_text |
| Otra Solucion Buscada | rich_text |
| Otra Solucion Ofrecida | rich_text |
| Pendientes / Notas | rich_text |
| Presencia Digital (Exa) | rich_text |
| Puestos Buscados | multi_select · Direccion General / Founder / CEO, Comercial / Ventas / Business Development, Marketing / Branding / Comunicacion / PR, eCommerce / Canal Digital / Omnicanal, Retail / Expansion de tiendas, Compras / Merchandising / Planeacion de producto, Operaciones / Logistica / Supply Chain, Tecnologia / Innovacion / Transformacion Digital, Diseno / Desarrollo de Producto, Consultoria / Servicios para la industria, Otro |
| Quiere Citas 1a1 | select · Sí, No |
| Rango Faltantes | formula · if(prop("Citas Faltantes") <= 0, "Al día", if(prop("Citas Faltantes") <= 3, "1-3 faltantes", "4+ faltantes")) |
| Reactivaciones Enviadas | number · number |
| Recordatorio Evento Enviado | checkbox |
| Respondió Oferta Inicial | checkbox |
| Revendedor Agente | rich_text |
| Revendedor Correo | email |
| Revendedor Empresa | rich_text |
| Rol / Puesto | rich_text |
| Servicios / Producto | rich_text |
| Sitio Web Empresa | url |
| Solucion | multi_select · Analitica / data, CRM / automatizacion, Customer experience, Estrategia de marketing digital, Inteligencia artificial, Internacionalizacion, Logistica / fulfillment, Marketplaces, Omnichannel, Pagos, Performance marketing, Plataforma eCommerce, Aplicacion movil (desarrollo), Programas de lealtad, Otro |
| Soluciones Buscadas | multi_select · Analitica / data, CRM / automatizacion, Customer experience, Estrategia de marketing digital, Inteligencia artificial, Internacionalizacion, Logistica / fulfillment, Marketplaces, Omnichannel, Pagos, Performance marketing, Plataforma eCommerce, Aplicacion movil (desarrollo), Programas de lealtad |
| Tamaño de Negocio | rich_text |
| Ticket / Tipo Asistencia | select · Virtual, Presencial, Presencial VIP, Expo, Speaker |
| Última Campaña Enviada | select · A - Primera oferta, B - Más opciones, C - Reactivación, C1 - Reactivación, C2 - Reactivación, Oferta inicial |
| Vencimiento | date |
| Web / Redes | rich_text |
| Webhook enviado | checkbox |
| WhatsApp | phone_number |

## Citas FDT: 63 campos

| Campo | Detalle |
|---|---|
| Área (asistente) | rollup · Contacto Principal → Area (show_original) |
| Bloque Horario | formula · formatDate(dateSubtract(prop("Fecha y Hora"), minute(prop("Fecha y Hora")) % 30, "minutes"), "MMM D — HH:mm") |
| Campaña Asistente | rollup · Contacto Principal → Última Campaña Enviada (show_original) |
| Campaña Enviada | checkbox |
| Categoria Sponsor | rollup · Contacto Match → Nivel de Patrocinio (show_original) |
| Check-in Realizado | checkbox |
| Cita Origen Cancelada | relation · ds=3b162dda-199a-8053-8098-000b00916893 |
| Citas Aprobadas (sponsor) | rollup · Contacto Match → Citas Aprobadas (Count) (show_original) |
| Citas Faltantes (sponsor) | rollup · Contacto Match → Citas Faltantes (show_original) |
| Clientes Potenciales Deseados (sponsor) | rollup · Contacto Match → Clientes Potenciales Deseados (show_original) |
| Confirmada asistente (1/0) | formula · if(or(prop("Estatus") == "Confirmada", prop("Estatus") == "Confirmada sin notificar", prop("Estatus") == "Completada"), 1, 0) |
| Confirmadas asistente | rollup · Contacto Principal → Citas Confirmadas Asistente (Count) (sum) |
| Contacto Match | relation · ds=3b162dda-199a-8029-8d58-000b6d1fed37 · dual=undefined |
| Contacto Principal | relation · ds=3b162dda-199a-8029-8d58-000b6d1fed37 · dual=undefined |
| Creado | created_time |
| Cuenta para faltantes | formula · if(   and(     or(       prop("Estatus") == "Confirmada",       prop("Estatus") == "Confirmada sin notificar"     ),     prop("Contacto Principal").map(current.prop("Nombre")).join("") != "Bloqueo de Agenda (Programa del Evento)"   ),   1,   0 ) |
| Cupo asistente | rollup · Contacto Principal → Cupo Citas 1a1 (asistente) (sum) |
| Empresa (asistente) | rollup · Contacto Principal → Empresa (show_original) |
| Empresa Sponsor | rollup · Contacto Match → Empresa (show_original) |
| En cupo (1/0) | formula · if(or(prop("Estatus") == "Aprobado", prop("Estatus") == "Confirmada", prop("Estatus") == "Confirmada sin notificar", prop("Estatus") == "Completada"), 1, 0) |
| Estado Enriquecimiento Match | select · En curso, Completado, Falló |
| Estado Envío Campaña | select · Pendiente, En curso, Enviada, Falló |
| Estado Recordatorio 15min | select · En curso, Enviado, Falló, Omitido |
| Estado Recordatorio 2h | select · En curso, Enviado, Falló, Omitido |
| Estado Web Exa (asistente) | rollup · Contacto Principal → Estado Web (Exa) (show_original) |
| Estatus | select · Sugerido, Aprobado, Rechazado, Pendiente, Pendiente Calendar, Confirmada, Confirmada sin notificar, Cancelada, Completada, No-show, Fallida |
| Estatus Recordatorio | select · Confirmada, Reagendada, Cancelada |
| Explicación Match Ideal | rich_text |
| Fecha Enriquecimiento Match | date |
| Fecha Inicio Envío | date |
| Fecha Recordatorio 15min | date |
| Fecha Recordatorio 2h | date |
| Fecha y Hora | date |
| Foto Check-in | files |
| Giro / Industria (asistente) | rollup · Contacto Principal → Giro / Industria (show_original) |
| Giro Detectado Exa (asistente) | rollup · Contacto Principal → Giro Detectado (Exa) (show_original) |
| Google Meet Event ID | rich_text |
| Google Meet URL | url |
| ICP Moda/Ecommerce (asistente) | rollup · Contacto Principal → ICP Moda/Ecommerce (show_original) |
| Idempotency Key | rich_text |
| Intentos Enriquecimiento Match | number · number |
| Intentos Envio Email | number · number |
| Intentos Google Meet | number · number |
| Madurez Ecommerce Exa (asistente) | rollup · Contacto Principal → Madurez Ecommerce (Exa) (show_original) |
| Madurez Negocio Exa (asistente) | rollup · Contacto Principal → Madurez Negocio (Exa) (show_original) |
| Match Ideal Sponsor | select · Sí, No, Ambiguo |
| Mesa / Ubicacion | rich_text |
| Modelo Negocio Exa (asistente) | rollup · Contacto Principal → Modelo de Negocio (Exa) (show_original) |
| Nombre | title |
| Notas | rich_text |
| Notas Envio Email | rich_text |
| Notas Google Meet | rich_text |
| Notas Recordatorio 15min | rich_text |
| Notas Recordatorio 2h | rich_text |
| Presencia Digital Exa (asistente) | rollup · Contacto Principal → Presencia Digital (Exa) (show_original) |
| Puesto (asistente) | rollup · Contacto Principal → Rol / Puesto (show_original) |
| Reprogramada | checkbox |
| Reprogramada Horario Original | date |
| Score (de Notas) | formula · if(contains(prop("Notas"), "Score: "), toNumber(replace(split(prop("Notas"), ".").first(), "Score: ", "")), 0) |
| Servicios / Producto (sponsor) | rollup · Contacto Match → Servicios / Producto (show_original) |
| Tamaño Negocio (asistente) | rollup · Contacto Principal → Tamaño de Negocio (show_original) |
| Tipo boleto (asistente) | rollup · Contacto Principal → Ticket / Tipo Asistencia (show_original) |
| WhatsApp (asistente) | rollup · Contacto Principal → WhatsApp (show_original) |

## Vistas de Contactos: 11 vistas

### Asistentes — Citas 1a1 `table`

- id: `3bc62dda-199a-810b-842f-000c549b2050`
- filtro: `Categoria equals "Asistente"`
- sort: Nombre ascending
- group_by: (sin group_by)
- columnas visibles (30, 59 ocultas): Nombre · Empresa · Rol / Puesto · Email · WhatsApp · Ticket / Tipo Asistencia · Incluye Entrada Evento · Formato Registro · Estatus Ticketopolis · Tamaño de Negocio · Giro / Industria · Quiere Citas 1a1 · Area · Soluciones Buscadas · Otra Solucion Buscada · Cupo Citas 1a1 (asistente) · Pendientes / Notas · Citas Confirmadas Asistente (Count) · Última Campaña Enviada · Fecha Última Campaña · Respondió Oferta Inicial · Fecha Respuesta Oferta Inicial · Reactivaciones Enviadas · Estado Follow-up 72h · Fecha Follow-up 72h · Estado Lastcall · Fecha Lastcall · Recordatorio Evento Enviado · Folio Boleto · Folio Reservacion

### Comité / Team `table`

- id: `3bc62dda-199a-81bc-b021-000c07c1b709`
- filtro: `Categoria equals "Comite/Team"`
- sort: Nombre ascending
- group_by: (sin group_by)
- columnas visibles (7, 74 ocultas): Nombre · Empresa · Rol / Puesto · Email · WhatsApp · Ciudad · Pendientes / Notas

### Enriquecimiento — Exa `table`

- id: `3bc62dda-199a-81d0-ae6b-000c4c6e89c7`
- filtro: `(sin filtro)`
- sort: Nombre ascending, Intentos Enriquecimiento (Exa) descending
- group_by: (sin group_by)
- columnas visibles (17, 64 ocultas): Nombre · Empresa · Categoria · Tamaño de Negocio · ICP Moda/Ecommerce · Giro Detectado (Exa) · Modelo de Negocio (Exa) · Madurez Ecommerce (Exa) · Madurez Negocio (Exa) · Presencia Digital (Exa) · Estado Web (Exa) · Intentos Enriquecimiento (Exa) · Fecha Ultimo Enriquecimiento · Sitio Web Empresa · Web / Redes · Dado de Baja · Webhook enviado

### Prensa `table`

- id: `3bc62dda-199a-81c0-afb5-000cd67f1dde`
- filtro: `Categoria equals "Prensa"`
- sort: Nombre ascending
- group_by: (sin group_by)
- columnas visibles (9, 72 ocultas): Nombre · Empresa · Rol / Puesto · Email · WhatsApp · Web / Redes · Fuente · Dado de Baja · Pendientes / Notas

### Raw — todos los campos `table`

- id: `3d162dda-199a-818b-b1df-000cb04490b2`
- filtro: `(sin filtro)`
- sort: (sin sort)
- group_by: (sin group_by)
- columnas visibles (90, 0 ocultas): Nombre · Empresa · Solucion · Etapa Cliente Buscada · Estado Lastcall · Nombre Asistente 2 · Respondió Oferta Inicial · Vencimiento · Area · Incluye Entrada Evento · Nombre Asistente 3 · Fecha Lastcall · Clientes Potenciales Deseados · ICP Moda/Ecommerce · Intentos Enriquecimiento (Exa) · Giro Detectado (Exa) · Codigo Promocion · Actividades Incluidas · Importe Pagado · Presencia Digital (Exa) · Citas Confirmadas (Count) · Reactivaciones Enviadas · Otra Solucion Buscada · Folio Boleto · Recordatorio Evento Enviado · Web / Redes · Tamaño de Negocio · Categoria · Revendedor Correo · Etapa de Negocio (Legacy) · Citas Confirmadas Asistente (rollup) · Pendientes / Notas · Ciudad · Etapa de Negocio · Estado Web (Exa) · Datos Facturacion · Giro / Industria · Cupo Citas 1a1 (asistente) · Citas Confirmadas Asistente (Count) · Cantidad · Fecha Última Campaña · Clientes Actuales · Última Campaña Enviada · Estatus Citas (rollup) · Detalle Checklist · Foto Speaker · Rol / Puesto · Dado de Baja · Modelo de Negocio (Exa) · Soluciones Buscadas · Madurez Ecommerce (Exa) · Puestos Buscados · Otra Solucion Ofrecida · Fecha Ultimo Enriquecimiento · Formato Registro · Bio · Checklist Completado · Citas Minimas Prometidas · Quiere Citas 1a1 · Madurez Negocio (Exa) · Nivel de Patrocinio · Servicios / Producto · Citas Faltantes · Boletos Individuales Incluidos · Nombre Asistente 4 · Sitio Web Empresa · Estado Follow-up 72h · Caracteristicas · Logo Empresa Speaker · Revendedor Empresa · Fecha Autorizacion · WhatsApp · LinkedIn/Instagram · Cupo Citas (rollup) · Citas (relacional) · Ticket / Tipo Asistencia · Revendedor Agente · Fecha Reservacion · Estatus Ticketopolis · Es Speaker · Fuente del Dato ICP/Intencion · Fecha Respuesta Oferta Inicial · Rango Faltantes · Fuente · Webhook enviado · Citas como asistente · Folio Reservacion · Fecha Follow-up 72h · Email · Citas Aprobadas (Count)

### Revisión manual (enriquecimiento agotado) `table`

- id: `3d662dda-199a-817b-aa78-000c227a3e40`
- filtro: `Intentos Enriquecimiento (Exa) greater_than_or_equal_to 3`
- sort: Empresa ascending
- group_by: (sin group_by)
- columnas visibles (8, 81 ocultas): Nombre · Empresa · Categoria · Sitio Web Empresa · Web / Redes · ICP Moda/Ecommerce · Intentos Enriquecimiento (Exa) · Fecha Ultimo Enriquecimiento

### Speakers — Programa `table`

- id: `3bc62dda-199a-8160-b691-000c7bd96fb9`
- filtro: `(Es Speaker equals true OR Ticket / Tipo Asistencia equals "Speaker")`
- sort: Empresa ascending, Nombre ascending
- group_by: (sin group_by)
- columnas visibles (17, 64 ocultas): Nombre · Empresa · Categoria · Ticket / Tipo Asistencia · Nivel de Patrocinio · Es Speaker · Rol / Puesto · Bio · Foto Speaker · Logo Empresa Speaker · Sitio Web Empresa · LinkedIn/Instagram · Checklist Completado · Detalle Checklist · Email · WhatsApp · Pendientes / Notas

### Sponsors — Operación `table`

- id: `3bc62dda-199a-8112-a7e5-000c4ccc6b2c`
- filtro: `Categoria equals "Sponsor"`
- sort: Citas Faltantes descending, Empresa ascending
- group_by: (sin group_by)
- columnas visibles (21, 69 ocultas): Nombre · Empresa · Rol / Puesto · Nivel de Patrocinio · Citas Minimas Prometidas · Citas Confirmadas (Count) · Citas Faltantes · Rango Faltantes · Solucion · Otra Solucion Ofrecida · Etapa Cliente Buscada · Puestos Buscados · Clientes Potenciales Deseados · Clientes Actuales · Servicios / Producto · Checklist Completado · Detalle Checklist · Email · WhatsApp · Pendientes / Notas · Citas Aprobadas (Count)

### Sponsors por faltantes `board`

- id: `3cf62dda-199a-817a-86d6-000cbc3f6b47`
- filtro: `Categoria equals "Sponsor"`
- sort: Citas Faltantes descending, Empresa ascending
- group_by: Rango Faltantes (hide_empty)
- columnas visibles (6, 84 ocultas): Nombre · Empresa · Nivel de Patrocinio · Citas Confirmadas (Count) · Citas Faltantes · Citas Aprobadas (Count)

### Todos — Administración `table`

- id: `3b162dda-199a-8065-bda6-000c7ec7f50c`
- filtro: `(sin filtro)`
- sort: Nombre ascending
- group_by: (sin group_by)
- columnas visibles (12, 69 ocultas): Nombre · Empresa · Categoria · Rol / Puesto · Email · WhatsApp · Ticket / Tipo Asistencia · Formato Registro · Estatus Ticketopolis · Fecha Autorizacion · Dado de Baja · Pendientes / Notas

### VIP — Asistentes `table`

- id: `3bc62dda-199a-817b-8ed8-000c1b14a18b`
- filtro: `Ticket / Tipo Asistencia equals "Presencial VIP"`
- sort: Nombre ascending
- group_by: (sin group_by)
- columnas visibles (13, 68 ocultas): Nombre · Empresa · Rol / Puesto · Ticket / Tipo Asistencia · Tamaño de Negocio · Giro / Industria · Quiere Citas 1a1 · Area · Cupo Citas 1a1 (asistente) · Última Campaña Enviada · Email · WhatsApp · Pendientes / Notas

## Vistas de Citas: 28 vistas

### Aprobadas con oferta (por asistente) `board`

- id: `3d062dda-199a-81c6-88bb-000c19ba9a5b`
- filtro: `(Estatus equals "Aprobado" AND Campaña Asistente any {"rich_text":{"is_not_empty":true}} AND Contacto Principal does_not_contain "3cf62dda-199a-81fa-85fc-c32e95485c04")`
- sort: Score (de Notas) descending
- group_by: Contacto Principal (ascending, hide_empty)
- columnas visibles (24, 34 ocultas): Empresa Sponsor · Citas Faltantes (sponsor) · Citas Aprobadas (sponsor) · Servicios / Producto (sponsor) · Clientes Potenciales Deseados (sponsor) · Score (de Notas) · Estatus · Notas · Tamaño Negocio (asistente) · Tipo boleto (asistente) · Cupo asistente · Confirmadas asistente · Puesto (asistente) · Área (asistente) · Giro / Industria (asistente) · Nombre · Giro Detectado Exa (asistente) · Modelo Negocio Exa (asistente) · Madurez Negocio Exa (asistente) · Madurez Ecommerce Exa (asistente) · ICP Moda/Ecommerce (asistente) · Estado Web Exa (asistente) · Presencia Digital Exa (asistente) · Campaña Asistente

### Aprobadas sin oferta (por asistente) `board`

- id: `3d062dda-199a-81c0-8f99-000ca40318ab`
- filtro: `(Estatus equals "Aprobado" AND Campaña Asistente every {"rich_text":{"is_empty":true}} AND Contacto Principal does_not_contain "3cf62dda-199a-81fa-85fc-c32e95485c04")`
- sort: Score (de Notas) descending
- group_by: Contacto Principal (ascending, hide_empty)
- columnas visibles (23, 35 ocultas): Empresa Sponsor · Citas Faltantes (sponsor) · Citas Aprobadas (sponsor) · Servicios / Producto (sponsor) · Clientes Potenciales Deseados (sponsor) · Score (de Notas) · Estatus · Notas · Tamaño Negocio (asistente) · Tipo boleto (asistente) · Cupo asistente · Confirmadas asistente · Puesto (asistente) · Área (asistente) · Giro / Industria (asistente) · Nombre · Giro Detectado Exa (asistente) · Modelo Negocio Exa (asistente) · Madurez Negocio Exa (asistente) · Madurez Ecommerce Exa (asistente) · ICP Moda/Ecommerce (asistente) · Estado Web Exa (asistente) · Presencia Digital Exa (asistente)

### Aprobados sin agendar `table`

- id: `3d062dda-199a-81e2-bc4a-000c0f6ff9e6`
- filtro: `Estatus equals "Aprobado"`
- sort: Score (de Notas) descending
- group_by: (sin group_by)
- columnas visibles (11, 27 ocultas): Nombre · Empresa (asistente) · Contacto Principal · Empresa Sponsor · Citas Faltantes (sponsor) · Contacto Match · Estatus · Score (de Notas) · Categoria Sponsor · Tamaño Negocio (asistente) · Notas

### Board por Estatus `board`

- id: `3cf62dda-199a-81f0-b4f3-000c0c09cd0d`
- filtro: `(sin filtro)`
- sort: (sin sort)
- group_by: Estatus (manual, hide_empty)
- columnas visibles (3, 25 ocultas): Nombre · Mesa / Ubicacion · Fecha y Hora

### Canceladas `table`

- id: `3cf62dda-199a-8182-b0d8-000cdf6a548a`
- filtro: `Estatus equals "Cancelada"`
- sort: Fecha y Hora ascending
- group_by: (sin group_by)
- columnas visibles (7, 21 ocultas): Nombre · Empresa Sponsor · Contacto Match · Contacto Principal · Mesa / Ubicacion · Fecha y Hora · Notas

### Check-in en piso (por horario) `table`

- id: `3d062dda-199a-8145-b774-000c14be7788`
- filtro: `((Estatus equals "Pendiente Calendar" OR Estatus equals "Confirmada" OR Estatus equals "Confirmada sin notificar" OR Estatus equals "Completada") AND Contacto Principal does_not_contain "3cf62dda-199a-81fa-85fc-c32e95485c04")`
- sort: Fecha y Hora ascending
- group_by: (sin group_by)
- columnas visibles (17, 28 ocultas): Nombre · Bloque Horario · Mesa / Ubicacion · Check-in Realizado · Foto Check-in · Empresa Sponsor · Empresa (asistente) · WhatsApp (asistente) · Estatus · Fecha y Hora · Estado Recordatorio 15min · Fecha Recordatorio 15min · Notas Recordatorio 15min · Estado Recordatorio 2h · Fecha Recordatorio 2h · Notas Recordatorio 2h · Google Meet URL

### Check-in hecho `table`

- id: `3d862dda-199a-8167-bbc6-000c28e31964`
- filtro: `((Estatus equals "Pendiente Calendar" OR Estatus equals "Confirmada" OR Estatus equals "Confirmada sin notificar" OR Estatus equals "Completada") AND Contacto Principal does_not_contain "3cf62dda-199a-81fa-85fc-c32e95485c04" AND Check-in Realizado equals true AND Foto Check-in is_not_empty true)`
- sort: Fecha y Hora ascending
- group_by: (sin group_by)
- columnas visibles (10, 35 ocultas): Nombre · Check-in Realizado · Foto Check-in · Fecha y Hora · Bloque Horario · Mesa / Ubicacion · Empresa Sponsor · Empresa (asistente) · Contacto Principal · Estatus

### Cola — Sugeridas por aprobar `board`

- id: `3d062dda-199a-8159-82ed-000c83a37787`
- filtro: `(Estatus equals "Sugerido" AND Cupo asistente number {"less_than":4} AND Contacto Principal does_not_contain "3cf62dda-199a-81fa-85fc-c32e95485c04")`
- sort: Score (de Notas) descending
- group_by: Contacto Principal (ascending, hide_empty)
- columnas visibles (23, 35 ocultas): Empresa Sponsor · Citas Faltantes (sponsor) · Citas Aprobadas (sponsor) · Servicios / Producto (sponsor) · Clientes Potenciales Deseados (sponsor) · Score (de Notas) · Estatus · Notas · Tamaño Negocio (asistente) · Tipo boleto (asistente) · Cupo asistente · Confirmadas asistente · Puesto (asistente) · Área (asistente) · Giro / Industria (asistente) · Nombre · Giro Detectado Exa (asistente) · Modelo Negocio Exa (asistente) · Madurez Negocio Exa (asistente) · Madurez Ecommerce Exa (asistente) · ICP Moda/Ecommerce (asistente) · Estado Web Exa (asistente) · Presencia Digital Exa (asistente)

### Confirmadas `table`

- id: `3d062dda-199a-81ac-b2c7-000c1cb69521`
- filtro: `((Estatus equals "Confirmada" OR Estatus equals "Confirmada sin notificar" OR Estatus equals "Completada") AND Contacto Principal does_not_contain "3cf62dda-199a-81fa-85fc-c32e95485c04")`
- sort: Fecha y Hora ascending
- group_by: (sin group_by)
- columnas visibles (14, 14 ocultas): Empresa Sponsor · Contacto Match · Nombre · Empresa (asistente) · Contacto Principal · Estatus · Fecha y Hora · Mesa / Ubicacion · Check-in Realizado · (huérfana) · Foto Check-in · Reprogramada · Reprogramada Horario Original · Notas

### Confirmadas por Empresa Sponsor (board) `board`

- id: `3d062dda-199a-8121-b55a-000cf9b1d8cb`
- filtro: `((Estatus equals "Confirmada" OR Estatus equals "Confirmada sin notificar" OR Estatus equals "Completada") AND Contacto Principal does_not_contain "3cf62dda-199a-81fa-85fc-c32e95485c04")`
- sort: Fecha y Hora ascending
- group_by: Empresa Sponsor (ascending, hide_empty)
- columnas visibles (7, 21 ocultas): Nombre · Empresa (asistente) · Contacto Principal · Fecha y Hora · Mesa / Ubicacion · Estatus · Check-in Realizado

### Default view `table`

- id: `3cf62dda-199a-812e-b118-000ce12bd1e2`
- filtro: `(sin filtro)`
- sort: Estatus descending, Creado descending
- group_by: (sin group_by)
- columnas visibles (28, 0 ocultas): Nombre · Creado · Contacto Match · Contacto Principal · Estatus · Fecha y Hora · Idempotency Key · Mesa / Ubicacion · Notas · Intentos Envio Email · Notas Envio Email · Bloque Horario · WhatsApp (asistente) · Empresa (asistente) · (huérfana) · Foto Check-in · Empresa Sponsor · Categoria Sponsor · Estatus Recordatorio · Check-in Realizado · Score (de Notas) · Reprogramada Horario Original · Tamaño Negocio (asistente) · Reprogramada · Estado Envío Campaña · Fecha Inicio Envío · Campaña Enviada · Cuenta para faltantes

### En la mira (< 3 confirmadas) `board`

- id: `3d662dda-199a-81c8-ae6b-000cbd61f1c4`
- filtro: `((Estatus equals "Aprobado" OR Estatus equals "Confirmada" OR Estatus equals "Confirmada sin notificar" OR Estatus equals "Completada") AND Campaña Asistente any {"rich_text":{"is_not_empty":true}} AND Confirmadas asistente number {"less_than":3} AND Contacto Principal does_not_contain "3cf62dda-199a-81fa-85fc-c32e95485c04")`
- sort: Score (de Notas) descending
- group_by: Contacto Principal (ascending, hide_empty)
- columnas visibles (24, 34 ocultas): Empresa Sponsor · Citas Faltantes (sponsor) · Citas Aprobadas (sponsor) · Servicios / Producto (sponsor) · Clientes Potenciales Deseados (sponsor) · Score (de Notas) · Estatus · Notas · Tamaño Negocio (asistente) · Tipo boleto (asistente) · Cupo asistente · Confirmadas asistente · Puesto (asistente) · Área (asistente) · Giro / Industria (asistente) · Nombre · Giro Detectado Exa (asistente) · Modelo Negocio Exa (asistente) · Madurez Negocio Exa (asistente) · Madurez Ecommerce Exa (asistente) · ICP Moda/Ecommerce (asistente) · Estado Web Exa (asistente) · Presencia Digital Exa (asistente) · Fecha y Hora

### Etiqueta Mesa — Board `board`

- id: `3cf62dda-199a-812b-843b-000cfcd9edc0`
- filtro: `((Estatus equals "Confirmada" OR Estatus equals "Confirmada sin notificar") AND Contacto Principal does_not_contain "3cf62dda-199a-81fa-85fc-c32e95485c04")`
- sort: Fecha y Hora ascending
- group_by: Mesa / Ubicacion (ascending, hide_empty)
- columnas visibles (2, 26 ocultas): Bloque Horario · Empresa Sponsor

### Ocupación por Bloque Horario `chart`

- id: `3cf62dda-199a-81b6-b3a2-000c8292965a`
- filtro: `((Estatus equals "Pendiente Calendar" OR Estatus equals "Confirmada" OR Estatus equals "Confirmada sin notificar") AND Contacto Principal does_not_contain "3cf62dda-199a-81fa-85fc-c32e95485c04")`
- sort: (sin sort)
- group_by: (sin group_by)
- columnas visibles (0, 0 ocultas): 

### Oferta enviada, 0 confirmadas `board`

- id: `3d662dda-199a-81c0-83a5-000c5cab83ef`
- filtro: `(Estatus equals "Aprobado" AND Campaña Asistente any {"rich_text":{"is_not_empty":true}} AND Confirmadas asistente number {"equals":0} AND Contacto Principal does_not_contain "3cf62dda-199a-81fa-85fc-c32e95485c04")`
- sort: Score (de Notas) descending
- group_by: Contacto Principal (ascending, hide_empty)
- columnas visibles (24, 34 ocultas): Empresa Sponsor · Citas Faltantes (sponsor) · Citas Aprobadas (sponsor) · Servicios / Producto (sponsor) · Clientes Potenciales Deseados (sponsor) · Score (de Notas) · Estatus · Notas · Tamaño Negocio (asistente) · Tipo boleto (asistente) · Cupo asistente · Confirmadas asistente · Puesto (asistente) · Área (asistente) · Giro / Industria (asistente) · Nombre · Giro Detectado Exa (asistente) · Modelo Negocio Exa (asistente) · Madurez Negocio Exa (asistente) · Madurez Ecommerce Exa (asistente) · ICP Moda/Ecommerce (asistente) · Estado Web Exa (asistente) · Presencia Digital Exa (asistente) · Campaña Asistente

### Por Horario (Mesas en ese bloque) `list`

- id: `3cf62dda-199a-8197-9128-000c57eea588`
- filtro: `(Contacto Principal does_not_contain "3cf62dda-199a-81fa-85fc-c32e95485c04" AND Estatus does_not_equal ["Cancelada","Sugerido","Aprobado","Rechazado"])`
- sort: Fecha y Hora ascending
- group_by: (sin group_by)
- columnas visibles (6, 22 ocultas): Nombre · Mesa / Ubicacion · Estatus · Check-in Realizado · (huérfana) · Foto Check-in

### Rechazados `table`

- id: `3cf62dda-199a-810b-a9f4-000ca5108081`
- filtro: `Estatus equals "Rechazado"`
- sort: Score (de Notas) descending
- group_by: (sin group_by)
- columnas visibles (7, 21 ocultas): Empresa Sponsor · Empresa (asistente) · Nombre · Score (de Notas) · Notas · Estatus · Contacto Principal

### Reprogramadas `table`

- id: `3cf62dda-199a-8104-b562-000cc5855756`
- filtro: `Reprogramada equals true`
- sort: Fecha y Hora ascending
- group_by: (sin group_by)
- columnas visibles (8, 20 ocultas): Nombre · Empresa Sponsor · Contacto Principal · Estatus · Reprogramada Horario Original · Fecha y Hora · Mesa / Ubicacion · Notas

### Sin check-in `table`

- id: `3d862dda-199a-813d-bd9f-000caabcf760`
- filtro: `((Estatus equals "Pendiente Calendar" OR Estatus equals "Confirmada" OR Estatus equals "Confirmada sin notificar" OR Estatus equals "Completada") AND Contacto Principal does_not_contain "3cf62dda-199a-81fa-85fc-c32e95485c04" AND (Check-in Realizado equals false OR Foto Check-in is_empty true))`
- sort: Fecha y Hora ascending
- group_by: (sin group_by)
- columnas visibles (10, 35 ocultas): Nombre · Check-in Realizado · Foto Check-in · Fecha y Hora · Bloque Horario · Mesa / Ubicacion · Empresa Sponsor · Empresa (asistente) · Contacto Principal · Estatus

### Sin confirmar 7-oct `table`

- id: `3cf62dda-199a-81fe-86fe-000c7806a45f`
- filtro: `(Estatus Recordatorio is_empty true AND Fecha y Hora on_or_after "2026-10-07" AND Fecha y Hora before "2026-10-08" AND Estatus does_not_equal "Cancelada" AND Estatus does_not_equal "Rechazado" AND Estatus does_not_equal "Fallida" AND Estatus does_not_equal "No-show" AND Estatus does_not_equal "Completada" AND Contacto Principal does_not_contain "3cf62dda-199a-81fa-85fc-c32e95485c04")`
- sort: Contacto Principal ascending, Fecha y Hora ascending
- group_by: (sin group_by)
- columnas visibles (10, 18 ocultas): Estatus · Contacto Principal · WhatsApp (asistente) · Empresa (asistente) · Fecha y Hora · Mesa / Ubicacion · Contacto Match · Empresa Sponsor · Nombre · Estatus Recordatorio

### Sin confirmar 8-oct `table`

- id: `3cf62dda-199a-81e9-87e0-000cde9e6a1f`
- filtro: `(Estatus Recordatorio is_empty true AND Fecha y Hora on_or_after "2026-10-08" AND Fecha y Hora before "2026-10-09" AND Estatus does_not_equal "Cancelada" AND Estatus does_not_equal "Rechazado" AND Estatus does_not_equal "Fallida" AND Estatus does_not_equal "No-show" AND Estatus does_not_equal "Completada" AND Contacto Principal does_not_contain "3cf62dda-199a-81fa-85fc-c32e95485c04")`
- sort: Contacto Principal ascending, Fecha y Hora ascending
- group_by: (sin group_by)
- columnas visibles (9, 19 ocultas): Estatus · Contacto Principal · Empresa (asistente) · WhatsApp (asistente) · Fecha y Hora · Mesa / Ubicacion · Contacto Match · Nombre · Estatus Recordatorio

### Sugeridos por decidir `table`

- id: `3d062dda-199a-81eb-8b59-000cc3a4da8b`
- filtro: `Estatus equals "Sugerido"`
- sort: Score (de Notas) descending
- group_by: (sin group_by)
- columnas visibles (11, 27 ocultas): Nombre · Empresa (asistente) · Contacto Principal · Empresa Sponsor · Citas Faltantes (sponsor) · Contacto Match · Estatus · Score (de Notas) · Categoria Sponsor · Tamaño Negocio (asistente) · Notas

### Timeline por Mesa `timeline`

- id: `3cf62dda-199a-8108-b3ce-000c6637c80c`
- filtro: `Estatus does_not_equal "Cancelada"`
- sort: Fecha y Hora ascending
- group_by: (sin group_by)
- columnas visibles (2, 25 ocultas): Nombre · Fecha y Hora

### Top Aprobadas por Asistente `board`

- id: `3d062dda-199a-81f7-bf37-000cfe5049e2`
- filtro: `(Estatus equals "Aprobado" AND Contacto Principal does_not_contain "3cf62dda-199a-81fa-85fc-c32e95485c04")`
- sort: Score (de Notas) descending
- group_by: Contacto Principal (ascending, hide_empty)
- columnas visibles (23, 35 ocultas): Empresa Sponsor · Citas Faltantes (sponsor) · Citas Aprobadas (sponsor) · Servicios / Producto (sponsor) · Clientes Potenciales Deseados (sponsor) · Score (de Notas) · Estatus · Notas · Tamaño Negocio (asistente) · Tipo boleto (asistente) · Cupo asistente · Confirmadas asistente · Puesto (asistente) · Área (asistente) · Giro / Industria (asistente) · Nombre · Giro Detectado Exa (asistente) · Modelo Negocio Exa (asistente) · Madurez Negocio Exa (asistente) · Madurez Ecommerce Exa (asistente) · ICP Moda/Ecommerce (asistente) · Estado Web Exa (asistente) · Presencia Digital Exa (asistente)

### Top Confirmadas por Asistente `board`

- id: `3d062dda-199a-81d1-aa1f-000cf164c06d`
- filtro: `((Estatus equals "Confirmada" OR Estatus equals "Confirmada sin notificar") AND Contacto Principal does_not_contain "3cf62dda-199a-81fa-85fc-c32e95485c04")`
- sort: Fecha y Hora ascending
- group_by: Contacto Principal (ascending, hide_empty)
- columnas visibles (25, 33 ocultas): Empresa Sponsor · Citas Faltantes (sponsor) · Citas Aprobadas (sponsor) · Servicios / Producto (sponsor) · Clientes Potenciales Deseados (sponsor) · Score (de Notas) · Estatus · Notas · Tamaño Negocio (asistente) · Tipo boleto (asistente) · Cupo asistente · Confirmadas asistente · Puesto (asistente) · Área (asistente) · Giro / Industria (asistente) · Nombre · Giro Detectado Exa (asistente) · Modelo Negocio Exa (asistente) · Madurez Negocio Exa (asistente) · Madurez Ecommerce Exa (asistente) · ICP Moda/Ecommerce (asistente) · Estado Web Exa (asistente) · Presencia Digital Exa (asistente) · Fecha y Hora · Mesa / Ubicacion

### Top Rechazadas por Asistente `board`

- id: `3d062dda-199a-81be-b8c9-000cea433bf1`
- filtro: `(Estatus equals "Rechazado" AND Contacto Principal does_not_contain "3cf62dda-199a-81fa-85fc-c32e95485c04")`
- sort: Score (de Notas) descending
- group_by: Contacto Principal (ascending, hide_empty)
- columnas visibles (23, 35 ocultas): Empresa Sponsor · Citas Faltantes (sponsor) · Citas Aprobadas (sponsor) · Servicios / Producto (sponsor) · Clientes Potenciales Deseados (sponsor) · Score (de Notas) · Estatus · Notas · Tamaño Negocio (asistente) · Tipo boleto (asistente) · Cupo asistente · Confirmadas asistente · Puesto (asistente) · Área (asistente) · Giro / Industria (asistente) · Nombre · Giro Detectado Exa (asistente) · Modelo Negocio Exa (asistente) · Madurez Negocio Exa (asistente) · Madurez Ecommerce Exa (asistente) · ICP Moda/Ecommerce (asistente) · Estado Web Exa (asistente) · Presencia Digital Exa (asistente)

### Top Sugeridas por Asistente `board`

- id: `3d062dda-199a-81e2-9dcf-000cc9af3e38`
- filtro: `(Estatus equals "Sugerido" AND Contacto Principal does_not_contain "3cf62dda-199a-81fa-85fc-c32e95485c04")`
- sort: Score (de Notas) descending
- group_by: Contacto Principal (ascending, hide_empty)
- columnas visibles (23, 35 ocultas): Empresa Sponsor · Citas Faltantes (sponsor) · Citas Aprobadas (sponsor) · Servicios / Producto (sponsor) · Clientes Potenciales Deseados (sponsor) · Score (de Notas) · Estatus · Notas · Tamaño Negocio (asistente) · Tipo boleto (asistente) · Cupo asistente · Confirmadas asistente · Puesto (asistente) · Área (asistente) · Giro / Industria (asistente) · Nombre · Giro Detectado Exa (asistente) · Modelo Negocio Exa (asistente) · Madurez Negocio Exa (asistente) · Madurez Ecommerce Exa (asistente) · ICP Moda/Ecommerce (asistente) · Estado Web Exa (asistente) · Presencia Digital Exa (asistente)

### Top Sugeridas y Aprobadas por Asistente `board`

- id: `3cf62dda-199a-81cf-b15d-000cd6d46e41`
- filtro: `(Estatus equals "Sugerido" OR Estatus equals "Aprobado")`
- sort: Score (de Notas) descending
- group_by: Contacto Principal (ascending, hide_empty)
- columnas visibles (23, 35 ocultas): Empresa Sponsor · Citas Faltantes (sponsor) · Citas Aprobadas (sponsor) · Servicios / Producto (sponsor) · Clientes Potenciales Deseados (sponsor) · Score (de Notas) · Estatus · Notas · Tamaño Negocio (asistente) · Tipo boleto (asistente) · Cupo asistente · Confirmadas asistente · Puesto (asistente) · Área (asistente) · Giro / Industria (asistente) · Nombre · Giro Detectado Exa (asistente) · Modelo Negocio Exa (asistente) · Madurez Negocio Exa (asistente) · Madurez Ecommerce Exa (asistente) · ICP Moda/Ecommerce (asistente) · Estado Web Exa (asistente) · Presencia Digital Exa (asistente)
