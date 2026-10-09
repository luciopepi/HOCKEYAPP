# Sincronización con Mercado Pago

Script de Google Apps Script que trae las transferencias de Mercado Pago a la planilla **Caja Hockey**. Corre en los servidores de Google, gratis, cada 30 minutos.

## Qué hace

| Movimiento en Mercado Pago | Qué pasa en la planilla |
|---|---|
| Transferencia de un integrante reconocido, por un monto múltiplo de la cuota | Se agrega en **Pagos** como "Cuota" |
| Transferencia de un integrante reconocido, por otro monto (ej. $21.000) | Se agrega en **Pagos** como "Revisar": cuenta para la caja, pero no para las cuotas hasta que la separes |
| Transferencia que no se puede reconocer, por un monto posible de cuota (de $1.000 a 6 cuotas) | Va a **Por revisar** |
| Transferencia desde un banco | Va a **Por revisar**: Mercado Pago no informa quién la envía |
| Transferencia al club por el costo de la cancha (hasta 10% más por recargo) | Se agrega en **Gastos** como "Cancha" |
| Transferencia al club por otro monto | Va a **Por revisar** como "Egreso" |
| Devolución de un pago ya cargado | Aviso en **Por revisar** para que corrijas la fila |
| Retención de Mercado Pago (si la hubiera) | Se agrega en **Gastos** como "Retenciones de Mercado Pago" |
| Cualquier otro movimiento de tu cuenta | No se copia |

- Las cuotas se cuentan por el monto transferido, antes de cualquier retención.
- Cada pago se procesa una sola vez, aunque borres la fila. El control queda en la hoja oculta `_procesados`: no la borres.
- Si un integrante ya tiene un pago del mismo monto ese día, el nuevo va a **Por revisar** como posible duplicado.
- Las filas que carga el script quedan en negro con la nota "Cargado automáticamente desde Mercado Pago". Las cargadas a mano siguen en azul.

## Instalación (una sola vez, unos 10 minutos, desde la computadora)

1. **Abrí la planilla** Caja Hockey → menú **Extensiones → Apps Script**.
2. **Pegá el código:** borrá lo que haya en `Código.gs` y pegá todo el contenido de [`Codigo.gs`](Codigo.gs). Guardá (ícono de disquete).
3. **Permisos acotados:**
   - En **Configuración del proyecto** (engranaje), tildá "Mostrar el archivo de manifiesto appsscript.json".
   - Volvé al editor, abrí `appsscript.json` y reemplazá su contenido por el de [`appsscript.json`](appsscript.json). Guardá.
   - Así el script solo puede tocar esta planilla y conectarse a Mercado Pago. No tiene acceso a tu Gmail ni a tu Drive.
4. **Recargá la planilla.** Aparece el menú **Caja Hockey**.
5. **Caja Hockey → Guardar clave de Mercado Pago:**
   - Pegá el **Access Token** de producción: Mercado Pago Developers → Tus integraciones → HockeyCaja → Credenciales de producción. Empieza con `APP_USR-`.
   - La primera vez Google pide permiso. Va a decir "Google no verificó esta app", y es normal: la app es tuya.
   - Tocá **Configuración avanzada → Ir a … (no seguro)** y aceptá **todos** los permisos.
   - La clave queda guardada en tu usuario: otros editores de la planilla no la ven.
   - **No la pegues en la planilla, en un chat ni en WhatsApp.**
6. **Caja Hockey → Probar conexión con Mercado Pago.**
   - Muestra las transferencias de los últimos 7 días, con el integrante reconocido y si ya están en Pagos.
   - Si las del 09/10 dicen **"(ya está en Pagos)"**, cambiá **Config B33** ("Importar pagos desde") a **09/10/2026**. Así no se pierde ningún pago de ese día.
   - Si no lo dicen, dejá B33 en 10/10/2026 y cargá a mano los pagos del 09/10 que falten.
7. **Caja Hockey → Activar sincronización cada 30 minutos.** Listo.

## Uso diario

- No hace falta hacer nada: cada 30 minutos se cargan los pagos nuevos.
- En **Config** ves la última sincronización y su resultado (filas 35 y 36).
- Revisá de vez en cuando:
  - **Por revisar.** Si un ingreso es una cuota, cargalo en Pagos con el integrante y **copiá el N° de operación**.
  - **Pagos con Imputación "Revisar".** Separá el monto en filas (Cuota, Deuda anterior u Otro), todas con el mismo N° de operación.
- Para cargar algo ya: **Caja Hockey → Sincronizar ahora**.

## Cómo reconoce a cada integrante

- Primero por el **ID de Mercado Pago** (columna J de Integrantes). El script lo aprende solo con el primer pago de cada uno.
- Si no lo tiene, por el **CUIT** (columna F).
- Para un integrante nuevo, agregalo en Integrantes con su CUIT. Si todavía no lo sabés, la primera transferencia va a **Por revisar** y te muestra el CUIT para copiarlo.

## Seguridad

- Compartí la planilla con el equipo **solo como Lector o Comentarista, nunca como Editor**. Un editor puede cambiar el código que corre con tu clave de Mercado Pago.
- La planilla tiene CUIT y cuentas de los integrantes: para el grupo usá el resumen, no la planilla completa.

## Límites conocidos

- **Transferencias desde bancos:** Mercado Pago no informa quién las envía. Conviene pedir que paguen desde Mercado Pago.
- **Efectivo:** se sigue cargando a mano en Pagos.
- **Demora:** los pagos aparecen con hasta 30 minutos de demora. Mercado Pago no avisa al instante de las transferencias recibidas.
- **Links de pago:** el script todavía no lee los pagos hechos con link de pago (solo transferencias).
- **Clave vencida:** si Mercado Pago la renueva o la revocás, el resultado en Config dice "rechazó la clave (401)". Guardá la nueva desde el menú.

## Pruebas

`test/` tiene un simulador de Google Sheets y de la API de Mercado Pago con 74 casos. Para correrlo:

```
TZ=America/Argentina/San_Juan node apps-script/test/run.js
```
