# Bitácora 23-ago — `soloMarcar`: limpiar cola sin WhatsApp

Handoff corto para el siguiente chat. Código gana si esto contradice algo. Fecha: 23-ago-2026. **Sin commit.** Sigue de `bitacora-23ago-matchmaking-aprobacion-disparo.md`.

## Por qué

En simulación las pruebas no marcan Notion, así que la cola `Aprobado` sin `Campaña Enviada` se acumula. El primer `CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO=true` en el workspace de Laura mandaría WhatsApp a toda esa cola (hasta ~100 personas). Hace falta un paso de transición: escribir Notion como si se hubiera enviado, **sin** llamar a Plática.

## Qué se hizo

Tercer modo en `dispararCampanasAprobadas({ soloMarcar: true })` (`src/services/campanas-matchmaking.service.js`):

- Misma agrupación (`agruparPorAsistente`) y misma decisión A/B/C (`elegirCampana`).
- **No** llama `platicaClient.enviarPlantilla`.
- Sí llama `contactosService.actualizarEstadoCampana` y `citasService.marcarCampanaEnviada`.
- Resumen distinguible: `soloMarcar: true`, contadores `marcadosSinEnviarA/B/C` (no reutilizar `enviadosA/B/C`). Detalle con `marcadoSinEnviar: true`.
- `{ soloMarcar: true, modoSimulacion: true }` → error. `soloMarcar` **no** hereda simulación del env (si lo hiciera, el script con `MODO_SIMULACION=true` quedaría ambiguo).
- No exige `CAMPANAS_MATCHMAKING_ENVIO_REAL_HABILITADO` (se corre **antes** de encender el envío real).
- No exige WhatsApp en el contacto (no hay envío).

**No hay REST ni MCP.** El webhook y `disparar_campanas_aprobadas` siguen llamando `dispararCampanasAprobadas()` sin args (schema `{}`).

Única entrada: `scripts/one-shots/marcar-cola-sin-enviar.js`. Dos barreras:

1. Sin `--confirmar` imprime advertencia y sale (ni siquiera consulta Notion).
2. Con flag: `GET /data_sources/{id}` de Citas y Contactos del `.env` activo, muestra **títulos reales** (no solo UUID) y cuántas filas `Aprobado` sin `Campaña Enviada` / en cuántos contactos. Hay que escribir el título de Citas **exactamente**. Si no coincide, sale sin llamar `dispararCampanasAprobadas`. Si coincide, corre `{ soloMarcar: true }` e imprime el JSON. Si el preview no cuadra con `contactosProcesados` / filas en `detalle`, avisa (la cola pudo cambiar entre preview y ejecución).

El service **no cambió** en este paso. Sigue sin REST ni MCP.

## Cuándo correrlo

**Una vez por ambiente**, justo antes del primer envío real en producción Laura. Antes: revisar vista Notion **Solo Aprobados**. Lo que sí deba recibir WhatsApp en ese primer disparo no debe estar `Aprobado` (bajar a `Sugerido` y re-aprobar después, o confirmar que no hay nada así). Cada corrida apaga **toda** la cola pendiente. No es prueba repetible; repetirlo es señal de diseño, no de procedimiento.

```bash
node scripts/one-shots/marcar-cola-sin-enviar.js --confirmar
```

## Tests

`node tests/campanas-matchmaking.manual-test.js` — modo `soloMarcar`.
`node tests/marcar-cola-sin-enviar.manual-test.js` — nombre de workspace incorrecto no dispara; nombre exacto sí; preview de filas/contactos = resumen; sin `--confirmar` no pega a Notion.

## Archivos

| Archivo | Cambio |
|---|---|
| `src/services/campanas-matchmaking.service.js` | modo `soloMarcar` |
| `scripts/one-shots/marcar-cola-sin-enviar.js` | CLI: `--confirmar` + título real de Citas |
| `tests/marcar-cola-sin-enviar.manual-test.js` | **nuevo** — no dispara si el nombre no coincide |
| `tests/campanas-matchmaking.manual-test.js` | casos del modo |
| `README.md`, `AGENTS.md` | documentado; AGENTS: no hay endpoint/tool para esto |

## Qué no hacer

No convertirlo en cron, webhook, tool MCP ni parte del disparo normal. No correrlo en pruebas rutinarias.
