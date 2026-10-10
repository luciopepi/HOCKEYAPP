# Diseño de la app Caja Hockey

Decisiones tomadas con Lucio (administrador) antes de programar. Cada cambio de diseño se anota acá primero.

Estado: **en definición**. No se programa nada nuevo hasta cerrar el diseño.

## Decisiones

| N° | Tema | Decisión |
|---|---|---|
| 1 | Cómo entran los pagos | Transferencias de Mercado Pago: automático cada 30 minutos. Efectivo: lo carga el administrador. Si algo falla, el integrante sube el comprobante y queda para revisión del administrador. |
| 1b | Reserva "Caja Hockey" de Mercado Pago | Mostrar su saldo en la app. Debería coincidir con el saldo de la app; la diferencia son los rendimientos de Mercado Pago. Método: automático si la API lo permite (a verificar con la cuenta real); si no, lo carga el administrador. |
| 2 | Identidad | Ingreso voluntario. Botón "Iniciar sesión con Google" o código por mail (para iPhone u otro mail). También se puede usar sin ingresar. "Iniciar sesión con Apple" descartado (pago). |
| 3 | Reclamos | Con el N° de operación: la app lo busca en Mercado Pago. Si coincide, lo carga sola; si no, queda para aprobación del administrador. |
| 4 | Administradores | Solo Lucio. |
| 6 | Qué habilita ingresar | Hacer reclamos. Agregar cuentas asociadas (CVU/CBU). Ver el detalle de sus propios pagos. |
| 7 | Qué ve cualquiera sin ingresar | Cancha del mes, caja y grilla de quién está al día y quién debe. Sin fechas ni montos de pagos individuales. |
| 9 | Alta de integrante | "Quiero sumarme" en la app + comprobante de su primera transferencia. La app completa sus datos (nombre, CUIT, cuenta) desde Mercado Pago. |
| 10 | Mes inicial | Si entra hasta el día 15: debe el mes completo. Después del 15: medio mes. |
| 11 | Baja | Si debe, la deuda sigue figurando hasta que pague. Si tenía adelantado, queda en la caja. Sale de la grilla de los meses siguientes. |
| 12 | Cambio de cuota | Lo adelantado se recalcula al precio nuevo: puede quedar debiendo la diferencia. Los pagos se toman como saldo a favor en pesos y cada mes se descuenta a su precio. |
| 13 | Comprobante | El integrante sube la foto y la app lee el N° de operación (OCR con Google Drive). Si no puede leerlo, se lo pide escrito. Las fotos quedan en el Drive del administrador, no son públicas. |
| 14 | Valores de cuota y cancha | Se cambian en el panel con "vigente desde". Queda el historial; los meses anteriores no cambian. |
| 15 | Mora | Sin recargo para los integrantes. Si el club cobra recargo, lo paga la caja. |
| 16 | Avisos | Botón en el panel que arma el mensaje para WhatsApp (cancha del mes y quién falta). Sin mails automáticos. |
| 17 | Aprobación de altas | El administrador aprueba siempre. Recién ahí cuenta en la grilla. |
| 18 | Fecha para la regla del 15 | La fecha en que se anota. |
| 19 | Bajas | Las hace el administrador desde el panel, indicando el último mes. |
| 20 | Gastos (equipamiento) | Los carga el administrador subiendo la imagen del comprobante del movimiento de Mercado Pago. La app lee el N° y completa monto, fecha y destinatario. Todos los ven en "Caja". |
| 21 | Cuentas asociadas | Las agrega el integrante (con ingreso) y las aprueba el administrador. Aprobadas, las transferencias desde esa cuenta se cargan a su nombre. |
| 22 | Pago parcial | El mes queda "Debe" y el detalle dice cuánto falta. Lo pagado queda a cuenta. |
| 23 | Deudas anteriores a octubre 2026 | No se tienen en cuenta. Lo ya cobrado como "Deuda anterior" (Pela) queda como está. |
| 24 | Pendientes del administrador | Contador en la app: "Administrar (3)". Sin mails. |
| 25 | Pagos que no son de la caja (asados, etc.) | Montos múltiplos de la cuota: cuota, automático. Otros montos: "Por clasificar", no suman hasta que el administrador elija Cuota o "No es de la caja". Cualquier pago se puede reclasificar. |
| 26 | Etapas | 3 etapas (ver abajo). |
| 27 | "Falta pagar este mes" (público) | Nombre y cuántas cuotas debe. Sin montos en pesos por persona. |
| 28 | Pestaña "Caja" (público) | Saldo, cobrado por mes y lista de gastos. Sin el detalle de quién pagó cuánto. |
| 29 | Antes de programar | Diseño de pantallas de la etapa 1 para revisar en el lienzo de diseño. |

## Etapas

1. **Ya:** sincronización con Mercado Pago, app pública y panel del administrador: efectivo, clasificar pagos, altas y bajas, valores con "vigente desde", mensaje para WhatsApp.
2. Ingreso con Google o código por mail, reclamos, "Quiero sumarme", cuentas asociadas y comprobantes con lectura del N° de operación.
3. Saldo de la reserva "Caja Hockey" de Mercado Pago.

## A verificar con datos reales

- Si la API de Mercado Pago informa el saldo de una reserva o los rendimientos (reporte de dinero liberado: aparece "Rendimientos positivos", sin confirmar si separa la reserva).
- Si las transferencias desde bancos traen algún dato de quien envía (CBU o nombre). De eso depende que las cuentas asociadas sirvan para reconocerlas.

## Ya construido (se revisa contra este diseño antes de seguir)

- Sincronización con Mercado Pago (`apps-script/Codigo.gs`).
- App de solo lectura (`apps-script/Web.gs`, `App.html`).
- Panel del administrador con PIN (commit 58d74e1): carga de efectivo, asignar transferencias, agregar integrante. Pendiente de ajustar al diseño.
