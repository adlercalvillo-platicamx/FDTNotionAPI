# Bitácora 22sep — página interna: giro, modificar/cancelar, emails sponsors
Handoff. Código gana si esto contradice algo.
22 de septiembre de 2026. Continúa [bitacora-17sep-pagina-reserva-qr.md](bitacora-17sep-pagina-reserva-qr.md)
y [bitacora-22sep-emails-sponsors-csv.md](bitacora-22sep-emails-sponsors-csv.md).

## Pedido

Adler: la página QR queda de **uso interno**, pero el flujo es el mismo.
Filtros limitantes = boleto válido + giro de los 3 (sin tamaño). Botones de
modificar horario y cancelar en las citas confirmadas, igual que el Agente 2.
Reagendar una cancelada igual que el agente (fila nueva). Sponsors nuevos
salen de Notion. Todos los Email de Sponsor a `adler.calvillo@platica.mx`
mientras se prueba.

## Qué cambió y por qué

- Identificar y reservar rechazan giro fuera de `GIROS_ELEGIBLES_MATCHMAKING`
  con `GIRO_NO_ELEGIBLE` y el giro real en el mensaje. Expo sigue fuera.
  Tamaño/área/soluciones/`Quiere Citas=No` no se usan en esta página.
- `POST /reserva-publica/citas/:citaId/modificar` y `/cancelar` llaman
  `modificarCita` / `cancelarCita`. El token tiene que ser dueño de la cita
  (`CITA_NO_PERTENECE`). Disponibilidad acepta `exceptCitaId`.
- La UI muestra botones en el bloque oscuro de citas, modal de cancelar,
  grilla completa al modificar, y un bloque aparte de canceladas reagendables.
- `reservarPublicamente` ya enlazaba `cita_origen_cancelada_id`; se listan
  las canceladas sin hija y sin cita activa del mismo par.
- Caso especial de correo compartido: `identificar` responde
  `EMAIL_AMBIGUO` con nombre, empresa y boleto de cada asistente activo. La
  página muestra una pantalla de selección antes de sponsors y repite
  `{ email, contactoId }`. El backend vuelve a consultar el correo y rechaza
  un id ajeno con `SELECCION_PERSONA_INVALIDA`; solo entonces emite el token.

## Sponsors en catálogo

`GET /sponsors` lee Contactos de Laura. 14 sponsors activos no Bronce,
incluyendo Mercado Libre, Pikstudio y Optimus Digital. No hay lista
hardcodeada. Logo/copy salen de Notion si están llenos.

## Emails (producción Laura)

14/14 Sponsor → `adler.calvillo@platica.mx`. Asistentes no se tocaron.
Backup: `tests/_emails-sponsors-backup-1790105866170.json`.

| Empresa | Email anterior |
|---|---|
| Optimus Digital | leonardo@optimusdigital.mx |
| Mercado Libre | rebeca.padilla@mercadolibre.com.mx |
| Pikstudio | amelia@pikstudio.com.mx |
| Tiendanube | ana.olhovich@tiendanube.com |
| Reevolution | alexandro.huerta@reevolution.com.mx |
| Leadin | mauricio.ledezma@leadin.com.mx |
| Envia.com | erik.rowe@envia.com |
| Revie | renata@revie.ai |
| Platica.mx | marco.trujillo@platica.mx |
| Flow | jhuerta@flowpagos.com |
| Blip | zuleyma.coronado@blip.ai |
| CaaS | mparra@caas-ai.com |
| Reversso | rodrigo.cerda@reversso.com |
| Infracommerce | daniela.guerrero@infracommerce.lat |

Hasta restaurar, **todo .ics de cita llega a Adler**, no al comercial.

```
node scripts/one-shots/redirigir-emails-sponsors-laura-22sep.js --restaurar tests/_emails-sponsors-backup-1790105866170.json
```

## Cómo operarlo

Backend + frontend Coolify (recurso de la página aparte). Contrato en
`README.md` / `contexto-pagina-reserva-qr.md`. Tests:

```
node tests/reserva-publica.manual-test.js
```

## Pendientes

- Commit/push y redeploy de API + `frontend/` para que la página en
  `*.appsplatica.site` tome los botones y el muro de giro.
- Restaurar correos de sponsors cuando dejen de probar envíos reales.
- No reejecutar el one-shot de emails sin mirar el backup.
