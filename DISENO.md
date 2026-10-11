# Diseño de la app Caja Hockey

Decisiones tomadas con Lucio (administrador) antes de programar. Cada cambio de diseño se anota acá primero.

Estado: **etapa 1 instalada** y en prueba con datos reales; se amplía con las decisiones 30 a 41. Las etapas 2 y 3 se diseñan antes de programarlas.

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
| 30 | Todo desde la app | El administrador no edita la planilla. Solo quedan en el menú de la planilla la clave de Mercado Pago, activar la sincronización y recuperar el PIN olvidado. |
| 31 | Pago mal cargado | Se edita (integrante, fecha, monto, imputación, nota) o se anula. Un pago anulado deja de sumar y queda registrado. Lo que tiene N° de operación de Mercado Pago no cambia de monto ni de fecha: se reasigna, se reclasifica o se anula. |
| 32 | Qué muestra "Para revisar" | Toda transferencia no cargada desde el inicio de la temporada (01/10/2026). Si ya hay un pago cargado del mismo monto, con un día de diferencia como máximo y sin N° de Mercado Pago, avisa "Posible duplicado" y ofrece "Es el mismo". |
| 33 | Buscar transferencias | Botón "Buscar transferencias ahora" en el panel, con PIN. Además, sigue la búsqueda automática cada 30 minutos. |
| 34 | Clave de Mercado Pago | Se guarda y se activa la sincronización desde el menú de la planilla. Así nadie puede cambiar la clave con solo saber el PIN. |
| 35 | Corregir valores | Se corrige o borra cualquier valor de cuota o cancha, también de meses pasados. Antes de guardar, la app muestra quién tiene que pagar más o menos. |
| 36 | Gasto mal cargado | Como los pagos: se edita (fecha, monto, tipo, concepto, destinatario) o se anula. Lo que vino de Mercado Pago no cambia de monto ni de fecha. |
| 37 | Editar integrante | Apodo (se cambia también en sus pagos), nombre, apellido, CUIT, CVU/CBU, cuentas de Mercado Pago reconocidas (se pueden quitar) y fecha de alta. Se puede deshacer la baja. |
| 38 | Configuración en la app | Saldo inicial de la caja, alias para transferir, día de vencimiento de la cancha y cambiar el PIN (pide el actual). |
| 39 | Gastos sin comprobante de Mercado Pago | No se cargan. Todos los gastos salen de Mercado Pago; el efectivo se deposita antes de gastarlo. |
| 40 | Un pago por varios integrantes | Botón "Repartir" en el pago: se divide entre integrantes (por ejemplo, $15.000 a Mono y $15.000 a Cascini). Queda el mismo N° de Mercado Pago y la suma no cambia. |
| 41 | Mes de la cancha | Al cargar o editar un gasto de cancha se elige a qué mes corresponde (por defecto, el de la fecha de pago). "Cancha pagada" usa ese mes. Se puede cambiar aunque el gasto venga de Mercado Pago. |

## Etapas

1. **Ya:** sincronización con Mercado Pago, app pública y panel del administrador: efectivo, clasificar pagos, altas y bajas, valores con "vigente desde", mensaje para WhatsApp. Ampliada con las decisiones 30 a 41: todo se corrige desde la app.
2. Ingreso con Google o código por mail, reclamos, "Quiero sumarme", cuentas asociadas y comprobantes con lectura del N° de operación.
3. Saldo de la reserva "Caja Hockey" de Mercado Pago.

## A verificar con datos reales

- Si la API de Mercado Pago informa el saldo de una reserva o los rendimientos (reporte de dinero liberado: aparece "Rendimientos positivos", sin confirmar si separa la reserva).
- Si las transferencias desde bancos traen algún dato de quien envía (CBU o nombre). De eso depende que las cuentas asociadas sirvan para reconocerlas.

## Construido

- **Etapa 1** (rama `claude/affectionate-goldberg-zlvock`): sincronización con Mercado Pago (`Codigo.gs`), cálculo de cuotas y caja (`Calculo.gs`), app pública y panel del administrador (`Web.gs`, `App.html`). Pantallas aprobadas en el lienzo de diseño (fila "Etapa 1").
- Pendiente: etapas 2 y 3.
