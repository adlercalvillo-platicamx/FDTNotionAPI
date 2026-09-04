# Bitácora 04sep — oferta inicial: representante en `{{2}}`
Handoff. Código gana si esto contradice algo.
4 de septiembre de 2026. Commit/push de este `{{2}}`. Redeploy Coolify pendiente. Continúa [bitacora-02sep-primer-nombre-oferta-inicial.md].

## Pedido y decisión

Laura: numerar, separar con barra y poner el nombre del representante (`1) Marco Trujillo de Plática.mx (soluciones)`). Adler: negrita en persona y empresa; nombre completo recortado a **nombre + apellido paterno**; máxima información que quepa bajo el tope de Meta; Coolify sigue en simulación `true` y envío real `false`.

No se reaprueba `agendar_cita_inicial`: solo cambia el valor de `{{2}}`. Sigue un solo renglón (el `\r` del 2-sep se descarta).

## Qué cambió

`textoSugerencias` en `campanas-matchmaking.service.js`:

- Formato: `1) *Persona* de *Empresa* (sol1, sol2) | 2) …`
- `nombreRepresentanteParaOferta`: 1–2 tokens se quedan; 3+ usa el primero y el penúltimo (Zuleyma Jessamine Chávez Coronado → Zuleyma Chávez; Rodrigo Cerda Somoza → Rodrigo Cerda). Capitaliza igual que el saludo.
- Sin nombre usable: `1) *Empresa* (soluciones)`, como antes.
- El techo de `{{2}}` ya no es 400 fijo. Se calcula por mensaje: 1024 − cuerpo fijo de la plantilla − `{{1}}` − colchón 24. Recorte en orden: 2 soluciones → 1 → solo nombres → soltar el último sponsor.

## Evidencia

`node tests/campanas-matchmaking.manual-test.js` — incluir caso de recorte de nombre y tope de cuerpo.

No se disparó el webhook de campañas ni se mandó WhatsApp. Coolify permanece en simulación.

## Pendientes

- Redeploy Coolify (este `{{2}}` + el filtro de tamaño `f7ca90f`).
- Simulación del webhook y, si el `{{2}}` se ve bien, un envío de plantilla solo a un número de prueba **nombrado** antes de tocar cola real.
- `marcar-cola-sin-enviar.js` sigue pendiente antes del primer disparo a asistentes reales.
