# Bitácora 01oct — quiere_citas_no
Handoff. Código gana si esto contradice algo.
1 de octubre de 2026. Sin commit. Continúa el plan de la misma tarde.

## Pedido

Adler: mandar `quiere_citas_no` a quien marcó que no quiere citas 1a1, si el giro y el boleto son elegibles y el tamaño es grande/mediano, o chico/sin tamaño con Exa Consolidado o PyME. Marcar una campaña distinta de la oferta inicial y, si contestan, el mismo checkbox de respuesta. El agente debe ofrecer sponsors con soluciones si el mensaje anterior fue esa plantilla. Probar sin enviar.

## Decisión

Adler, sobre las tres opciones: cola de 82 (los 70 más los 12 chicos), marca `Quiere citas no` sin meterlos a follow-up ni last call, y la lista del agente con el texto de soluciones de la oferta inicial.

## Qué cambió

- Select de Contactos de Laura: opción `Quiere citas no` en `Última Campaña Enviada`. Las seis opciones anteriores siguen. Ninguna fila quedó marcada (0 antes y 0 después de la simulación).
- `POST /matchmaking/enviar-quiere-citas-no` (`X-API-Key`). No es cron. Simula salvo que Coolify tenga `QUIERE_CITAS_NO_MODO_SIMULACION=false` y `QUIERE_CITAS_NO_ENVIO_REAL_HABILITADO=true`. El body no puede forzar el envío real.
- El webhook marca `Respondió Oferta Inicial` también si la última campaña es `Quiere citas no` y el mensaje entra después. `C - Reactivación` y el resto no.
- Follow-up y last call siguen filtrando solo `Oferta inicial`.
- Agente 2, prompt `EIJT0nMo4SSvh00WLyQA` (antes `jctpej8Vdl3bi1CpBRmC`). Sección `CUANDO LA CONVERSACIÓN ABRE CON QUIERE_CITAS_NO`.

## Cómo operarlo

No hay cron. No reejecutar el one-shot del select: la opción ya está.

El código del endpoint todavía no está en Coolify. Hasta el deploy, el POST no existe en producción. El prompt de Plática ya está en vivo.

Simulación local de hoy: 415 con `Quiere Citas = No`, audiencia 82, simulados 82, enviados 0, errores 0, marcados en Notion 0.

| Vía | |
|---|---|
| Grande | 47 |
| Mediana | 21 |
| Sin tamaño, Exa Consolidado | 2 |
| Pequeña + PyME | 7 |
| Pequeña + Consolidado | 3 |
| Micro + Consolidado | 2 |

Presencial 48, Virtual 34. Los 82 tienen WhatsApp, sin campaña previa y sin citas confirmadas. `{{1}}` sale en un solo nombre.

Para el envío real, después del deploy: poner las dos banderas, disparar, y devolverlas a simulación / envío real apagado. Nombrar la cola antes de disparar. No usar el webhook de ofertas aprobadas.

## Pruebas

`node tests/quiere-citas-no.manual-test.js` y `node tests/platica-respuestas-webhook.manual-test.js`. Sin SMTP ni WhatsApp.

Simulación de conversación en la API de chat de Plática (no WhatsApp), `chat_2b0c18fe-7217-43a4-9bc1-34ab9cecebd2`, como Sergio García de Grupo Julio pidiendo opciones después de la plantilla. El agente consultó sugeridas, no reservó, y contestó cuatro renglones en el formato de la oferta (`expertos en`) más “¿Con quién empezamos, o te muestro otras?”. El brief lo consultó por dentro; no lo pegó como segundo párrafo.

## Pendiente

El envío real, cuando Adler lo pida, ya con el backend desplegado y las banderas. No está hecho. En Coolify no hace falta variable nueva para este redeploy: si no existen, la simulación queda prendida y el envío real bloqueado.

