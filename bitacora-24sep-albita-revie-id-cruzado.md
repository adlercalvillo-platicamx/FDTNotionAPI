# Bitácora 24sep — Albita eligió Revie y se reservó CaaS
Handoff. Código gana si esto contradice algo.
Trabajo del 24-sep-2026. Continúa el flujo conversacional documentado en `bitacora-20sep-plan-piso-agente2.md`.

## Pedido y decisión

Albita Penayo eligió a Renata Raya / Revie, pero el Agente 2 confirmó una
cita con Magali Parra / CaaS. Adler autorizó corregir la cita real y agregar
prevención tanto en el prompt como en el backend.

## Qué ocurrió

- La campaña numeró Reevolution como 1, CaaS como 2, Tiendanube como 3 y
  Revie como 4.
- Albita contestó “Puede ser el 1 o el 4”. El agente consultó Reevolution y
  Revie en paralelo.
- Después Albita eligió “Con Renata está bien”. El agente no hizo la consulta
  nueva de Revie y mandó a disponibilidad/reserva el ID
  `3bc62dda-199a-81aa-965e-fa85282ce781`, que corresponde a CaaS.
- El ID correcto de Revie es `3bc62dda-199a-8189-805d-ee8b4fcca080`.
- Disponibilidad solo devolvía el ID y horarios; el agente rotuló esos horarios
  como Revie. `reservar_cita` validaba que el ID existiera, pero no que
  correspondiera al nombre elegido. Por eso el backend reservó correctamente
  CaaS según el parámetro equivocado.
- La respuesta `Cita — VITORIA PRATES - CaaS` permitió al agente detectar la
  discrepancia, pero para entonces Notion y los correos ya se habían escrito.

## Reparación real

Destinatarios nombrados antes de ejecutar: cancelación a Albita Penayo y
Magali Parra / CaaS; confirmación nueva a Albita Penayo y Renata Raya / Revie.

- Cita equivocada `3e562dda-199a-8117-bd2e-c4948d2ae37d` → `Cancelada`.
- Cita correcta `3e562dda-199a-8136-b9d2-cd6004d587ce` → `Confirmada`.
- Empresa: Revie.
- Horario: jueves 8-oct-2026, 10:00–10:30.
- Mesa: 1.
- Cancelación y confirmación: sin `exito_parcial`; ambos lados de cada correo
  terminaron sin error.
- La hidratación local de Plática se omitió porque el `.env` local no tiene
  `PLATICA_API_KEY`. Esto no afectó Notion ni SMTP.

No editar la relación de la fila cancelada ni reejecutar la corrección: la
fila de CaaS queda como historial y la de Revie es la cita activa.

## Prevención

### Prompt y tool de Plática

- Prompt activo: `1zqe4BxA3Klcyy2FjPOm`.
- Si el contacto duda entre dos o más sponsors, primero se pregunta cuál
  elige. Tras la elección se hace una sola consulta nueva y solo se usa
  `sponsor_solicitado` de esa respuesta.
- `reservar_cita` versión 10 exige `sponsor_empresa_confirmada`, copiada de
  `sponsor_empresa` en el mismo objeto que `sponsor_notion_id`.

### Backend

- `POST /citas/reservar` acepta `sponsor_empresa_confirmada`.
- Si la empresa normalizada no corresponde al contacto del
  `sponsor_notion_id`, responde `409 SPONSOR_EMPRESA_NO_COINCIDE` antes de
  crear o promover una fila.
- El campo queda opcional en REST para no romper el frontend QR y clientes
  internos; es obligatorio en la tool conversacional de Plática.

## Evidencia

- `node tests/asignacion-mesa.manual-test.js`: todos pasaron, incluidos
  “Revie + ID de otro sponsor → SPONSOR_EMPRESA_NO_COINCIDE sin escribir” y
  “Revie + ID de Revie → permite reservar”.
- `node --check src/services/booking.service.js`: OK.
- `node --check src/controllers/citas.controller.js`: OK.

## Pendiente operativo

- El cambio de backend requiere desplegar el commit en Coolify. Hasta ese
  deploy, el prompt nuevo reduce el riesgo, pero la versión anterior del
  endpoint ignora el campo adicional.
