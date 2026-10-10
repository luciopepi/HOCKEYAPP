/**
 * App del equipo: página web de solo lectura con el estado de la caja.
 *
 * Se publica desde Implementar > Nueva implementación > Aplicación web
 * ("Ejecutar como: yo", "Quién tiene acceso: cualquier persona").
 * Muestra solo apodos, estados de cuota, montos y totales: nunca CUIT,
 * cuentas, números de operación ni notas.
 */

const APP_CACHE = 'datosApp';
const APP_CACHE_SEG = 300; // los cambios hechos a mano se ven en hasta 5 minutos

function doGet() {
  const t = HtmlService.createTemplateFromFile('App');
  t.datos = JSON.stringify(datosApp_()).replace(/</g, '\\u003c');
  return t.evaluate()
    .setTitle('Caja Hockey')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')
    .addMetaTag('mobile-web-app-capable', 'yes');
}

/** Borra la copia en memoria para que la app muestre los datos nuevos. */
function limpiarCacheApp_() {
  try {
    CacheService.getScriptCache().remove(APP_CACHE);
  } catch (e) {
    // sin caché disponible: no pasa nada
  }
}

function datosApp_() {
  const cache = CacheService.getScriptCache();
  const guardado = cache.get(APP_CACHE);
  if (guardado) return JSON.parse(guardado);

  const ss = SpreadsheetApp.getActive();
  const res = porEtiqueta_(hoja_(ss, 'Resumen'));
  const cfg = hoja_(ss, HOJA.CONFIG);
  const datos = {
    actualizado: cfg.getRange(CELDA.ULTIMA_SYNC).getDisplayValue() || fechaTexto_(new Date()),
    mes: res.texto('Mes actual'),
    cuota: Number(cfg.getRange(CELDA.CUOTA).getValue()) || 0,
    alias: cfg.getRange('B7').getDisplayValue(),
    cancha: {
      costo: res.numero('Costo de la cancha ($)'),
      recaudado: res.numero('Recaudado para la cancha ($)'),
      faltan: res.numero('Faltan ($)'),
      pagaron: res.numero('Integrantes con el mes pago'),
      total: res.numero('Integrantes en total'),
      necesarios: res.numero('Integrantes necesarios para cubrir la cancha'),
      pagada: res.texto('Cancha del mes pagada') === 'Sí',
      vence: res.texto('Vence el'),
    },
    caja: {
      saldo: res.numero('Saldo en caja ($)'),
      adelantos: res.numero('Cuotas pagadas por adelantado ($)'),
      fondo: res.numero('Disponible para equipamiento ($)'),
      deuda: res.numero('Deuda total, incluido el mes actual ($)'),
      conDeuda: res.numero('Integrantes con deuda'),
    },
  };
  Object.assign(datos, cuotasApp_(ss, cfg));
  datos.movimientos = movimientosApp_(ss);

  try {
    cache.put(APP_CACHE, JSON.stringify(datos), APP_CACHE_SEG);
  } catch (e) {
    // datos demasiado grandes para la caché: se leen cada vez
  }
  return datos;
}

/** Lee la hoja Resumen como pares etiqueta → valor. */
function porEtiqueta_(h) {
  const n = h.getLastRow();
  const rango = h.getRange(1, 1, n, 2);
  const valores = rango.getValues();
  const textos = rango.getDisplayValues();
  const mapa = {};
  valores.forEach((f, i) => {
    const k = String(f[0]).trim();
    if (k) mapa[k] = { valor: f[1], texto: textos[i][1] };
  });
  return {
    numero: k => (mapa[k] && typeof mapa[k].valor === 'number') ? mapa[k].valor : 0,
    texto: k => (mapa[k] ? mapa[k].texto : ''),
  };
}

/** Meses, estado de cada integrante y sus pagos (sin datos personales). */
function cuotasApp_(ss, cfg) {
  const h = hoja_(ss, 'Cuotas');
  const n = h.getLastRow();
  const ancho = 19; // A:S
  const valores = h.getRange(1, 1, n, ancho).getValues();
  const textos = h.getRange(1, 1, n, ancho).getDisplayValues();
  const mesActual = cfg.getRange('B28').getValue();
  const meses = textos[0].slice(7);
  let mesIdx = valores[0].slice(7).findIndex(d =>
    d instanceof Date && mesActual instanceof Date &&
    d.getFullYear() === mesActual.getFullYear() && d.getMonth() === mesActual.getMonth());
  if (mesIdx < 0) mesIdx = 0;

  const integrantes = [];
  for (let i = 1; i < n; i++) {
    const apodo = String(textos[i][0]).trim();
    if (!apodo || apodo === 'Totales') break;
    integrantes.push({
      apodo: apodo,
      debe: Number(valores[i][4]) || 0,
      adelantado: Number(valores[i][5]) || 0,
      hasta: textos[i][6] === '-' ? '' : textos[i][6],
      estados: textos[i].slice(7),
    });
  }

  // Pagos de cada integrante, para "Mi cuota".
  const hp = hoja_(ss, HOJA.PAGOS);
  const np = hp.getLastRow() - 1;
  const pagos = {};
  if (np > 0) {
    const vp = hp.getRange(2, 1, np, 5).getValues();
    const tp = hp.getRange(2, 1, np, 5).getDisplayValues();
    vp.forEach((f, i) => {
      const apodo = String(f[1]).trim();
      if (!apodo || !(f[0] instanceof Date)) return;
      (pagos[apodo] = pagos[apodo] || []).push({
        t: f[0].getTime(), fecha: tp[i][0], monto: Number(f[2]) || 0, tipo: String(f[3]), medio: String(f[4]),
      });
    });
  }
  integrantes.forEach(m => {
    m.pagos = (pagos[m.apodo] || []).sort((a, b) => b.t - a.t).slice(0, 12)
      .map(p => ({ fecha: p.fecha, monto: p.monto, tipo: p.tipo, medio: p.medio }));
  });
  return { meses: meses, mesIdx: mesIdx, integrantes: integrantes };
}

/** Últimos ingresos y gastos, mezclados por fecha. */
function movimientosApp_(ss) {
  const lista = [];
  const hp = hoja_(ss, HOJA.PAGOS);
  const np = hp.getLastRow() - 1;
  if (np > 0) {
    const v = hp.getRange(2, 1, np, 5).getValues();
    const t = hp.getRange(2, 1, np, 5).getDisplayValues();
    v.forEach((f, i) => {
      if (!(f[0] instanceof Date) || !f[1]) return;
      lista.push({ t: f[0].getTime(), fecha: t[i][0], titulo: String(f[1]), detalle: [f[3], f[4]].filter(Boolean).join(' · '),
        monto: Number(f[2]) || 0, ingreso: true });
    });
  }
  const hg = hoja_(ss, HOJA.GASTOS);
  const ng = hg.getLastRow() - 1;
  if (ng > 0) {
    const v = hg.getRange(2, 1, ng, 4).getValues();
    const t = hg.getRange(2, 1, ng, 4).getDisplayValues();
    v.forEach((f, i) => {
      if (!(f[0] instanceof Date) || !f[3]) return;
      lista.push({ t: f[0].getTime(), fecha: t[i][0], titulo: String(f[2] || f[1]), detalle: String(f[1]),
        monto: Number(f[3]) || 0, ingreso: false });
    });
  }
  return lista.sort((a, b) => b.t - a.t).slice(0, 40)
    .map(m => ({ fecha: m.fecha, titulo: m.titulo, detalle: m.detalle, monto: m.monto, ingreso: m.ingreso }));
}

// ------------------------------------------------- panel del administrador
//
// Desde la app, con un PIN: cargar pagos a mano (efectivo), asignar las
// transferencias de "Por revisar" a un integrante y agregar integrantes.
// Las funciones admin* se pueden llamar desde cualquier navegador que abra la
// app, así que todas verifican el PIN antes de leer o escribir nada.

const PIN_PROP = 'ADMIN_PIN';
const PIN_FALLOS = 'adminFallos';
const PIN_MAX_FALLOS = 5;
const PIN_BLOQUEO_SEG = 900; // 15 minutos sin poder probar después de 5 PIN incorrectos
const IMPUTACIONES_APP = ['Cuota', 'Deuda anterior', 'Otro'];
const MEDIOS_APP = ['Efectivo', 'Transferencia bancaria', 'Transferencia Mercado Pago'];
const NOTA_APP = 'Cargado desde la app';
const NOTA_ASIGNADA = 'Transferencia de Mercado Pago asignada desde la app';
const MONTO_MAXIMO_APP = 1000000;

/** Menú de la planilla: define o cambia el PIN del panel del administrador. */
function definirPin() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('PIN del panel del administrador',
    'Elegí un PIN de 6 a 12 números. Lo vas a pedir en la app, en "Administrar":', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const pin = r.getResponseText().trim();
  if (!/^\d{6,12}$/.test(pin)) {
    ui.alert('El PIN tiene que tener de 6 a 12 números. No se guardó.');
    return;
  }
  const sal = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty(PIN_PROP, sal + ':' + hashPin_(sal, pin));
  CacheService.getScriptCache().remove(PIN_FALLOS);
  ui.alert('PIN guardado. En la app, tocá "Administrar" al pie de la pantalla.');
}

function hashPin_(sal, pin) {
  return Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sal + '|' + pin, Utilities.Charset.UTF_8));
}

function verificarPin_(pin) {
  const guardado = PropertiesService.getScriptProperties().getProperty(PIN_PROP);
  if (!guardado) {
    throw new Error('Todavía no hay PIN. Definilo en la planilla: menú Caja Hockey → Definir PIN del panel de administrador.');
  }
  const cache = CacheService.getScriptCache();
  const fallos = Number(cache.get(PIN_FALLOS)) || 0;
  if (fallos >= PIN_MAX_FALLOS) throw new Error('Demasiados intentos. Probá de nuevo en 15 minutos.');
  const corte = guardado.indexOf(':');
  const sal = guardado.slice(0, corte);
  if (hashPin_(sal, String(pin == null ? '' : pin).trim()) !== guardado.slice(corte + 1)) {
    cache.put(PIN_FALLOS, String(fallos + 1), PIN_BLOQUEO_SEG);
    throw new Error('PIN incorrecto.');
  }
}

function conLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('La planilla está ocupada sincronizando. Probá de nuevo en un minuto.');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** Lo que necesita el panel: integrantes y transferencias sin asignar (sin CUIT ni IDs). */
function adminDatos_() {
  const ss = SpreadsheetApp.getActive();
  const lista = [];
  const h = ss.getSheetByName(HOJA.REVISAR);
  const n = h ? h.getLastRow() - 1 : 0;
  if (n > 0) {
    const v = h.getRange(2, 1, n, COL_REVISAR.TOTAL).getValues();
    const t = h.getRange(2, 1, n, COL_REVISAR.TOTAL).getDisplayValues();
    v.forEach((f, i) => {
      const op = normalizarOp_(f[COL_REVISAR.OPERACION - 1]);
      if (String(f[2]) !== 'Ingreso' || !op) return;
      lista.push({ op: op, fecha: t[i][0], monto: Number(f[1]) || 0, medio: String(f[3]),
        nombre: String(f[4]), motivo: String(f[8]) });
    });
  }
  return {
    integrantes: leerMiembros_(hoja_(ss, HOJA.INTEGRANTES)).map(m => m.apodo),
    porRevisar: lista.reverse().slice(0, 50),
    pendientes: lista.length,
    cuota: Number(hoja_(ss, HOJA.CONFIG).getRange(CELDA.CUOTA).getValue()) || 0,
    hoy: Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd'),
  };
}

function respuestaAdmin_(mensaje) {
  SpreadsheetApp.flush();
  limpiarCacheApp_();
  return { mensaje: mensaje, admin: adminDatos_(), datos: datosApp_() };
}

function adminEntrar(pin) {
  verificarPin_(pin);
  CacheService.getScriptCache().remove(PIN_FALLOS);
  return adminDatos_();
}

/** Carga un pago a mano en Pagos (por ejemplo, efectivo). */
function adminCargarPago(pin, d) {
  verificarPin_(pin);
  d = d || {};
  return conLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const m = miembroPorApodo_(leerMiembros_(hoja_(ss, HOJA.INTEGRANTES)), d.apodo);
    const monto = Math.round(Number(d.monto) * 100) / 100;
    if (!(monto > 0 && monto <= MONTO_MAXIMO_APP)) throw new Error('Revisá el monto.');
    const fecha = fechaApp_(d.fecha);
    if (IMPUTACIONES_APP.indexOf(d.imputacion) === -1) throw new Error('Elegí la imputación.');
    if (MEDIOS_APP.indexOf(d.medio) === -1) throw new Error('Elegí el medio de pago.');
    const nota = String(d.nota == null ? '' : d.nota).replace(/\s+/g, ' ').trim().slice(0, 200);

    // Evita cargarlo dos veces si se toca el botón de nuevo.
    const clave = ['adminPago', m.apodo, monto, d.fecha, d.imputacion, d.medio].join('|');
    const cache = CacheService.getScriptCache();
    if (cache.get(clave)) throw new Error('Ese pago ya se cargó hace un momento.');

    agregarFilas_(hoja_(ss, HOJA.PAGOS), [[fecha, m.apodo, monto, d.imputacion, d.medio, '', '', '', '',
      nota ? NOTA_APP + '. ' + nota : NOTA_APP]], COL_PAGOS.TOTAL, [6, 7, 8, 9, 10], COLOR_MANUAL);
    cache.put(clave, '1', 120);
    return respuestaAdmin_('Listo: pago de ' + m.apodo + ' por ' + pesos_(monto) + ' guardado.');
  });
}

/**
 * Asigna una transferencia de "Por revisar" a un integrante: la pasa a Pagos y
 * guarda su CUIT e ID de Mercado Pago para que las próximas se carguen solas.
 * Otras transferencias pendientes de la misma cuenta se asignan también.
 */
function adminAsignar(pin, op, apodo) {
  verificarPin_(pin);
  return conLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const hInt = hoja_(ss, HOJA.INTEGRANTES);
    const miembros = leerMiembros_(hInt);
    const m = miembroPorApodo_(miembros, apodo);
    const hRev = ss.getSheetByName(HOJA.REVISAR);
    const n = hRev ? hRev.getLastRow() - 1 : 0;
    const filas = n > 0 ? hRev.getRange(2, 1, n, COL_REVISAR.TOTAL).getValues() : [];
    const buscado = normalizarOp_(op);
    const i = buscado ? filas.findIndex(f => normalizarOp_(f[COL_REVISAR.OPERACION - 1]) === buscado) : -1;
    if (i < 0) throw new Error('Esa transferencia ya no está en Por revisar. Actualizá la lista.');
    if (String(filas[i][2]) !== 'Ingreso') throw new Error('Solo se pueden asignar ingresos.');

    const cuit = soloDigitos_(filas[i][5]);
    const payerId = normalizarOp_(filas[i][6]);
    const elegidas = [i];
    filas.forEach((f, j) => {
      if (j === i || String(f[2]) !== 'Ingreso' || !/^No coincide/.test(String(f[8]))) return;
      if ((cuit && soloDigitos_(f[5]) === cuit) || (payerId && normalizarOp_(f[6]) === payerId)) elegidas.push(j);
    });

    const hPagos = hoja_(ss, HOJA.PAGOS);
    const enPagos = operaciones_(hPagos, COL_PAGOS.OPERACION);
    const cuota = Number(hoja_(ss, HOJA.CONFIG).getRange(CELDA.CUOTA).getValue()) || 0;
    const nuevas = [];
    elegidas.forEach(j => {
      const f = filas[j];
      const id = normalizarOp_(f[COL_REVISAR.OPERACION - 1]);
      if (enPagos.has(id)) return; // ya estaba cargada a mano
      const monto = Number(f[1]) || 0;
      const esCuota = cuota > 0 && monto % cuota === 0;
      nuevas.push([soloDia_(f[0] instanceof Date ? f[0] : new Date()), m.apodo, monto, esCuota ? 'Cuota' : 'Revisar',
        String(f[3]) || 'Transferencia Mercado Pago', texto_(f[4]), soloDigitos_(f[5]), '', id,
        esCuota ? NOTA_ASIGNADA
          : NOTA_ASIGNADA + '. El monto no es múltiplo de la cuota: separalo en filas (Cuota, Deuda anterior u Otro) con el mismo N° de operación.']);
      enPagos.add(id);
    });
    agregarFilas_(hPagos, nuevas, COL_PAGOS.TOTAL, [6, 7, 8, 9]);

    const aprendio = aprenderCuenta_(hInt, miembros, m, cuit, payerId);
    elegidas.sort((a, b) => b - a).forEach(j => hRev.deleteRow(j + 2));

    let texto = nuevas.length === 1 ? 'Listo: transferencia cargada a ' + m.apodo + '.'
      : nuevas.length ? 'Listo: ' + nuevas.length + ' transferencias cargadas a ' + m.apodo + '.'
      : 'Listo: esa transferencia ya estaba en Pagos; la saqué de Por revisar.';
    if (aprendio) texto += ' Guardé su cuenta: los próximos pagos desde ahí se cargan solos.';
    else if (!cuit && !payerId) texto += ' Mercado Pago no informa quién envía las transferencias de bancos: las próximas también van a Por revisar.';
    return respuestaAdmin_(texto);
  });
}

/** Suma el CUIT y el ID de Mercado Pago a la fila del integrante, si nadie más los tiene. */
function aprenderCuenta_(hInt, miembros, m, cuit, payerId) {
  let aprendio = false;
  const deOtro = (campo, valor) => miembros.some(x => x !== m && x[campo].indexOf(valor) !== -1);
  if (cuit && m.cuits.indexOf(cuit) === -1 && !deOtro('cuits', cuit)) {
    m.cuits.push(cuit);
    hInt.getRange(m.fila, COL_INT.CUIT).setNumberFormat('@').setValue(m.cuits.join(', '));
    aprendio = true;
  }
  if (payerId && m.ids.indexOf(payerId) === -1 && !deOtro('ids', payerId)) {
    m.ids.push(payerId);
    hInt.getRange(m.fila, COL_INT.ID_MP).setNumberFormat('@').setValue(m.ids.join(', '));
    aprendio = true;
  }
  return aprendio;
}

/**
 * Agrega un integrante al final de Integrantes y su fila en Cuotas, antes de
 * "Totales", con las mismas fórmulas que la fila anterior.
 */
function adminAgregarIntegrante(pin, d) {
  verificarPin_(pin);
  d = d || {};
  return conLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const hInt = hoja_(ss, HOJA.INTEGRANTES);
    const hCuo = hoja_(ss, 'Cuotas');
    const limpio = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
    const apodo = limpio(d.apodo, 30);
    if (!/^[\p{L}\d][\p{L}\d .'-]*$/u.test(apodo)) throw new Error('Escribí un apodo con letras o números.');
    const miembros = leerMiembros_(hInt);
    if (apodo.toLowerCase() === 'totales' || miembros.some(x => x.apodo.toLowerCase() === apodo.toLowerCase())) {
      throw new Error('Ya hay un integrante con ese apodo.');
    }
    const cuit = soloDigitos_(d.cuit);
    if (cuit && cuit.length !== 11) throw new Error('El CUIT tiene que tener 11 números.');
    const otro = cuit && miembros.find(x => x.cuits.indexOf(cuit) !== -1);
    if (otro) throw new Error('Ese CUIT ya está cargado para ' + otro.apodo + '.');

    const colA = hCuo.getRange(1, 1, hCuo.getLastRow(), 1).getValues().map(f => String(f[0]).trim());
    const filaTotales = colA.indexOf('Totales') + 1;
    const filaNueva = hInt.getLastRow() + 1;
    if (filaTotales < 3 || filaTotales !== filaNueva) {
      throw new Error('Las hojas Cuotas e Integrantes no están alineadas: agregalo a mano en la planilla.');
    }

    if (filaNueva > hInt.getMaxRows()) hInt.insertRowsAfter(hInt.getMaxRows(), 1);
    hInt.getRange(filaNueva - 1, 1, 1, COL_INT.TOTAL)
      .copyTo(hInt.getRange(filaNueva, 1, 1, COL_INT.TOTAL), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    [COL_INT.CUIT, COL_INT.ID_MP].forEach(c => hInt.getRange(filaNueva, c).setNumberFormat('@'));
    hInt.getRange(filaNueva, 1, 1, COL_INT.TOTAL).setValues([[filaNueva - 1, apodo, texto_(limpio(d.nombre, 40)),
      texto_(limpio(d.apellido, 40)), '', cuit, '', 'Agregado desde la app', 'No', '']]).setFontColor(COLOR_MANUAL);

    hCuo.insertRowBefore(filaTotales);
    const ancho = hCuo.getLastColumn();
    const previa = hCuo.getRange(filaTotales - 1, 1, 1, ancho);
    const nueva = hCuo.getRange(filaTotales, 1, 1, ancho);
    previa.copyTo(nueva, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    nueva.setFormulasR1C1(previa.getFormulasR1C1());

    return respuestaAdmin_('Listo: ' + apodo + ' agregado.' + (cuit
      ? ' Sus transferencias de Mercado Pago se van a cargar solas.'
      : ' Cuando llegue su primera transferencia, asignala desde "Transferencias sin asignar".'));
  });
}

function miembroPorApodo_(miembros, apodo) {
  const m = miembros.find(x => x.apodo === String(apodo == null ? '' : apodo).trim());
  if (!m) throw new Error('Elegí un integrante de la lista.');
  return m;
}

/** "2026-10-10" → fecha local; no acepta fechas futuras. */
function fechaApp_(s) {
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  const fecha = p ? new Date(Number(p[1]), Number(p[2]) - 1, Number(p[3])) : null;
  if (!fecha || fecha.getMonth() !== Number(p[2]) - 1 || fecha.getFullYear() < 2020 || fecha > soloDia_(new Date())) {
    throw new Error('Revisá la fecha.');
  }
  return fecha;
}

function pesos_(n) {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
