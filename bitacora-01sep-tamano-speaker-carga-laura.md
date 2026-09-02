# Bitácora 01sep — Tamaño libre, Speaker y carga de Laura
Handoff. Código gana si esto contradice algo.
Trabajo del 1 de septiembre de 2026. Sin commit al escribir esta bitácora.

## Pedido y decisiones

Adler pidió migrar `Tamaño de Negocio` a texto libre, agregar el boleto
`Speaker`, homologar los schemas de pruebas/Laura, auditar el export de
Ticketópolis y cargar los datos reales en Laura. Adler aprobó:

- reemplazar `Incluye Entrada Evento` checkbox por select Sí/No;
- fusionar la evidencia de tamaño Exa que solo existía en Laura dentro de
  `Pendientes / Notas`, con prefijo `[Exa tamaño]`;
- carga conservadora: altas nuevas, llenar vacíos y sobrescribir únicamente
  `Formato Registro` y `Ticket / Tipo Asistencia`;
- mantener a Magali Parra como Sponsor y aplicarle solo datos transaccionales;
- conservar a Natalia Montiel y Nora Ruth Moren como personas distintas aunque
  comparten `norinmm@icloud.com`.

## Código

- `contactos.service.js` lee `Tamaño de Negocio` desde `rich_text` o el
  `select` transitorio y lo clasifica por prefijo Grande/Mediana/Pequeña/Micro.
  Un texto de Etapa devuelve `null` y conserva el fallback Exa.
- `Speaker` entra al query de candidatos. Sigue sujeto a los tres giros
  elegibles, salta el filtro de tamaño y no necesita opt-in.
- Speaker y Presencial VIP suman 500; Presencial suma 150. VIP/Speaker no
  acumulan el bonus de Presencial.
- Prueba nueva `tests/tamano-speaker.manual-test.js`: 16/16.
- Los 29 scripts `tests/*.manual-test.js` pasaron; el caso nuevo quedó 16/16.

## Schemas Notion

IDs confirmados mediante fetch real, no tomados del URL:

- Pruebas Contactos: `9f335308-da0e-4672-9744-c1dabcfb22aa`
- Pruebas Citas: `df93bc94-26ee-42fc-92d7-a0ed3a8e1f68`
- Laura Contactos: `3b162dda-199a-8029-8d58-000b6d1fed37`
- Laura Citas: `3b162dda-199a-8053-8098-000b00916893`

Pruebas quedó con `Tamaño de Negocio=rich_text` y opción `Speaker`; sus cuatro
valores Grande existentes sobrevivieron.

Laura conservó 61 Contactos y 7 Citas durante la migración. Citas quedó 27/27,
sin diferencias de nombre, tipo u opciones contra pruebas. Contactos quedó
101/104, sin extras y sin diferencias de tipo/opciones. Quedan manuales:

1. `Citas Confirmadas (Count)` — fórmula de pruebas:
   `prop("Citas (relacional)").map(current.prop("Estatus")).filter(or(current == "Confirmada", current == "Confirmada sin notificar", current == "Completada")).length()`
2. `Citas Faltantes` —
   `prop("Citas Minimas Prometidas") - prop("Citas Confirmadas (Count)")`
3. `Rango Faltantes` —
   `if(prop("Citas Faltantes") <= 0, "Al día", if(prop("Citas Faltantes") <= 3, "1-3 faltantes", "4+ faltantes"))`

Notion API respondió HTTP 400 `Type error with formula` para la primera,
incluso usando el rollup. No seguir intentando por API; crearlas en UI en ese
orden. `Citas (relacional)` quedó simple: activar relación bidireccional en UI
si Laura necesita la misma navegación que pruebas.

## Auditoría Ticketópolis contra pruebas

Fuente: `reservaciones_fashiondigitaltalks2026_260901.csv`, UTF-16 LE.

- 110 filas, 105 emails únicos.
- 51 filas coinciden en los campos auditados **contra pruebas**. Esta cifra no
  tiene relación con las páginas actualizadas en Laura; son dos comparaciones
  distintas (pruebas vs. CSV aquí, Laura vs. CSV en la carga) y que ambas
  ronden 51 es coincidencia.
- 3 diferencias reales: folios vencidos `A5D843`, `8E6F38`, `2A2CFC` siguen
  activos en pruebas.
- 48 filas autorizadas/cargables no estaban en pruebas.
- 0 páginas `Fuente=Ticketopolis` de pruebas quedaron fuera del CSV.
- Cinco emails se repiten, pero `norinmm@icloud.com` no es duplicado de
  persona: Natalia y Nora tienen nombres, teléfonos y folios distintos.
- En pruebas hay 3 páginas asociadas a los dos folios de Ulil Quintanilla y 2
  para los dos registros con `norinmm@icloud.com`.

Reporte local con PII, no commitear:
`.local-backups/auditoria-ticketopolis-vs-pruebas-01sep.md`.

## Carga real de Laura

Reglas:

- excluidos: 5 Vencido, 1 Esperando pago, 5 Acceso Sponsor;
- duplicados de persona resueltos por reservación autorizada más reciente;
- excepción comprobada: Natalia/Nora se conservan ambas;
- cero valores fuera de catálogo de Giro/Area/Soluciones.

Evidencia:

- antes: 61 páginas;
- 44 altas creadas;
- 51 existentes actualizadas conservadoramente en la corrida principal;
- Nora/F13446 recibió 15 campos vacíos adicionales en un paso posterior, tras
  confirmar que es una persona distinta de Natalia; no venía en las 51;
- **52 páginas existentes modificadas en total** (51 + Nora), 96 páginas
  tocadas contando las altas;
- después: 105 páginas;
- las 44 IDs creadas se releyeron; muestra de 10/10 verificada;
- las 96 personas válidas (contando Natalia y Nora por separado) se resuelven;
- Speaker: Pascaline Leon, `Categoria=Asistente`, ticket `Speaker`;
- Prensa: Elizabeth Salinas, `Categoria=Prensa`;
- Magali permanece `Sponsor | Referido`;
- Ingrid quedó con folio `235A44`; `21614B` no se cargó;
- ninguno de los 11 folios excluidos aparece en Laura.

Recuento contra Notion (no contra el log de la corrida), 2-sep: consulta
paginada de los 105 Contactos de Laura filtrando por `created_time` y
`last_edited_time` posteriores al respaldo previo
(`2026-09-02T03:23Z`; Notion trunca ambos al minuto, así que la ventana se
compara al minuto). Resultado: 44 creadas y 52 existentes editadas = 96
tocadas. Las 44 creadas y las 51 actualizadas del log aparecen todas dentro de
la ventana; la única página editada que el log no listaba es Nora/F13446. La
bitácora decía 51 y quedó corregida a 52.

Backups y resultado están en `.local-backups/` y están ignorados por git. No
contienen tokens, pero sí PII; no subirlos.

## Operación y pendientes

- No se envió WhatsApp, email ni campaña. No se crearon citas.
- Coolify no se cambió ni se redeployó. Para usar este código hay que
  desplegar el commit.
- Coolify sigue requiriendo una sola réplica.
- No apuntar Coolify a Laura hasta crear el contacto ficticio de bloqueo y
  configurar su page ID en `NOTION_CONTACTO_BLOQUEO_AGENDA_ID`.
- Crear en UI las tres fórmulas de Contactos y, si se desea, activar la
  relación bidireccional.
- Rotar `NOTION_API_KEY_LAURA` cuando Adler tenga acceso a la cuenta.
