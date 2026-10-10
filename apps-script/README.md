# Caja Hockey: Mercado Pago, app del equipo y panel

Script de Google Apps Script para la planilla **Caja Hockey**. Corre gratis en los servidores de Google. El diseño acordado está en [`DISENO.md`](../DISENO.md).

| Archivo | Qué hace |
|---|---|
| [`Codigo.gs`](Codigo.gs) | Trae las transferencias de Mercado Pago cada 30 minutos y arma el menú de la planilla |
| [`Calculo.gs`](Calculo.gs) | Calcula cuotas, deudas y caja, y escribe las hojas Cuotas y Resumen |
| [`Web.gs`](Web.gs) | La app del equipo y las acciones del panel del administrador |
| [`App.html`](App.html) | Las pantallas de la app |
| [`appsscript.json`](appsscript.json) | Permisos del script |

## Instalar o actualizar (desde la computadora)

1. Abrí la planilla → **Extensiones → Apps Script**.
2. Reemplazá el contenido de `Código.gs`, `Web.gs` y `App.html` por el de esta carpeta.
3. Agregá el archivo nuevo: **+ → Secuencia de comandos** → nombre `Calculo` → pegá [`Calculo.gs`](Calculo.gs).
4. **Configuración del proyecto** → tildá "Mostrar el archivo de manifiesto" → reemplazá `appsscript.json` (suma el permiso de Drive para guardar comprobantes).
5. Guardá todo (Ctrl+S).
6. Recargá la planilla → **Caja Hockey → Recalcular cuotas y resumen**.
   - Google pide autorizar de nuevo por el permiso nuevo. Elegí tu cuenta → Configuración avanzada → Ir a Caja Hockey → **Seleccionar todo** → Continuar. Después volvé a elegir el menú.
   - La primera vez crea la hoja **Valores**, agrega las columnas de alta y baja en Integrantes y reescribe Cuotas y Resumen.
7. Si todavía no lo hiciste:
   - **Caja Hockey → Guardar clave de Mercado Pago**: pegá el Access Token de producción (empieza con `APP_USR-`). Lo pegás vos; no lo compartas.
   - **Caja Hockey → Probar conexión con Mercado Pago**. Si las transferencias del 09/10 dicen "(ya está en Pagos)", poné 09/10/2026 en Config B33.
   - **Caja Hockey → Activar sincronización cada 30 minutos**.
8. **Caja Hockey → Definir PIN del panel de administrador** (6 a 12 números).
9. Apps Script → **Implementar → Administrar implementaciones → lápiz → Versión: Nueva versión → Implementar**. El link de la app no cambia.

## La app

**Sin ingresar** (lo que ve el equipo): cancha del mes, saldo, quién falta pagar (en cuotas, sin montos), planilla de cuotas, "Mi cuota" y la caja con los gastos.

**Panel del administrador** (al pie: **Administrar**, con PIN):

| Pantalla | Para qué |
|---|---|
| Para revisar | Asignar transferencias sin dueño (se guarda la cuenta y las próximas entran solas) o marcarlas "No es de la caja". Clasificar los pagos que no son múltiplo de la cuota |
| Pago en efectivo | Cuota, otra cosa de la caja o algo que no es de la caja |
| Gasto | Subís la imagen del comprobante de Mercado Pago; la app lee el N° de operación y trae monto, fecha y destinatario. Si no lo lee, lo escribís |
| Integrantes | Alta (después del día 15 paga media cuota ese mes) y baja con el último mes que juega. En cada integrante, sus pagos y la opción de reclasificarlos |
| Cuota y cancha | Valor nuevo con "vigente desde" y aviso de quién va a deber diferencia |
| Mensaje para WhatsApp | Arma el texto con la cancha del mes y quién falta, para copiar o abrir WhatsApp |

Instalarla en el celular: abrí el link → Android: menú ⋮ → **Agregar a la pantalla principal**; iPhone: Compartir → **Agregar a inicio**.

## La planilla

| Hoja | Quién la escribe |
|---|---|
| Pagos | La sincronización, el panel o vos. Imputación: **Cuota**, **Deuda anterior**, **Otro de la caja** (suman), **No es de la caja** y **Por clasificar** (no suman) |
| Gastos | La sincronización (cancha), el panel o vos |
| Integrantes | El panel o vos. Columna K: fecha de alta. Columna L: último mes (baja). Varios CUIT en una celda, separados por coma |
| Valores | El panel o vos. Cada fila cambia la cuota, la cancha o las dos desde ese mes |
| Cuotas y Resumen | **La app**: se reescriben solas al sincronizar, al usar el panel o al editar la planilla. No las edites a mano |
| Por revisar | La sincronización. Lo resolvés desde el panel |

Cómo se calcula (DISENO.md, decisiones 10 a 12, 22 y 25):

- Cada mes vale la cuota vigente ese mes. Los pagos "Cuota" son saldo a favor y se descuentan mes a mes: si la cuota sube, lo adelantado puede quedar corto.
- Un mes pagado en parte figura como "Debe". Cuánto falta lo ven el administrador y el panel.
- El administrador (Cuota automática = Sí) está siempre al día.

## Sincronización con Mercado Pago

| Movimiento | Qué pasa |
|---|---|
| Transferencia de un integrante reconocido, múltiplo de la cuota | Pagos como "Cuota" |
| Transferencia de un integrante reconocido, otro monto | Pagos como "Por clasificar" (no suma hasta que la clasifiques) |
| Transferencia sin reconocer (hasta 6 cuotas) o desde un banco | Por revisar |
| Transferencia al club por el costo de la cancha (hasta 10% más) | Gastos como "Cancha" |
| Devolución de un pago ya cargado | Aviso en Por revisar |

- Reconoce a cada integrante por su ID de Mercado Pago o su CUIT.
- Cada pago se procesa una sola vez (hoja oculta `_procesados`: no la borres).
- Las filas automáticas quedan en negro; las cargadas a mano o desde el panel, en azul.

## Seguridad

- Compartí la planilla solo como Lector o Comentarista. Un editor puede cambiar el código que corre con tu clave.
- El PIN se verifica en el servidor en cada acción y se guarda cifrado. Después de 5 PIN incorrectos, el panel se bloquea 15 minutos.
- La app pública no muestra CUIT, cuentas, números de operación, notas ni cuánto pagó cada uno.
- Los comprobantes de gastos quedan en tu Drive, en la carpeta "Caja Hockey - Comprobantes". No son públicos.
- Las funciones del menú solo funcionan desde la planilla, no desde la app.

## Límites conocidos

- **Transferencias desde bancos:** Mercado Pago no informa quién las envía. Van a Por revisar y las asignás.
- **Demora:** los pagos aparecen con hasta 30 minutos de demora. Los cambios a mano en la planilla, en hasta 5 minutos en la app.
- **Clave vencida:** si Mercado Pago la renueva, el resultado en Config dice "rechazó la clave (401)". Guardá la nueva desde el menú.

## Pruebas

`test/` simula Google Sheets, Drive y la API de Mercado Pago (156 casos):

```
TZ=America/Argentina/San_Juan node apps-script/test/run.js
```
