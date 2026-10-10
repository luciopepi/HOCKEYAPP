# Instalación con Claude en Chrome

Prompt para pegar en la extensión **Claude en Chrome**. Hace la instalación del script y publica la app del equipo. Solo te pide intervenir en tres momentos: autorizar permisos de Google, pegar la clave de Mercado Pago y confirmar el mensaje de WhatsApp.

Antes de empezar:

- Abrí Chrome con la extensión conectada y la sesión de **luciogomez@gmail.com** iniciada.
- Tené a mano el Access Token de producción de HockeyCaja (Mercado Pago Developers → Tus integraciones → HockeyCaja → Credenciales de producción).
- Usá la computadora: la app de Apps Script no funciona en el celular.

---

```text
Necesito que instales el script "Caja Hockey" en mi planilla de Google y publiques la app del equipo. Seguí estos pasos en orden. Trabajá en pestañas nuevas.

REGLAS (obligatorias)
1. Clave de Mercado Pago: nunca la busques, la leas, la copies ni la escribas. Cuando aparezca el cuadro "Clave de Mercado Pago", detenete, pedime que la pegue yo y no tomes capturas hasta que te diga "listo".
2. Permisos de Google: cuando aparezca "Se requiere autorización", "Elegir una cuenta", "Google no verificó esta app" o la lista de permisos, detenete y pedime que lo haga yo. Seguí cuando te diga "listo".
3. No cambies los permisos de compartir de la planilla ni de ningún archivo.
4. No envíes mensajes sin mi confirmación.
5. Antes de cerrar o recargar la pestaña de Apps Script, guardá con Ctrl+S (Cmd+S en Mac) para que no aparezca el aviso "¿Salir del sitio?".
6. Si algo falla 2 veces seguidas, o la pantalla no coincide con lo que describo, detenete y contame qué ves.

DATOS
- Planilla: https://docs.google.com/spreadsheets/d/1KzrvFtW9n2OcQXuAWnoGjnQ_pZ1f0JMNw3xpL0Qom9U/edit
- Cuenta correcta: luciogomez@gmail.com. Si la planilla abre con otra cuenta (por ejemplo una de vspt.com.ar), detenete y avisame.
- Código (repositorio público en GitHub; cada página tiene el botón "Copy raw file", ícono de dos hojas, arriba a la derecha del código):
  - Codigo.gs: https://github.com/luciopepi/HOCKEYAPP/blob/80611ed2df386d82a02bdf047f4f34b6a688ad3f/apps-script/Codigo.gs
  - Web.gs: https://github.com/luciopepi/HOCKEYAPP/blob/80611ed2df386d82a02bdf047f4f34b6a688ad3f/apps-script/Web.gs
  - App.html: https://github.com/luciopepi/HOCKEYAPP/blob/80611ed2df386d82a02bdf047f4f34b6a688ad3f/apps-script/App.html
  - appsscript.json: https://github.com/luciopepi/HOCKEYAPP/blob/80611ed2df386d82a02bdf047f4f34b6a688ad3f/apps-script/appsscript.json

CÓMO COPIAR CADA ARCHIVO (no lo escribas a mano: el editor agrega llaves y sangrías y rompe el código)
a. Abrí la página del archivo en GitHub y hacé clic en "Copy raw file".
b. Volvé a la pestaña de Apps Script, abrí el archivo destino, hacé clic dentro del código, Ctrl+A y Ctrl+V.
c. Verificá el principio y el final del archivo con la tabla de abajo.
d. Si Ctrl+V no pega nada, pedime que haga yo Ctrl+V con el cursor en el editor.

| Archivo en Apps Script | Copiar desde | Empieza con | Termina con | Líneas aprox. |
|---|---|---|---|---|
| Código.gs | Codigo.gs | /** Caja Hockey: trae las transferencias… | console.log(texto); // corriendo desde un disparador… } } | 654 |
| Web.gs | Web.gs | /** App del equipo: página web de solo lectura… | .map(m => ({ fecha: m.fecha, … ingreso: m.ingreso })); } | 167 |
| App.html | App.html | <!DOCTYPE html> | </script> </body> </html> | 261 |
| appsscript.json | appsscript.json | { "timeZone": "America/Argentina/San_Juan", | …script.container.ui" ] } | 12 |

PASOS

1. Abrí la planilla y confirmá que la cuenta es luciogomez@gmail.com (avatar arriba a la derecha).

2. Menú Extensiones → Apps Script. Se abre una pestaña nueva con el editor.
   - Si el proyecto se llama "Proyecto sin título", hacé clic en el nombre y cambialo a "Caja Hockey".
   - Si ya existen los archivos Web.gs o App.html, reemplazá su contenido en vez de crear otros.

3. Manifiesto: en la barra izquierda, Configuración del proyecto (engranaje) → tildá "Mostrar el archivo de manifiesto "appsscript.json" en el editor". Volvé al Editor (ícono < >).

4. Copiá los 4 archivos según la tabla:
   - Código.gs: ya existe. Reemplazá todo su contenido por Codigo.gs.
   - appsscript.json: reemplazá todo su contenido.
   - Web.gs: botón "+" junto a "Archivos" → "Secuencia de comandos" (Script) → nombre: Web (sin .gs).
   - App.html: botón "+" → "HTML" → nombre: App (sin .html).
   Guardá con Ctrl+S. Si aparece un error de sintaxis, decime el archivo y la línea, y detenete.

5. Publicá la app: botón azul "Implementar" (arriba a la derecha) → "Nueva implementación".
   - En "Seleccionar tipo" (engranaje) elegí "Aplicación web".
   - Descripción: App del equipo.
   - Ejecutar como: Yo (luciogomez@gmail.com).
   - Quién tiene acceso: Cualquier persona.
   - Clic en "Implementar". Google va a pedir autorización: aplicá la regla 2.
   - Cuando aparezca la "URL de la aplicación web" (termina en /exec), copiala y mostrámela. Clic en "Listo".

6. Volvé a la pestaña de la planilla y recargala. Esperá a que aparezca el menú "Caja Hockey" (puede tardar unos segundos después de cargar).

7. Caja Hockey → "Guardar clave de Mercado Pago". Aplicá la regla 1. Si vuelve a pedir autorización, aplicá la regla 2. Seguí cuando te diga "listo" y veas el mensaje "Clave guardada".

8. Caja Hockey → "Probar conexión con Mercado Pago". Leé el resultado y copiámelo completo.
   - Si alguna transferencia del 09/10 dice "(ya está en Pagos)": en la hoja Config, celda B33, escribí 09/10/2026 y Enter.
   - Si ninguna lo dice: no cambies B33 (queda 10/10/2026) y avisame cuáles transferencias del 09/10 aparecen.
   - Si dice "rechazó la clave" o "Falta la clave", detenete y avisame.

9. Caja Hockey → "Activar sincronización cada 30 minutos". Tiene que decir "Listo: la planilla se va a sincronizar…".

10. Caja Hockey → "Sincronizar ahora". Copiame el mensaje. Después, en la hoja Config, leeme las celdas B35 (última sincronización) y B36 (resultado).

11. Abrí la URL /exec del paso 5 en una pestaña nueva. Arriba puede aparecer un aviso de Google ("Esta aplicación fue creada por otro usuario"): es normal. Verificá que se vea "Caja del equipo" con el monto de la cancha y las 4 pestañas (Inicio, Planilla, Mi cuota, Caja). Tocá cada pestaña y decime si alguna da error.

12. Prepará este mensaje para el grupo de WhatsApp del hockey, con la URL real:
    "Ya está la app de la caja del hockey 🏑 [URL]. Ahí ven quién pagó, cuánto falta para la cancha y en 'Mi cuota' eligen su nombre para ver su estado. Para tenerla como app: en Android, menú ⋮ → 'Agregar a la pantalla principal'; en iPhone, Compartir → 'Agregar a inicio'. Paguen por Mercado Pago al alias luciopepi así se registra solo."
    Mostrámelo y preguntame si lo envío por WhatsApp Web. Enviá solo si te digo que sí.

AL TERMINAR, dame un resumen con:
- URL de la app (/exec).
- Resultado de "Probar conexión" y qué hiciste con B33.
- Valores de Config B35 y B36.
- Pasos que no se pudieron completar, si hubo alguno.
Cerrá las pestañas de GitHub que abriste. Dejá abiertas la planilla, Apps Script y la app.
```

---

## Después, en el celular

Abrí el link `/exec` y agregalo a la pantalla de inicio:

| Celular | Pasos |
|---|---|
| Android (Chrome) | Menú **⋮** → **Agregar a la pantalla principal** |
| iPhone (Safari) | **Compartir** → **Agregar a inicio** |
