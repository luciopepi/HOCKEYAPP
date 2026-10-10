# Sincronización con Mercado Pago y app del equipo

Script de Google Apps Script para la planilla **Caja Hockey**. Corre en los servidores de Google, gratis:

- [`Codigo.gs`](Codigo.gs) trae las transferencias de Mercado Pago cada 30 minutos.
- [`Web.gs`](Web.gs) y [`App.html`](App.html) publican la **app del equipo**: una página para el celular con el estado de la caja.

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

> **Atajo:** [`CLAUDE_EN_CHROME.md`](CLAUDE_EN_CHROME.md) tiene un prompt para que la extensión Claude en Chrome haga la instalación y publique la app. Vos solo autorizás los permisos y pegás la clave.

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

## App del equipo (para el celular)

Página de solo lectura. Muestra la cancha del mes, quién falta pagar, la planilla de cuotas, "Mi cuota" y los movimientos. **No muestra** CUIT, cuentas, números de operación ni notas.

### Publicarla (una sola vez, desde la computadora)

1. En el editor de Apps Script, **+ → Script**, nombre `Web`. Pegá el contenido de [`Web.gs`](Web.gs).
2. **+ → HTML**, nombre `App`. Pegá el contenido de [`App.html`](App.html). Guardá.
3. **Implementar → Nueva implementación:**
   - Tipo: **Aplicación web** (engranaje junto a "Seleccionar tipo").
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier persona**.
4. **Implementar** y copiá la URL que termina en `/exec`. Ese es el link de la app.

### Compartirla

- Mandá el link `/exec` por WhatsApp (conviene fijarlo en el grupo).
- No hace falta cuenta de Google ni instalar nada.
- Cada uno elige su nombre en **Mi cuota** y queda guardado en su celular.

### Instalarla en el celular (ícono en la pantalla de inicio)

| Celular | Pasos |
|---|---|
| Android (Chrome) | Abrir el link → menú **⋮** → **Agregar a la pantalla principal** |
| iPhone (Safari) | Abrir el link → **Compartir** (cuadrado con flecha) → **Agregar a inicio** |

### A tener en cuenta

- Arriba aparece un aviso de Google ("Esta aplicación fue creada por otro usuario"). Es normal en las apps de Apps Script.
- Los pagos sincronizados aparecen al instante en la app. Los cambios hechos a mano en la planilla, en hasta 5 minutos.
- Si actualizás `Web.gs` o `App.html`: **Implementar → Administrar implementaciones → editar (lápiz) → Versión: Nueva versión → Implementar**. El link no cambia.
- Cualquiera con el link ve los apodos, las cuotas y los montos. No lo publiques fuera del grupo.

## Panel del administrador (en la app)

Desde la app, con un PIN, podés:

- **Cargar pago:** efectivo u otro pago que no llega por Mercado Pago (por ejemplo, Alfredo).
- **Asignar transferencias sin asignar:** las que quedaron en **Por revisar**. Elegís de quién es y pasa a Pagos. Además se guarda el CUIT y el ID de Mercado Pago de esa cuenta en Integrantes: **los próximos pagos desde ahí se cargan solos**. Si había otras pendientes de la misma cuenta, se asignan también.
- **Agregar integrante:** se suma al final de Integrantes y a la planilla de Cuotas. Con el CUIT, sus transferencias se cargan solas desde la primera.

### Activarlo (una vez, desde la computadora)

1. Pegá las versiones nuevas de `Codigo.gs`, `Web.gs` y `App.html` en Apps Script y guardá.
2. **Implementar → Administrar implementaciones → lápiz → Versión: Nueva versión → Implementar.** El link de la app no cambia.
3. Recargá la planilla → **Caja Hockey → Definir PIN del panel de administrador** (6 a 12 números).
4. En la app, al pie de la pantalla: **Administrar** → PIN. Tildá "Recordar en este celular" solo en tu celular.

### Seguridad del panel

- El PIN se verifica en el servidor en cada acción. Se guarda cifrado (hash con sal) en las propiedades del script.
- Después de 5 PIN incorrectos, el panel se bloquea 15 minutos para todos.
- Cualquiera con el PIN puede cargar pagos: no lo compartas. Para cambiarlo, repetí "Definir PIN".
- El panel no muestra CUIT ni números de cuenta.
- Las funciones del menú (activar o desactivar la sincronización, probar conexión) solo funcionan desde la planilla, no desde la app.

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
- Para un integrante nuevo, agregalo desde el panel de la app (o en Integrantes, con su fila en Cuotas). Si no sabés su CUIT, la primera transferencia va a **Por revisar**: asignala desde el panel y las siguientes se cargan solas.
- Si alguien paga desde dos cuentas, poné los dos CUIT en la misma celda separados por coma.

## Seguridad

- Compartí la planilla con el equipo **solo como Lector o Comentarista, nunca como Editor**. Un editor puede cambiar el código que corre con tu clave de Mercado Pago.
- La planilla tiene CUIT y cuentas de los integrantes: para el grupo usá el resumen, no la planilla completa.

## Límites conocidos

- **Transferencias desde bancos:** Mercado Pago no informa quién las envía. Conviene pedir que paguen desde Mercado Pago.
- **Efectivo:** se carga desde el panel de la app (o a mano en Pagos).
- **Demora:** los pagos aparecen con hasta 30 minutos de demora. Mercado Pago no avisa al instante de las transferencias recibidas.
- **Links de pago:** el script todavía no lee los pagos hechos con link de pago (solo transferencias).
- **Clave vencida:** si Mercado Pago la renueva o la revocás, el resultado en Config dice "rechazó la clave (401)". Guardá la nueva desde el menú.

## Pruebas

`test/` tiene un simulador de Google Sheets y de la API de Mercado Pago con 124 casos, incluidos la app del equipo y el panel del administrador. Para correrlo:

```
TZ=America/Argentina/San_Juan node apps-script/test/run.js
```
