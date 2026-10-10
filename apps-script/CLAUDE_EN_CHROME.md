# Instalación con Claude en Chrome

Prompt para pegar en la extensión **Claude en Chrome**. Instala el script, publica la app del equipo y hace la primera sincronización. Vos intervenís solo en cuatro momentos: autorizar permisos de Google, pegar la clave de Mercado Pago, decir el nombre del grupo de WhatsApp y confirmar el envío.

## Antes de empezar

1. **Computadora con Chrome** y la extensión conectada. El editor de Apps Script no funciona en el celular.
2. **Una sola cuenta de Google en ese Chrome:** luciogomez@gmail.com. Si también tenés abierta la cuenta del trabajo (vspt.com.ar), cerrá esa sesión o usá un perfil de Chrome que solo tenga la personal. Con dos cuentas abiertas, Apps Script suele fallar al autorizar o abrir el editor.
3. **Dejá abierta en otra pestaña la página de la clave, pero no la copies todavía:** Mercado Pago Developers → Tus integraciones → HockeyCaja → Credenciales de producción (Access Token, empieza con `APP_USR-`). Claude te avisa cuándo copiarla (paso 7). Así nunca queda en el portapapeles mientras Claude copia y pega el código, y el cuadro de la planilla no se vence mientras la buscás.
4. **Cuando Claude te pida autorizar:** en la ventana de Google elegí tu cuenta → Configuración avanzada → Ir a Caja Hockey (no seguro) → tildá **todos** los permisos (Seleccionar todo) → Continuar. Si dejás alguno sin tildar, la sincronización no funciona.
5. **Si alguna vez cargaste la clave en Apps Script → Configuración del proyecto → Propiedades de la secuencia de comandos** (lo decía una versión vieja de la guía), borrá esa propiedad antes de empezar. Ahora la clave se guarda desde el menú de la planilla.

## Prompt

Copiá todo el bloque y pegalo en Claude en Chrome:

```text
Necesito que instales el script "Caja Hockey" en mi planilla de Google, publiques la app del equipo y hagas la primera sincronización. Seguí los pasos en orden.

REGLAS (obligatorias)
1. Clave de Mercado Pago: nunca la busques, la leas, la copies, la escribas ni la veas. En el paso 7, apenas aparezca el cuadro "Clave de Mercado Pago", dejá de usar la pestaña de la planilla: ni capturas, ni read_page, ni find, ni leer texto, ni JavaScript, hasta que te escriba "listo". La pego yo, toco Aceptar y cierro el mensaje de confirmación.
2. Portapapeles: desde el paso 7 puede contener la clave. A partir de ahí no uses Ctrl+V / Cmd+V en ningún lado: escribí los textos con el teclado. Antes del paso 7, si al pegar aparece algo que no es el código esperado (por ejemplo una sola línea), no lo leas: deshacé con Ctrl+Z y avisame.
3. Permisos de Google: si aparece "Autorizar acceso", "Revisar permisos", "Se requiere autorización", "Elegir una cuenta", "Google no verificó esta app" o una lista de permisos, tocá como máximo una vez el botón "Autorizar acceso" o "Revisar permisos" (en el cuadro "Se requiere autorización" de la planilla, el botón "Continuar" o "Aceptar") y detenete. Escribime: "Autorizá en la ventana de Google: elegí luciogomez@gmail.com → Configuración avanzada → Ir a Caja Hockey (no seguro) → tildá Seleccionar todo → Continuar o Permitir. Después escribime listo." Esperá mi "listo". Si después la acción no se ejecutó sola, repetila.
4. Pestañas: usá una pestaña para la planilla, otra para Apps Script y otra para GitHub. Nunca navegues a otra dirección desde la pestaña de Apps Script. Guardá con Ctrl+S después de cada cambio. Si cerrás o recargás Apps Script con cambios sin guardar, aparece el aviso "¿Salir del sitio?" y te bloquea.
5. En "Configuración del proyecto" de Apps Script, solo tildá la casilla del manifiesto, que está arriba. No bajes ni leas el resto de esa página.
6. No cambies los permisos de compartir de ningún archivo. No envíes mensajes sin mi "sí".
7. En Mac usá Cmd en lugar de Ctrl.
8. Si algo falla 2 veces o la pantalla no coincide con lo que describo, detenete y contame qué ves.

DATOS
- Planilla: https://docs.google.com/spreadsheets/d/1KzrvFtW9n2OcQXuAWnoGjnQ_pZ1f0JMNw3xpL0Qom9U/edit
- Cuenta correcta: luciogomez@gmail.com.
- Código, en un repositorio público de GitHub. Cada página tiene el botón "Copy raw file" (ícono de dos hojas), arriba a la derecha del código, junto a "Raw":
  - Codigo.gs: https://github.com/luciopepi/HOCKEYAPP/blob/80611ed2df386d82a02bdf047f4f34b6a688ad3f/apps-script/Codigo.gs
  - Web.gs: https://github.com/luciopepi/HOCKEYAPP/blob/80611ed2df386d82a02bdf047f4f34b6a688ad3f/apps-script/Web.gs
  - App.html: https://github.com/luciopepi/HOCKEYAPP/blob/80611ed2df386d82a02bdf047f4f34b6a688ad3f/apps-script/App.html
  - appsscript.json: https://github.com/luciopepi/HOCKEYAPP/blob/80611ed2df386d82a02bdf047f4f34b6a688ad3f/apps-script/appsscript.json

CÓMO COPIAR CADA ARCHIVO
No escribas el código a mano: el editor agrega llaves y sangrías y lo rompe.
a. En la pestaña de GitHub, abrí la página del archivo y hacé clic en "Copy raw file".
b. En la pestaña de Apps Script, abrí el archivo destino, hacé clic dentro del código, Ctrl+A, Ctrl+V y Ctrl+S.
c. Verificá el principio y el final con esta tabla:
   | Archivo en Apps Script | Copiar desde | Empieza con | Termina con | Líneas aprox. |
   | Código.gs | Codigo.gs | /** · Caja Hockey: trae las transferencias de Mercado Pago… | console.log(texto); // corriendo desde un disparador, sin pantalla · } · } | 654 |
   | Web.gs | Web.gs | /** · App del equipo: página web de solo lectura… | .map(m => ({ fecha: m.fecha, … ingreso: m.ingreso })); · } | 167 |
   | App.html | App.html | <!DOCTYPE html> | </script> · </body> · </html> | 261 |
   | appsscript.json | appsscript.json | { · "timeZone": "America/Argentina/San_Juan", | "https://www.googleapis.com/auth/script.container.ui" · ] · } | 12 |
d. Si Ctrl+V no pega nada, reintentá una vez. Si sigue sin pegar, pedime que haga yo clic en el editor, Ctrl+A y Ctrl+V.

PASOS

1. Abrí la planilla en una pestaña nueva y confirmá que la cuenta es luciogomez@gmail.com (avatar arriba a la derecha).

2. Menú Extensiones → Apps Script. Se abre otra pestaña con el editor.
   - Confirmá que el avatar sea luciogomez@gmail.com. Si aparece un selector de cuenta, otra cuenta, o "Lo sentimos, no se puede abrir el archivo", detenete y avisame.
   - Si el proyecto se llama "Proyecto sin título", hacé clic en el nombre y cambialo a "Caja Hockey".
   - Mirá qué archivos hay. Si ya existen Web.gs o App.html, reemplazá su contenido en vez de crear otros.

3. Manifiesto: barra izquierda → Configuración del proyecto (engranaje). Si la casilla "Mostrar el archivo de manifiesto "appsscript.json" en el editor" no está tildada, tildala; si ya está tildada, no la toques (regla 5). Volvé al Editor (ícono < >) y confirmá que appsscript.json aparece en la lista de archivos.

4. Copiá los 4 archivos con el procedimiento de arriba. Guardá cada uno:
   - Código.gs: ya existe. Reemplazá todo su contenido.
   - appsscript.json: reemplazá todo su contenido.
   - Web.gs: botón "+" junto a "Archivos" → "Secuencia de comandos" (o "Script") → escribí Web y Enter.
   - App.html: botón "+" → "HTML" → escribí App y Enter.
   Al terminar, la lista de archivos tiene que mostrar Código.gs, Web.gs, App.html y appsscript.json, sin archivos "Sin título" ni puntos de cambios sin guardar. Si al guardar aparece un error de sintaxis, decime el archivo y la línea, y detenete.

5. Publicá la app:
   - Si en "Implementar → Administrar implementaciones" ya hay una aplicación web, no crees otra: editala (lápiz), elegí "Versión: Nueva versión" e "Implementar". Así el link no cambia.
   - Si no hay ninguna: botón azul "Implementar" (arriba a la derecha) → "Nueva implementación" → engranaje de "Seleccionar tipo" → "Aplicación web".
     - Descripción: App del equipo.
     - Ejecutar como: Yo (luciogomez@gmail.com).
     - Quién tiene acceso: la opción que dice solo "Cualquier persona" o "Cualquier usuario" (en inglés "Anyone"). No elijas la que dice "con una cuenta de Google": esa obliga a todos a iniciar sesión.
     - Clic en "Implementar". Si pide autorización, aplicá la regla 3.
   - Cuando aparezca la "URL de la aplicación web" (termina en /exec), sacá el texto exacto leyendo la página (read_page o leer texto), no de una captura: son unos 70 caracteres al azar y es fácil confundir l, I y 1. Escribila en el chat. Decime también qué opción quedó en "Quién tiene acceso". Clic en "Listo".

6. Volvé a la pestaña de la planilla y recargala. Esperá hasta 30 segundos a que aparezca el menú "Caja Hockey". Si no aparece, recargá una vez más.

7. Caja Hockey → "Guardar clave de Mercado Pago".
   - Si aparece "Se requiere autorización", aplicá la regla 3 y después volvé a elegir el menú.
   - Cuando aparezca el cuadro "Clave de Mercado Pago", escribime: "Copiá el Access Token de la pestaña de Mercado Pago Developers, pegalo en el cuadro, tocá Aceptar y cerrá el mensaje 'Clave guardada'. Si el cuadro desaparece, da error o no ves 'Clave guardada', escribime 'no se guardó'. Si salió bien, copiá cualquier otra palabra para limpiar el portapapeles y escribime listo." Aplicá la regla 1 hasta mi respuesta.
   - Si te escribo "no se guardó", volvé a elegir Caja Hockey → "Guardar clave de Mercado Pago" y repetí este paso.

8. Caja Hockey → "Probar conexión con Mercado Pago". Copiame el resultado completo y cerrá el mensaje.
   - Si en vez de "Conectado como…" aparece un error (por ejemplo "rechazó la clave", "Falta la clave", "Mercado Pago respondió…" o "No encuentro la hoja"), detenete y avisame.
   - Si "Conectado como" no muestra mi nombre (Lucio), o dice "No hay transferencias recibidas en los últimos 7 días", detenete y avisame: seguramente la clave es de otra cuenta (en Pagos ya hay transferencias de Mercado Pago del 09/10, así que tiene que aparecer alguna). No sigas con los pasos 9 a 12 hasta que te diga.
   - Si alguna transferencia del 09/10 dice "(ya está en Pagos)", cambiá la fecha de importación:
     - Hacé clic en el cuadro de nombre (a la izquierda de la barra de fórmulas), escribí Config!B33 y Enter.
     - Confirmá que el cuadro de nombre dice B33 y que la celda de la izquierda dice "Importar pagos desde".
     - Escribí 09/10/2026 y Enter.
     - Volvé a Config!B33 con el cuadro de nombre y confirmá que la celda muestra 09/10/2026 alineado a la derecha, igual que antes (en la barra de fórmulas puede verse 9/10/2026: también está bien). Si muestra otra fecha o quedó alineado a la izquierda, Ctrl+Z y avisame. No toques B34.
   - Si ninguna lo dice, no cambies B33 y seguí con el paso 9. Contámelo en el resumen.

9. Caja Hockey → "Activar sincronización cada 30 minutos". Tiene que decir "Listo: la planilla se va a sincronizar con Mercado Pago cada 30 minutos." Cerrá el mensaje.

10. Caja Hockey → "Sincronizar ahora". Copiame el mensaje y cerralo. Después, con el cuadro de nombre, andá a Config!B35 y Config!B36 y leeme lo que muestra cada celda.
    - Si en el paso 8 cambiaste B33 a 09/10: abrí la hoja "Por revisar" y contame cuántas filas tienen fecha 09/10 y qué dice la columna Motivo de cada una (no copies nombres ni CUIT).

11. Abrí una pestaña nueva y escribí la URL /exec del paso 5 (no la pegues). Arriba puede aparecer un aviso de Google ("Esta aplicación fue creada por otro usuario"): es normal. Verificá que se vea "Caja del equipo" con el monto de la cancha y las 4 pestañas (Inicio, Planilla, Mi cuota, Caja). Tocá cada una y decime si alguna da error.
    - Si aparece "el archivo que solicitaste no existe", compará la URL letra por letra con la de Implementar → Administrar implementaciones y reintentá una vez.
    - Si sigue apareciendo una página de error, o alguna pestaña da error, copiame el texto exacto. No crees otra implementación ni sigas con el paso 12 hasta que te diga.

12. WhatsApp:
    - Preguntame el nombre exacto del grupo.
    - Abrí https://web.whatsapp.com en una pestaña nueva. Si pide escanear un código QR, avisame y esperá.
    - Buscá el grupo, abrilo y escribí este mensaje en un solo párrafo, con la URL exacta de la app que abrió bien en el paso 11 y sin apretar Enter:
      Ya está la app de la caja del hockey 🏑 [URL] Ahí ven quién pagó y cuánto falta para la cancha. En "Mi cuota" eligen su nombre y ven su estado. Para tenerla como app: en Android, menú ⋮ → "Agregar a la pantalla principal"; en iPhone, Compartir → "Agregar a inicio". Paguen por transferencia de Mercado Pago al alias luciopepi.
    - Decime el nombre del chat abierto y el texto escrito. Apretá Enter solo si te respondo "sí".

AL TERMINAR, dame un resumen con:
- URL de la app (/exec) y la opción de "Quién tiene acceso".
- Resultado de "Probar conexión" y qué hiciste con B33.
- Mensaje de "Sincronizar ahora" y los valores de Config B35 y B36.
- Si B33 quedó en 09/10: avisame que las filas del 09/10 en "Por revisar" son casi seguro pagos que ya cargué a mano (por ejemplo la transferencia bancaria de $15.000), para que no los vuelva a cargar en Pagos.
- Si se envió el mensaje de WhatsApp.
- Pasos que no se pudieron completar, si hubo alguno.
Cerrá la pestaña de GitHub. Dejá abiertas la planilla, Apps Script y la app.
```

## Después, en el celular

Abrí el link `/exec` y agregalo a la pantalla de inicio:

| Celular | Pasos |
|---|---|
| Android (Chrome) | Menú **⋮** → **Agregar a la pantalla principal** |
| iPhone (Safari) | **Compartir** → **Agregar a inicio** |
