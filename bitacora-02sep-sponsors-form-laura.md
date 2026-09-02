# Bitácora 02sep — carga de sponsors del formulario en Laura
Handoff. Código gana si esto contradice algo.
Trabajo realizado el 2-sep-2026. Sin commit al cierre de esta bitácora.

## Pedido y decisión

Sincronizar exclusivamente Contactos del workspace de Laura con `Citas 1a1 (Responses) - Form Responses 1.csv`, conservar el nombre técnico `Etapa Cliente Buscada`, usarlo para tamaño de empresa buscado y sustituir la respuesta antigua de Envia.com por la más reciente. Decisión de Adler.

## Qué cambió

- El CSV contiene 12 respuestas y 11 empresas únicas. Envia.com aparece dos veces.
- Se actualizaron 8 páginas existentes: Blip, Infracommerce, Platica.mx, CaaS, Flow, Reversso, Revie y Envia.com.
- Se crearon 3 páginas: Leadin, Reevolution y Tiendanube.
- El “faltan 4” corresponde a 3 altas más 1 reemplazo; no eran 4 empresas nuevas.
- Envia.com conservó su page_id, nivel Oro, cuota 2 y relaciones. Los datos del formulario cambiaron de Sergio García Roza a **Erik Rowe**, que es la ortografía exacta de la respuesta del 31-ago.
- `Etapa Cliente Buscada` sigue siendo `multi_select` y conserva su nombre. Se agregaron `Grande`, `Mediana`, `Pequeña` y `Micro`.
- Los 7 registros provenientes del formulario antiguo quedaron solo con `Grande` y `Mediana`.
- Envia.com y las 3 altas conservaron la selección de tamaños de su respuesta nueva.
- Se repusieron desde el CSV los teléfonos y los textos completos del formulario. Valores de solución fuera del catálogo canónico quedaron como `Otro` y su texto en `Otra Solucion Ofrecida`.
- Las páginas nuevas quedaron con `Categoria=Sponsor` y `Fuente=Referido`.

No se modificó el workspace de pruebas.

## Evidencia

- Ejecución: 8 actualizadas, 3 creadas, 11 verificadas sin diferencias.
- Consulta independiente posterior: 11 páginas con `Categoria=Sponsor`; ninguna usa valores antiguos en `Etapa Cliente Buscada`.
- Altas:
  - Leadin: `3cf62dda-199a-810a-bbee-e7a408537cdf`
  - Reevolution: `3cf62dda-199a-81ea-8f33-c10775c0ba6a`
  - Tiendanube: `3cf62dda-199a-81c0-b6c0-e304817ae418`
- Envia.com: `3bc62dda-199a-8182-8697-c238b69557f5`, Erik Rowe, Oro, cuota 2.
- Script reproducible y bloqueado contra doble ejecución: `scripts/one-shots/cargar-sponsors-form-laura-02sep.js`.
- Se guardó respaldo local previo en `.local-backups/`; no contiene secretos y no debe commitearse.

## Operación y pendientes

- No reejecutar el one-shot: ya terminó y deja un marcador de resultado.
- Los valores antiguos de madurez digital siguen disponibles como opciones del schema para no borrar datos fuera de este lote, pero ningún sponsor activo los tiene seleccionado.
- Falta definir `Nivel de Patrocinio` y `Citas Minimas Prometidas` para Leadin, Reevolution y Tiendanube. CaaS ya existía y también sigue sin esos dos datos. Sin cuota/nivel no deben darse por listos para una corrida completa de matchmaking.
- El backend actual no usa `Etapa Cliente Buscada` como filtro. Una modificación futura deberá leerlo como tamaño buscado del sponsor, no como etapa digital.
