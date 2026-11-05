# Bitácora 03nov — FAQ, duplicados y carga a Plática
Handoff. Código gana si esto contradice algo.
Fecha: 3 nov 2026. Sin commit. Continúa [bitacora-02nov-telefono-campana.md](bitacora-02nov-telefono-campana.md).

## Pedido y decisión
Adler pidió dejar listos tres puntos: preguntas frecuentes, duplicados históricos y la carga a Plática. Decisión de esta sesión: no fusionar fichas. La tabla de FAQ no cabe todavía en el Notion de Laura.

## Qué cambió y por qué
El token de Laura (integración `FDT2026`) ve exactamente dos data sources, `Contactos FDT` y `Citas FDT2026`, y ninguna página fuera de ellos. Sin una página padre compartida no puede crear una base nueva.

La tabla borrador quedó en el espacio personal de Adler, que es el Notion del MCP: [FAQ FDT — borrador](https://app.notion.com/p/dc0796a163ab4bfe8fc5440f72c96805). Data source `b71b0b0d-1865-461a-a7a8-f3a86c0e7dcb`. Una fila en `Borrador`, sin liga de conferencias. No está en el workspace de Laura.

La guía de operación está en [guia-cierre-faqs-duplicados-carga.md](guia-cierre-faqs-duplicados-carga.md).

## Duplicados (solo lectura del CSV)
`telefono_whatsapp` con 10 dígitos o más: 23 566 filas, 22 374 números, 990 repetidos. Misma persona con seguridad: 14 (mismo nombre y correo) + 38 (mismo correo y un nombre más largo). Los otros 938 no se unen. No se escribió nada en Contactos.

## Cómo operarlo
Sin envío. Sin importación a Plática en este turno. Sin campos nuevos creados en Plática. Laura tiene que crear o compartir la base de FAQ con la integración antes de que el token la lea.

## Preguntas frecuentes (4 nov)
Se buscaron conversaciones de Marketing (`4HoKf6mkEekTKA3jXFK3`) y de Citas (`c1IYnFsr0Jzfqq4NeLAs`), julio–octubre 2026. El buscador también cuenta el texto del agente, así que una palabra como «grabaciones» infla el número. Lo que sí se sostuvo: en Citas, la frase de que falta comprar el boleto virtual aparece en 62 conversaciones. En Marketing hay pedidos reales de liga, de grabaciones y de factura (13 conversaciones con factura).

Se agregaron 13 filas en `Borrador`, sin respuesta, a [FAQ FDT — borrador](https://app.notion.com/p/dc0796a163ab4bfe8fc5440f72c96805). La fila que ya estaba, sobre conferencias con boleto presencial, se dejó.

## Prueba de 20 contactos (4 nov)
Adler dejó el export en la raíz (`all_contacts_yay7N6Iejg62P9h0nJaU_2026-11-04T15-51-07.csv`, 10 160 filas) y dio visto bueno para los 4 campos y para subir solo 20. El CSV está en `.gitignore` (`all_contacts_*.csv`). Las columnas del export vienen en inglés (`phoneNumber`, `company`, `city`); en la interfaz se ven en español. Los campos personalizados sí vienen por id (`giro_industria`, `citas_confirmadas_del_asistente`).

Cruces del histórico con teléfono usable (22 374 números) contra ese export: **5 983 ya estaban** y **16 391 no**. En el export, 3 155 filas no traen teléfono.

Campos creados, sobreescribibles: `formato_de_registro` (select `2026` / `Histórico`), `tipo_de_usuario`, `eventos`, `temas`. Etiqueta nueva `historico`. El id de la opción `2026` se guarda como `_2026` porque el id no puede empezar con número; la etiqueta sigue siendo `2026`.

La prueba no mandó WhatsApp. Los 19 nuevos salieron con `wasUpdated: false` (ficha nueva). La que ya existía se actualizó en la misma ficha:

| Quién | Qué se hizo |
|---|---|
| Una ficha 2026 que ya estaba, con cita | Solo `formato_de_registro=2026` y `eventos=FDT 2026`. Siguieron la cita, el correo, la empresa y la etiqueta `Inbox Anna`. |
| 19 históricos que no estaban | Alta con nombre, correo, empresa, cohorte Histórico, tipo de usuario, eventos y etiqueta `historico`. |

Los 19 son los primeros teléfonos únicos de 12 dígitos con `52`, con correo y empresa, que no estaban en el export. No son una muestra curada.

## Carga histórica (4 nov, tarde)
Adler pidió normalizar mayúsculas y subir los que faltaban. Nombres, empresa, ciudad, estado, país y puesto pasan a título solo si el texto viene todo en mayúsculas. Eventos, temas y el rol (`asistente_vip`) se quedan como están.

Se excluyeron los teléfonos del export y los 19 de la prueba. 4 números de exactamente 10 dígitos no se intentaron. 41 números repetidos de la misma persona se fundieron (eventos y roles). En 699 números con personas distintas se subió una sola fila.

Corrida por API, sin WhatsApp, unos 18 minutos. De 16 350 intentos: **16 188 creados**, **1 actualizado** (una ficha sin citas; el número ya existía y no estaba en el export) y **161 rechazados** por teléfono inválido (400). `wasUpdated` no se disparó en el resto.

## Los 4 de 10 dígitos (4 nov)
No se habían intentado porque un número de 10 dígitos no trae país, y la regla era no forzar +52. Los cuatro son de Dinamarca (lada 45 + 8 dígitos). Se subieron con ese código de país. Los cuatro respondieron 201, ficha nueva, sin WhatsApp.

## 2026 en Plática (4 nov, tarde)
Adler pidió usar el campo que ya existe, `Teléfono válido`, y no crear otro select. En las 1 583 fichas con formato 2026 estaba vacío. Quedó `Sí`, `No` o `Dudoso`.

`No` es el mismo dígito repetido (`5555555555`, `0000000000`, `2222222222`), sin teléfono o demasiado corto. `Dudoso` es un 52 cuyos 10 dígitos empiezan con 1. Esos no se subieron.

De los `Sí` que no estaban: **924 fichas nuevas** y 3 que ya existían se actualizaron. Plática rechazó 32 por teléfono inválido. En los que ya estaban se actualizaron 590 (nombre de 2026 cuando era el más completo o el que había pisado el histórico, formato 2026, `tipo_de_usuario` y `FDT 2026`). 318 nombres se reescribieron. Mayúsculas sostenidas pasan a título. Presencial y Virtual quedan `asistente_estandar`. La ficha 2026 de la prueba sigue con su cita.

Se borraron tres fichas de prueba. Sin WhatsApp.

## Números repetidos (4 nov)
Adler pidió borrar las fichas de Plática con el mismo dígito repetido. Se borraron tres. Una no tenía nombre. Otra repetía el nombre de la ficha 2026 de la prueba, pero era otro número. La tercera era otra persona. El número de puros ceros ya se había borrado con las pruebas. La ficha 2026 de la prueba sigue con su cita.

## Relleno de los que ya estaban (4 nov)
Adler pidió completar tipo de usuario, eventos y temas en los históricos que ya estaban en Plática antes de la carga de 16 188. Se cruzó el export del 4 nov con el CSV histórico: 6 023 teléfonos. Se actualizaron 6 021. 5 738 solo históricas recibieron formato Histórico donde estaba vacío, más tipo, eventos y temas. 283 que también son 2026 conservaron nombre y formato 2026; se les agregó lo histórico con `|`. Una ficha de 2026 no coincidía con el nombre histórico y no se tocó. Una ya no estaba. Sin fallos y sin WhatsApp. La ficha 2026 de la prueba sigue con su cita, formato 2026, y ahora también con los eventos anteriores.

## Vista 2026 e histórico (4 nov)
Adler pidió dejar lista la vista con los campos de 2026 que también están en Plática. En `2026 e histórico`, después de `Formato Registro`, quedaron visibles `Categoria`, `Ticket / Tipo Asistencia`, `Giro / Industria`, `Area`, `Tamaño de Negocio` y `Soluciones Buscadas`. En Plática son `tipo_de_contacto`, `tipo_de_asistencia`, `giro_industria`, `area`, `tamano_de_negocio` y `soluciones_buscadas`. El filtro sigue siendo 2026 o Histórico. No agrupa. `Históricos` no se tocó. `Rol / Puesto`, sitio web y redes ya estaban en la vista.

## Teléfono válido en minúsculas (4 nov)
Las fichas 2026 habían quedado con `Sí`, `No` y `Dudoso`. Adler pidió el mismo texto que el histórico: `si`, `no` y `dudoso`, sin mayúsculas ni acentos. Se reescribieron en Notion. No se creó campo en Plática: ahí no hacía falta.

## Campos que faltaban y mayúsculas (4 nov)
Adler pidió la etiqueta `historico` en los que ya estaban, los campos de 2026 que no se habían copiado, y bajar las mayúsculas de esas fichas. No se creó ningún campo nuevo.

Se revisaron 8 039 teléfonos. Etiqueta `historico` en 5 702 fichas que ya estaban y son históricas; las de formato 2026 no la recibieron. Giro, área, tamaño, tipo de asistencia o tipo de contacto se completaron en 1 402 fichas de 2026 donde el dato venía en Notion y en Plática estaba vacío. También rol, redes, web y soluciones si faltaban. Mayúsculas sostenidas pasadas a título en 4 135 fichas (nombre o empresa). 79 ya no estaban. Sin fallos y sin WhatsApp.

## Web de los que ya estaban (4 nov)
Adler pidió copiar la página web del histórico a los que ya estaban en Plática. De 2 909, se escribió en **2 161** que la tenían vacía. **747** ya tenían una y no se pisó. Una ya no estaba. Sin fallos y sin WhatsApp.

## Dudosos de 2026 y redes históricas (4 nov)
Adler pidió subir los 23 marcados `dudoso` y copiar las redes de los históricos que ya estaban en Plática.

Plática rechazó el código de México de esos 23: el nacional empieza con 1. Se subieron con el código que sí corresponde. 21 de Buenos Aires quedaron con el código de Argentina. Una tenía el prefijo local 15 y se corrigió. Una era de São Paulo; la ficha que había entrado con código de México se borró. Una ya tenía el número correcto: se completó esa ficha, no se duplicó. Los 23 quedaron en formato 2026, con tipo de usuario, `FDT 2026` y boleto. Sin WhatsApp.

Redes del histórico, solo donde Plática las tenía vacías: 1 475 fichas del export del 4 nov tenían redes en el CSV. Se escribieron **828**. **646** ya tenían y no se pisaron. Una ya no estaba. Sin fallos y sin WhatsApp.

## Pendientes
- Liga de conferencias on demand, de Laura, antes de pasar esa fila a `Vigente`.
- Los 161 teléfonos históricos rechazados, y 32 de 2026, siguen solo en Notion.
- `Cursor Pruebas Bucle` no tiene teléfono; no se pudo borrar por la API.
- Artículo de knowledge en el agente de Marketing, y pausar los dos PDF cuando ya responda.
