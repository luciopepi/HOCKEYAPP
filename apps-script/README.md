# Sincronización con Mercado Pago

Script de Google Apps Script que trae las transferencias de Mercado Pago a la planilla **Caja Hockey**. Corre en los servidores de Google, gratis, cada 30 minutos.

## Qué hace

| Movimiento en Mercado Pago | Qué pasa en la planilla |
|---|---|
| Transferencia de un integrante reconocido (por su CUIT o su ID de Mercado Pago) | Se agrega sola en **Pagos** como "Cuota" |
| Transferencia que no se puede reconocer (por ejemplo, desde un banco: llega sin datos de quién la envió) | Va a la hoja **Por revisar** para que la asignes a mano |
| Pago enviado al club | Se agrega solo en **Gastos** como "Cancha" |
| Cualquier otro movimiento de tu cuenta | No se copia |

- Los pagos se cuentan por el monto bruto (antes de cualquier retención).
- Un mismo pago nunca se carga dos veces: se controla por el número de operación.
- Si un integrante ya tiene un pago del mismo monto ese día, el nuevo va a **Por revisar** como posible duplicado.

## Instalación (una sola vez, unos 10 minutos)

1. **Abrí la planilla** Caja Hockey en la computadora → menú **Extensiones → Apps Script**.
2. **Pegá el código:** borrá lo que haya en `Código.gs` y pegá todo el contenido de [`Codigo.gs`](Codigo.gs). Guardá (ícono de disquete).
3. **Permisos acotados (recomendado):**
   - En **Configuración del proyecto** (engranaje), tildá "Mostrar el archivo de manifiesto appsscript.json".
   - Volvé al editor, abrí `appsscript.json` y reemplazá su contenido por el de [`appsscript.json`](appsscript.json). Guardá.
   - Así el script solo puede tocar esta planilla y conectarse a Mercado Pago. No tiene acceso a tu Gmail ni a tu Drive.
4. **Guardá la clave de Mercado Pago:**
   - En Mercado Pago Developers → Tus integraciones → HockeyCaja → Credenciales de producción, copiá el **Access Token** (empieza con `APP_USR-`).
   - En Apps Script → **Configuración del proyecto → Propiedades de la secuencia de comandos → Agregar propiedad**.
     - Propiedad: `MP_ACCESS_TOKEN`
     - Valor: el Access Token.
   - Guardá.
   - **No pegues esta clave en la planilla, en un chat ni en WhatsApp.**
5. **Recargá la planilla.** Aparece el menú **Caja Hockey**.
6. **Caja Hockey → Probar conexión con Mercado Pago.**
   - La primera vez Google pide permiso. Va a decir "Google no verificó esta app", y es normal: la app es tuya.
   - Tocá **Configuración avanzada → Ir a … (no seguro)** y aceptá **todos** los permisos.
   - Vas a ver las transferencias de los últimos 7 días, con el integrante reconocido y si ya están en Pagos.
7. **Caja Hockey → Activar sincronización cada 30 minutos.** Listo.

## Uso diario

- No hace falta hacer nada: cada 30 minutos se cargan los pagos nuevos.
- En **Config** ves la última sincronización y su resultado (filas 35 y 36).
- Revisá de vez en cuando la hoja **Por revisar**. Si un ingreso es una cuota, cargalo en Pagos con el integrante. Si no, ignoralo.
- Para cargar algo ya: **Caja Hockey → Sincronizar ahora**.

## Cómo reconoce a cada integrante

- Primero por el **ID de Mercado Pago** (columna J de Integrantes). El script lo aprende solo con el primer pago de cada uno.
- Si no lo tiene, por el **CUIT** (columna F).
- Para un integrante nuevo, agregalo en Integrantes con su CUIT. Si todavía no lo sabés, la primera transferencia va a **Por revisar** y te muestra el CUIT para copiarlo.

## Límites conocidos

- **Transferencias desde bancos:** Mercado Pago no informa quién las envía. Siempre van a **Por revisar**. Conviene pedir que paguen desde Mercado Pago.
- **Efectivo:** se sigue cargando a mano en Pagos.
- **Demora:** los pagos aparecen con hasta 30 minutos de demora. Mercado Pago no avisa al instante de las transferencias recibidas.
- **Vencimiento de la clave:** si Mercado Pago la renueva o la revocás, el resultado en Config va a decir "rechazó la clave (401)". Cargá la nueva en las propiedades del script.
