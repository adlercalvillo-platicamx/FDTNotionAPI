# Bitácora — endpoint de sugerencias Aprobado por asistente (26-ago-2026)

Carlos necesita leer, para un asistente, las filas `Aprobado` tanto antes
como después de mandar la oferta inicial. Un solo GET cubre ambos momentos.

## Entrega

`GET /matchmaking/sugerencias-asistente?telefono=` o `?contactoId=`
(`X-API-Key`, solo lectura).

- Resuelve el asistente con `buscarAsistentePorWhatsApp` (misma
  normalización de `+` / espacios / 52).
- Filtra `Citas` a `Estatus = Aprobado` para ese `Contacto Principal`.
- **No** filtra por `Campaña Enviada`; el checkbox va en cada ítem.
- Ordena por score descendente (`Score (de Notas)` / prefijo `Score:`).
- Hidrata `sponsorNombre` (`Empresa \|\| Nombre`) y `Solucion` igual que
  la oferta inicial.
- Sin filas Aprobado → `{ sugerencias: [] }`, no error.
- Sin params → 400; teléfono o id desconocido → 404.

No hay tool MCP: el consumidor es el agente de WhatsApp de Carlos vía REST.

## Vista de Laura/Liz (contexto, no es tarea de código)

En el workspace de pruebas de Adler, `Top Sugerencias por Asistente` (ya
sin el sufijo “provisional”) es un board agrupado por `Contacto Principal`,
filtro `Sugerido`/`Aprobado`, orden por `Score (de Notas)`. Lo que ellas
pasan a `Aprobado` ahí es exactamente lo que este endpoint expone.

## Verificación

`node tests/sugerencias-asistente.manual-test.js`

No se tocó el workspace de producción de Laura ni se enviaron WhatsApps.
