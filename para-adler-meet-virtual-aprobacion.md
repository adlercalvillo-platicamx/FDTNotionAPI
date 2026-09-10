# Para Adler — Meet virtual: aprobación recibida (10-sep)

Luis ya desplegó el Apps Script en `rp@fashiondigitaltalks.com`.
El backend (PR) crea el Meet **en el mismo cron** de 15 min; no hay un cron nuevo.

Adler aprobó todos los puntos. Con flag apagado, Virtual sigue recibiendo
la plantilla presencial. Encender el flag antes del deploy y la prueba deja
esas citas sin WhatsApp si falla el Meet.

---

## 1. Notion — 4 campos en Citas de Laura (producción)

One-shot: `scripts/one-shots/schema-meet-virtual-laura-10sep.js --confirmar`
(data source Citas Laura). No toca Contactos ni el `Google Event ID` viejo.

| Campo | Tipo | Para qué |
|---|---|---|
| Google Meet Event ID | texto | Id del evento en Calendar |
| Google Meet URL | url | Link de Meet |
| Intentos Google Meet | número | Reintentos (tope 3) |
| Notas Google Meet | texto | Error del último intento |

**Hecho:** one-shot corrido; los cuatro campos ya existen.

## 2. Cron de 15 min en Coolify

Mismo de siempre: cada 5 min `POST /citas/enviar-recordatorios-15min`.
Se reutiliza este cron; no se crea otro.

## 3. Envs en Coolify (flag en false hasta la prueba)

- `MEET_VIRTUAL_APPS_SCRIPT_URL` — URL `/exec` del script (Luis la tiene)
- `MEET_VIRTUAL_SECRET` — el mismo valor que ya está en Script Properties
- `PLATICA_TEMPLATE_CITA_15MIN_VIRTUAL=recordatorio_15min_antes_virtual`
- `MEET_VIRTUAL_HABILITADO=false` hasta el punto 5

## 4. Plantilla WhatsApp aprobada en Plática FDT

Nombre: `recordatorio_15min_antes_virtual`  
Categoría: UTILITY, idioma `es`  
Params: `{{1}}` primer nombre, `{{2}}` empresa del sponsor,
`{{3}}` link de Google Meet.

## 5. Prueba nombrada, luego encender el flag

Una cita Confirmada de prueba: asistente con boleto Virtual, correos y WhatsApp
nuestros (no cola real). Disparar el cron o el POST a mano.

Si Calendar invita, Notion guarda el event id y sale el WhatsApp virtual →
`MEET_VIRTUAL_HABILITADO=true`.

---

## Qué no cambia (ya lo habíamos cerrado)

- Organizador: `rp@fashiondigitaltalks.com`. El equipo FDT no entra a la llamada.
- Invita asistente **y** sponsor.
- Calendar no arbitra mesas ni cancela/mueve. Solo esta excepción de 15 min.
- Si Meet falla: no se manda plantilla virtual; 3 intentos → Omitido.
