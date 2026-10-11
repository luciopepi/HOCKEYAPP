/**
 * App del equipo (página web) y panel del administrador.
 *
 * Se publica desde Implementar > Nueva implementación > Aplicación web
 * ("Ejecutar como: yo", "Quién tiene acceso: cualquier persona").
 * Sin ingresar se ve la cancha del mes, la caja, los gastos y quién está al día
 * o debe (en cantidad de cuotas). Nunca CUIT, cuentas, números de operación,
 * notas ni montos pagados por cada uno (DISENO.md, decisiones 7, 27 y 28).
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

function fechaCorta_(d) {
  return d instanceof Date ? Utilities.formatDate(d, ZONA, 'dd/MM') : '';
}

function fechaLarga_(d) {
  return d instanceof Date ? Utilities.formatDate(d, ZONA, 'dd/MM/yyyy') : '';
}

/** Datos públicos de la app. */
function datosApp_() {
  const cache = CacheService.getScriptCache();
  const guardado = cache.get(APP_CACHE);
  if (guardado) return JSON.parse(guardado);

  const ss = SpreadsheetApp.getActive();
  asegurarEstructura_(ss);
  const d = leerDatos_(ss);
  const est = calcularEstado_(d);
  const cfg = hoja_(ss, HOJA.CONFIG);
  const diaVence = Number(cfg.getRange(CELDA.VENCIMIENTO).getValue()) || 10;
  const c = est.cancha;

  const datos = {
    actualizado: cfg.getRange(CELDA.ULTIMA_SYNC).getDisplayValue() || fechaTexto_(new Date()),
    mes: nombreMes_(est.mesActual),
    cuotaMes: est.cuotaMes,
    alias: cfg.getRange(CELDA.ALIAS).getDisplayValue(),
    pendientes: est.porClasificar + porRevisar_(ss).length,
    cancha: {
      costo: c.costo, recaudado: c.recaudado, faltan: c.faltan, pagaron: c.pagaron, total: c.total,
      necesarios: c.necesarios, pagada: c.pagada, fechaPago: fechaCorta_(c.fechaPago),
      vence: fechaCorta_(new Date(est.mesActual.getFullYear(), est.mesActual.getMonth(), diaVence)),
    },
    caja: {
      saldo: est.caja.saldo, saldoInicial: est.caja.saldoInicial, cobrado: est.caja.cobrado,
      gastado: est.caja.gastado, adelantos: est.caja.adelantos, fondo: est.caja.fondo,
    },
    meses: est.meses.map(m => ({ corto: MESES_CORTOS[m.getMonth()], largo: nombreMes_(m) })),
    mesIdx: est.idxActual,
    integrantes: est.integrantes.filter(x => x.activo || x.deuda > 0).map(x => ({
      apodo: x.apodo,
      estados: x.estados.map(s => ({ e: s.e, medio: s.medio })),
      cuotasDebe: x.cuotasDebe,
      hasta: x.hasta ? nombreMes_(x.hasta) : '',
      baja: !!x.baja,
    })),
    valores: tablaValores_(d.valores).map(v => ({ desde: v.texto, cuota: v.cuota, cancha: v.cancha })),
    porMes: est.porMes.slice().reverse().map(p => ({ mes: nombreMes_(p.mes), cuotas: p.cuotas, otros: p.otros })),
    gastos: d.gastos.slice().sort((a, b) => b.fecha - a.fecha).slice(0, 30).map(g => ({
      fecha: fechaCorta_(g.fecha), concepto: g.concepto || g.tipo, tipo: g.tipo, destinatario: sinCuentas_(g.destinatario), monto: g.monto,
    })),
  };

  try {
    cache.put(APP_CACHE, JSON.stringify(datos), APP_CACHE_SEG);
  } catch (e) {
    // datos demasiado grandes para la caché: se leen cada vez
  }
  return datos;
}

/** Saca CVU, CBU, CUIT, alias y números largos de un texto que se muestra en público. */
function sinCuentas_(texto) {
  return String(texto || '')
    .replace(/\([^)]*\d{6,}[^)]*\)/g, '')
    .replace(/\b(CVU|CBU|CUIT|CUIL|alias|cuenta)\b[:\s]*[\w.\-\/$]*/gi, '')
    .replace(/\d[\d.\-\/ ]{5,}\d/g, '')
    .replace(/\s{2,}/g, ' ').replace(/[\s·,;:-]+$/, '').trim();
}

/** Valores vigentes en cada cambio, con los dos montos completos. */
function tablaValores_(valores) {
  return valores.map(v => ({
    clave: claveMes_(v.desde),
    texto: nombreMes_(v.desde),
    cuota: valorEn_(valores, 'cuota', v.desde),
    cancha: valorEn_(valores, 'cancha', v.desde),
  }));
}

/** Ingresos de "Por revisar" (transferencias sin asignar). */
function porRevisar_(ss) {
  const h = ss.getSheetByName(HOJA.REVISAR);
  const n = h ? h.getLastRow() - 1 : 0;
  if (n < 1) return [];
  const v = h.getRange(2, 1, n, COL_REVISAR.TOTAL).getValues();
  const t = h.getRange(2, 1, n, COL_REVISAR.TOTAL).getDisplayValues();
  const lista = [];
  v.forEach((f, i) => {
    const op = normalizarOp_(f[COL_REVISAR.OPERACION - 1]);
    if (String(f[2]) !== 'Ingreso' || !op) return;
    lista.push({ fila: i + 2, op: op, fecha: t[i][0], monto: Number(f[1]) || 0, medio: String(f[3]),
      nombre: String(f[4]), cuit: soloDigitos_(f[5]), payerId: normalizarOp_(f[6]), motivo: String(f[8]) });
  });
  return lista;
}

// ------------------------------------------------- panel del administrador
//
// Las funciones admin* se pueden llamar desde cualquier navegador que abra la
// app, así que todas verifican el PIN antes de leer o escribir nada.
// Las constantes de acá no usan las de otros archivos: Apps Script carga los
// archivos en el orden de la lista y Calculo.gs puede quedar después de Web.gs.

const PIN_PROP = 'ADMIN_PIN';
const FALLOS_PROP = 'ADMIN_FALLOS';
const TOKENS_PROP = 'ADMIN_CELULARES';
const MAX_CELULARES = 5;
const PIN_MAX_FALLOS = 5;
const PIN_BLOQUEO_SEG = 900; // 15 minutos sin poder probar después de 5 PIN incorrectos
const TIPOS_GASTO = ['Equipamiento', 'Cancha', 'Otro'];
const NOTA_APP = 'Cargado desde la app';
const NOTA_ASIGNADA = 'Transferencia de Mercado Pago asignada desde la app';
const MONTO_MAXIMO_APP = 1000000;
const IMAGEN_MAXIMA = 6 * 1024 * 1024; // en caracteres base64
const CARPETA_PROP = 'CARPETA_COMPROBANTES';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';

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
  const props = PropertiesService.getScriptProperties();
  props.setProperty(PIN_PROP, sal + ':' + hashPin_(sal, pin));
  props.deleteProperty(FALLOS_PROP);
  props.deleteProperty(TOKENS_PROP); // un PIN nuevo cierra la sesión de los celulares recordados
  ui.alert('PIN guardado. En la app, tocá "Administrar" al pie de la pantalla.');
}

function hashPin_(sal, pin) {
  return Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sal + '|' + pin, Utilities.Charset.UTF_8));
}

/**
 * La credencial es el PIN o, en un celular que eligió "Recordar", un código largo
 * ("t:…") que se entrega al entrar. Los intentos fallidos de PIN bloquean el PIN
 * 15 minutos, pero no los celulares recordados: nadie puede dejar afuera al
 * administrador probando PIN equivocados.
 */
function verificarPin_(cred) {
  const props = PropertiesService.getScriptProperties();
  const guardado = props.getProperty(PIN_PROP);
  if (!guardado) {
    throw new Error('Todavía no hay PIN. Definilo en la planilla: menú Caja Hockey → Definir PIN del panel de administrador.');
  }
  const c = String(cred == null ? '' : cred).trim();
  if (/^t:[0-9a-f]{64}$/.test(c)) {
    if (celulares_(props).some(t => t.h === hashPin_('celular', c))) return;
    throw new Error('PIN incorrecto.');
  }
  const lock = LockService.getUserLock(); // aparte del lock de la sincronización
  lock.waitLock(10000);
  try {
    const ahora = Date.now();
    let f = { n: 0, desde: ahora };
    try { f = JSON.parse(props.getProperty(FALLOS_PROP) || '') || f; } catch (e) { /* sin fallos */ }
    if (ahora - f.desde >= PIN_BLOQUEO_SEG * 1000) f = { n: 0, desde: ahora };
    if (f.n >= PIN_MAX_FALLOS) throw new Error('Demasiados intentos. Probá de nuevo en 15 minutos.');
    const corte = guardado.indexOf(':');
    if (hashPin_(guardado.slice(0, corte), c) !== guardado.slice(corte + 1)) {
      f.n += 1;
      props.setProperty(FALLOS_PROP, JSON.stringify(f));
      throw new Error('PIN incorrecto.');
    }
  } finally {
    lock.releaseLock();
  }
}

function celulares_(props) {
  try {
    return JSON.parse(props.getProperty(TOKENS_PROP) || '[]');
  } catch (e) {
    return [];
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

/** Todo lo que muestra el panel. Nunca CUIT ni IDs de cuentas. */
function adminDatos_() {
  const ss = SpreadsheetApp.getActive();
  asegurarEstructura_(ss);
  const d = leerDatos_(ss);
  const est = calcularEstado_(d);
  const porMiembro = {};
  d.miembros.forEach(m => { porMiembro[m.apodo] = m; });
  const mesesSel = (desde, hasta) => {
    const lista = [];
    for (let i = desde; i <= hasta; i++) {
      const m = sumarMeses_(est.mesActual, i);
      if (m >= d.inicio) lista.push({ clave: claveMes_(m), texto: nombreMes_(m) });
    }
    return lista;
  };
  let url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { url = ''; }

  return {
    hoy: Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd'),
    mes: nombreMes_(est.mesActual),
    cuotaMes: est.cuotaMes,
    canchaMes: est.cancha.costo,
    url: url,
    porRevisar: porRevisar_(ss).reverse().slice(0, 50).map(x => ({
      op: x.op, fecha: x.fecha, monto: x.monto, medio: x.medio, nombre: x.nombre, motivo: x.motivo,
      banco: !x.cuit && !x.payerId,
    })),
    porClasificar: d.pagos.filter(p => p.imputacion === IMP.CLASIFICAR).reverse().map(p => ({
      fila: p.fila, apodo: p.apodo, fecha: fechaLarga_(p.fecha), monto: p.monto, medio: p.medio,
    })),
    integrantes: est.integrantes.map(x => {
      const m = porMiembro[x.apodo] || { cuits: [], ids: [] };
      return {
        apodo: x.apodo, deuda: x.deuda, adelantado: x.adelantado, cuotasDebe: x.cuotasDebe, auto: x.auto,
        baja: x.baja ? nombreMes_(x.baja) : '', alta: fechaLarga_(x.alta), hasta: x.hasta ? nombreMes_(x.hasta) : '',
        cuentas: m.cuits.length + m.ids.length,
      };
    }),
    valores: tablaValores_(d.valores),
    mesActual: claveMes_(est.mesActual),
    mesesBaja: mesesSel(-3, 12),
    mesesValor: mesesSel(0, 12),
  };
}

function respuestaAdmin_(mensaje, extra) {
  SpreadsheetApp.flush();
  recalcular_();
  return Object.assign({ mensaje: mensaje, admin: adminDatos_(), datos: datosApp_() }, extra || {});
}

/** Entra al panel. Con "recordar", devuelve un código para este celular en lugar de guardar el PIN. */
function adminEntrar(cred, recordar) {
  verificarPin_(cred);
  const props = PropertiesService.getScriptProperties();
  const datos = adminDatos_();
  if (!/^t:/.test(String(cred))) {
    props.deleteProperty(FALLOS_PROP);
    if (recordar) {
      const token = 't:' + (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase();
      const lista = celulares_(props).concat([{ h: hashPin_('celular', token), desde: fechaTexto_(new Date()) }]);
      props.setProperty(TOKENS_PROP, JSON.stringify(lista.slice(-MAX_CELULARES)));
      datos.token = token;
    }
  }
  return datos;
}

/** "Salir del panel" en un celular recordado: ese código deja de servir. */
function adminSalir(cred) {
  const c = String(cred == null ? '' : cred).trim();
  if (!/^t:[0-9a-f]{64}$/.test(c)) return true;
  const props = PropertiesService.getScriptProperties();
  const h = hashPin_('celular', c);
  props.setProperty(TOKENS_PROP, JSON.stringify(celulares_(props).filter(t => t.h !== h)));
  return true;
}

/** Detalle de un integrante: meses con lo que falta y sus pagos, para reclasificar. */
function adminIntegrante(pin, apodo) {
  verificarPin_(pin);
  const ss = SpreadsheetApp.getActive();
  const d = leerDatos_(ss);
  const est = calcularEstado_(d);
  const x = est.integrantes.find(i => i.apodo === String(apodo == null ? '' : apodo).trim());
  if (!x) throw new Error('No encuentro ese integrante.');
  return {
    apodo: x.apodo, deuda: x.deuda, adelantado: x.adelantado, pagado: x.pagado, auto: x.auto,
    meses: x.estados.map((s, i) => ({ mes: nombreMes_(est.meses[i]), e: s.e, medio: s.medio, falta: s.falta }))
      .filter((s, i) => est.meses[i] <= est.mesActual && s.e !== 'nojuega'),
    pagos: d.pagos.filter(p => p.apodo === x.apodo).sort((a, b) => b.fecha - a.fecha).map(p => ({
      fila: p.fila, fecha: fechaLarga_(p.fecha), monto: p.monto, imputacion: p.imputacion, medio: p.medio,
    })),
  };
}

/** Carga un pago a mano en Pagos (efectivo). */
function adminCargarPago(pin, d) {
  verificarPin_(pin);
  d = d || {};
  return conLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const m = miembroPorApodo_(leerMiembros_(hoja_(ss, HOJA.INTEGRANTES)), d.apodo);
    const monto = montoValido_(d.monto);
    const fecha = fechaApp_(d.fecha);
    if ([IMP.CUOTA, IMP.OTRO_CAJA, IMP.NO_CAJA].indexOf(d.tipo) === -1) throw new Error('Elegí si es cuota, otra cosa de la caja o no es de la caja.');
    const nota = textoLibre_(d.nota, 200);

    // Evita cargarlo dos veces si se toca el botón de nuevo.
    const clave = ['adminPago', m.apodo, monto, d.fecha, d.tipo].join('|');
    const cache = CacheService.getScriptCache();
    if (cache.get(clave)) throw new Error('Ese pago ya se cargó hace un momento.');

    agregarFilas_(hoja_(ss, HOJA.PAGOS), [[fecha, m.apodo, monto, d.tipo, 'Efectivo', '', '', '', '',
      nota ? NOTA_APP + '. ' + nota : NOTA_APP]], COL_PAGOS.TOTAL, [6, 7, 8, 9, 10], COLOR_MANUAL);
    cache.put(clave, '1', 120);
    return respuestaAdmin_('Listo: pago de ' + m.apodo + ' por ' + pesos_(monto) + ' guardado.');
  });
}

/** Cambia la imputación de un pago (clasificar o reclasificar). */
function adminClasificar(pin, fila, imputacion, esperado) {
  verificarPin_(pin);
  return conLock_(() => {
    if ([IMP.CUOTA, IMP.DEUDA_ANTERIOR, IMP.OTRO_CAJA, IMP.NO_CAJA].indexOf(imputacion) === -1) throw new Error('Elegí una opción válida.');
    const ss = SpreadsheetApp.getActive();
    const h = hoja_(ss, HOJA.PAGOS);
    const f = Number(fila);
    if (!(f >= 2 && f <= h.getLastRow())) throw new Error('Ese pago ya no está. Actualizá la lista.');
    const v = h.getRange(f, 1, 1, 4).getValues()[0];
    esperado = esperado || {};
    if (String(v[1]).trim() !== String(esperado.apodo) || Number(v[2]) !== Number(esperado.monto)) {
      throw new Error('La planilla cambió. Actualizá la lista y probá de nuevo.');
    }
    h.getRange(f, 4).setValue(imputacion);
    return respuestaAdmin_('Listo: pago de ' + v[1] + ' por ' + pesos_(v[2]) + ' marcado como "' + imputacion + '".');
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
    const pendientes = porRevisar_(ss);
    const elegido = pendientes.find(x => x.op === normalizarOp_(op));
    if (!elegido) throw new Error('Esa transferencia ya no está en Por revisar. Actualizá la lista.');

    const { cuit, payerId } = elegido;
    const elegidas = [elegido].concat(pendientes.filter(x => x !== elegido && /^No coincide/.test(x.motivo) &&
      ((cuit && x.cuit === cuit) || (payerId && x.payerId === payerId))));

    const hPagos = hoja_(ss, HOJA.PAGOS);
    const hRev = hoja_(ss, HOJA.REVISAR);
    const enPagos = operaciones_(hPagos, COL_PAGOS.OPERACION);
    const valores = leerValores_(ss);
    const fechas = hRev.getRange(2, 1, hRev.getLastRow() - 1, 1).getValues();
    const nuevas = [];
    elegidas.forEach(x => {
      if (enPagos.has(x.op)) return; // ya estaba cargada a mano
      const f = fechas[x.fila - 2][0];
      const fecha = soloDia_(f instanceof Date ? f : new Date());
      const cuota = valorEn_(valores, 'cuota', primerDia_(fecha));
      const esCuota = cuota > 0 && x.monto % cuota === 0;
      nuevas.push([fecha, m.apodo, x.monto, esCuota ? IMP.CUOTA : IMP.CLASIFICAR,
        x.medio || 'Transferencia Mercado Pago', texto_(x.nombre), x.cuit, '', x.op,
        esCuota ? NOTA_ASIGNADA : NOTA_ASIGNADA + '. No es múltiplo de la cuota: clasificalo (Cuota o No es de la caja).']);
      enPagos.add(x.op);
    });
    agregarFilas_(hPagos, nuevas, COL_PAGOS.TOTAL, [6, 7, 8, 9]);

    const aprendio = aprenderCuenta_(hInt, miembros, m, cuit, payerId);
    elegidas.map(x => x.fila).sort((a, b) => b - a).forEach(f => hRev.deleteRow(f));

    let texto = nuevas.length === 1 ? 'Listo: transferencia cargada a ' + m.apodo + '.'
      : nuevas.length ? 'Listo: ' + nuevas.length + ' transferencias cargadas a ' + m.apodo + '.'
      : 'Listo: esa transferencia ya estaba en Pagos; la saqué de Por revisar.';
    if (aprendio) texto += ' Guardé su cuenta: los próximos pagos desde ahí se cargan solos.';
    else if (!cuit && !payerId) texto += ' Mercado Pago no informa quién envía las transferencias de bancos: las próximas también van a revisión.';
    return respuestaAdmin_(texto);
  });
}

/** Saca de "Por revisar" una transferencia que no es de la caja. No se vuelve a importar. */
function adminDescartar(pin, op) {
  verificarPin_(pin);
  return conLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const x = porRevisar_(ss).find(y => y.op === normalizarOp_(op));
    if (!x) throw new Error('Esa transferencia ya no está en Por revisar. Actualizá la lista.');
    hoja_(ss, HOJA.REVISAR).deleteRow(x.fila);
    return respuestaAdmin_('Listo: transferencia de ' + pesos_(x.monto) + ' marcada como que no es de la caja.');
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

/** Agrega un integrante al final de Integrantes. Cuotas se recalcula sola. */
function adminAgregarIntegrante(pin, d) {
  verificarPin_(pin);
  d = d || {};
  return conLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const hInt = hoja_(ss, HOJA.INTEGRANTES);
    const apodo = textoLibre_(d.apodo, 30);
    if (!/^[\p{L}\d][\p{L}\d .'-]*$/u.test(apodo)) throw new Error('Escribí un apodo con letras o números.');
    const miembros = leerMiembros_(hInt);
    if (miembros.some(x => x.apodo.toLowerCase() === apodo.toLowerCase())) throw new Error('Ya hay un integrante con ese apodo.');
    const cuit = soloDigitos_(d.cuit);
    if (cuit && cuit.length !== 11) throw new Error('El CUIT tiene que tener 11 números.');
    const otro = cuit && miembros.find(x => x.cuits.indexOf(cuit) !== -1);
    if (otro) throw new Error('Ese CUIT ya está cargado para ' + otro.apodo + '.');
    const alta = fechaApp_(d.alta, true);

    const fila = hInt.getLastRow() + 1;
    if (fila > hInt.getMaxRows()) hInt.insertRowsAfter(hInt.getMaxRows(), 1);
    hInt.getRange(fila - 1, 1, 1, COL_INT.TOTAL)
      .copyTo(hInt.getRange(fila, 1, 1, COL_INT.TOTAL), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    [COL_INT.CUIT, COL_INT.ID_MP].forEach(c => hInt.getRange(fila, c).setNumberFormat('@'));
    hInt.getRange(fila, COL_INT.ALTA).setNumberFormat('dd/mm/yyyy');
    hInt.getRange(fila, 1, 1, COL_INT.TOTAL).setValues([[fila - 1, apodo, texto_(textoLibre_(d.nombre, 40)),
      texto_(textoLibre_(d.apellido, 40)), '', cuit, '', 'Agregado desde la app', 'No', '', alta, '']]).setFontColor(COLOR_MANUAL);

    const medio = alta.getDate() > DIA_MEDIO_MES;
    return respuestaAdmin_('Listo: ' + apodo + ' agregado.' +
      (medio ? ' ' + nombreMes_(primerDia_(alta)) + ' paga media cuota.' : '') +
      (cuit ? ' Sus transferencias de Mercado Pago se van a cargar solas.'
        : ' Cuando llegue su primera transferencia, asignala desde "Para revisar".'));
  });
}

/** Baja (último mes que juega) o, con mes vacío, la deshace. */
function adminBaja(pin, apodo, ultimo) {
  verificarPin_(pin);
  return conLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const hInt = hoja_(ss, HOJA.INTEGRANTES);
    const m = miembroPorApodo_(leerMiembros_(hInt), apodo);
    if (!ultimo) {
      hInt.getRange(m.fila, COL_INT.ULTIMO).setValue('');
      return respuestaAdmin_('Listo: ' + m.apodo + ' vuelve a estar activo.');
    }
    const mes = mesApp_(ultimo);
    if (m.alta && mes < primerDia_(m.alta)) throw new Error('El último mes no puede ser anterior al alta.');
    hInt.getRange(m.fila, COL_INT.ULTIMO).setNumberFormat('mmm yyyy').setValue(mes);
    return respuestaAdmin_('Listo: ' + m.apodo + ' juega hasta ' + nombreMes_(mes) +
      '. Si debe algo, sigue figurando hasta que pague.');
  });
}

/**
 * Qué cambiaría con un valor nuevo, sin guardarlo: quiénes tienen ese mes pagado
 * por adelantado y pasarían a deber la diferencia, y cuántas cuotas cubren la cancha.
 */
function adminSimularValor(pin, d) {
  verificarPin_(pin);
  const ss = SpreadsheetApp.getActive();
  const datos = leerDatos_(ss);
  const nuevo = valorNuevo_(d, datos.inicio);
  const valores = conValor_(datos.valores, nuevo);
  const afectados = [];
  if (nuevo.tipo === 'cuota') {
    // Meses desde "vigente desde" que cada uno ya tiene pagados: la diferencia de precio de esos meses.
    const a = calcularEstado_(datos);
    const b = calcularEstado_(Object.assign({}, datos, { valores: valores }));
    a.integrantes.forEach((x, k) => {
      if (x.auto) return;
      let dif = 0;
      x.estados.forEach((s, i) => {
        if (a.meses[i] >= nuevo.desde && s.e === 'pagado') dif += b.integrantes[k].estados[i].c - s.c;
      });
      if (dif > 0) afectados.push({ apodo: x.apodo, diferencia: dif });
    });
  }
  const cuota = valorEn_(valores, 'cuota', nuevo.desde);
  return {
    afectados: afectados,
    necesarios: cuota > 0 ? Math.ceil(valorEn_(valores, 'cancha', nuevo.desde) / cuota) : 0,
    desde: nombreMes_(nuevo.desde),
  };
}

/** Guarda un valor nuevo de cuota o cancha "vigente desde" un mes. */
function adminNuevoValor(pin, d) {
  verificarPin_(pin);
  return conLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const datos = leerDatos_(ss);
    const nuevo = valorNuevo_(d, datos.inicio);
    const h = hojaValores_(ss);
    const col = nuevo.tipo === 'cuota' ? 2 : 3;
    const n = h.getLastRow() - 1;
    const filas = n > 0 ? h.getRange(2, 1, n, 1).getValues() : [];
    const i = filas.findIndex(f => f[0] instanceof Date && primerDia_(f[0]).getTime() === nuevo.desde.getTime());
    if (i >= 0) {
      h.getRange(i + 2, col).setValue(nuevo.monto);
    } else {
      const fila = [nuevo.desde, '', ''];
      fila[col - 1] = nuevo.monto;
      agregarFilas_(h, [fila], 3, [], COLOR_MANUAL);
      h.getRange(h.getLastRow(), 1).setNumberFormat('mmm yyyy');
      h.getRange(h.getLastRow(), 2, 1, 2).setNumberFormat('"$"#,##0');
    }
    return respuestaAdmin_('Listo: ' + (nuevo.tipo === 'cuota' ? 'cuota' : 'cancha') + ' de ' + pesos_(nuevo.monto) +
      ' desde ' + nombreMes_(nuevo.desde) + '.');
  });
}

function valorNuevo_(d, inicio) {
  d = d || {};
  if (d.tipo !== 'cuota' && d.tipo !== 'cancha') throw new Error('Elegí si cambia la cuota o la cancha.');
  const monto = montoValido_(d.monto);
  const desde = mesApp_(d.desde);
  if (desde < inicio) throw new Error('El mes tiene que ser desde el inicio de la temporada.');
  return { tipo: d.tipo, monto: monto, desde: desde };
}

function conValor_(valores, nuevo) {
  const copia = valores.map(v => Object.assign({}, v));
  const igual = copia.find(v => v.desde.getTime() === nuevo.desde.getTime());
  if (igual) igual[nuevo.tipo] = nuevo.monto;
  else copia.push({ desde: nuevo.desde, cuota: nuevo.tipo === 'cuota' ? nuevo.monto : null,
    cancha: nuevo.tipo === 'cancha' ? nuevo.monto : null });
  return copia.sort((a, b) => a.desde - b.desde);
}

// ------------------------------------------------------------- gastos

/**
 * Guarda la imagen del comprobante en tu Drive, lee el N° de operación y lo
 * busca en Mercado Pago. Devuelve los datos del pago para confirmar.
 */
function adminLeerComprobante(pin, img) {
  verificarPin_(pin);
  img = img || {};
  const datos = String(img.datos || '');
  if (!datos || datos.length > IMAGEN_MAXIMA) throw new Error('La imagen es muy grande o está vacía.');
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(String(img.tipo))) throw new Error('Subí una imagen (JPG o PNG).');
  const blob = Utilities.newBlob(Utilities.base64Decode(datos), img.tipo,
    'comprobante-' + Utilities.formatDate(new Date(), ZONA, 'yyyyMMdd-HHmmss') + (img.tipo === 'image/png' ? '.png' : '.jpg'));
  const archivoId = subirDrive_(blob, { name: blob.getName(), parents: [carpetaComprobantes_()] });
  const miId = String(miUsuario_().id);
  const candidatos = numerosOperacion_(ocr_(blob)).slice(0, 4);
  let aviso = '';
  for (let i = 0; i < candidatos.length; i++) {
    try {
      const pago = buscarPago_(candidatos[i]);
      if (pago) return { op: candidatos[i], archivoId: archivoId, pago: resumenGasto_(pago, miId) };
    } catch (e) {
      if (/\b401\b/.test(e.message)) throw e; // la clave de Mercado Pago no sirve: hay que avisar
      aviso = e.message;
    }
  }
  return { op: null, archivoId: archivoId,
    mensaje: aviso || 'No pude leer el N° de operación en la imagen. Escribilo abajo.' };
}

function adminBuscarOperacion(pin, op) {
  verificarPin_(pin);
  const id = soloDigitos_(op);
  if (id.length < 6) throw new Error('Escribí el N° de operación del comprobante.');
  const pago = buscarPago_(id);
  if (!pago) throw new Error('No encontré esa operación en tu cuenta de Mercado Pago.');
  return { op: id, pago: resumenGasto_(pago, String(miUsuario_().id)) };
}

function adminGuardarGasto(pin, d) {
  verificarPin_(pin);
  d = d || {};
  return conLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const id = soloDigitos_(d.op);
    if (TIPOS_GASTO.indexOf(d.tipo) === -1) throw new Error('Elegí el tipo de gasto.');
    const concepto = textoLibre_(d.concepto, 80);
    if (!concepto) throw new Error('Escribí el concepto.');
    const hGastos = hoja_(ss, HOJA.GASTOS);
    if (operaciones_(hGastos, COL_GASTOS.OPERACION).has(id)) throw new Error('Esa operación ya está cargada en Gastos.');
    const pago = buscarPago_(id);
    if (!pago) throw new Error('No encontré esa operación en tu cuenta de Mercado Pago.');
    const r = resumenGasto_(pago, String(miUsuario_().id));
    const destinatario = textoLibre_(d.destinatario, 80) || r.destinatario;
    const archivo = /^[\w-]{10,}$/.test(String(d.archivoId || '')) ? 'https://drive.google.com/file/d/' + d.archivoId : '';
    const saleDe = d.tipo === 'Cancha' ? 'Cuotas del mes' : d.tipo === 'Equipamiento' ? 'Fondo equipamiento' : 'Caja';
    agregarFilas_(hGastos, [[soloDia_(fechaPago_(pago)), d.tipo, texto_(concepto), r.monto, saleDe, texto_(destinatario), id,
      NOTA_APP + (archivo ? '. Comprobante: ' + archivo : '')]], COL_GASTOS.TOTAL, [7], COLOR_MANUAL);
    const proc = registroProcesados_(ss);
    proc.marcar(id);
    proc.guardar();
    return respuestaAdmin_('Listo: gasto de ' + pesos_(r.monto) + ' (' + concepto + ') guardado.');
  });
}

function buscarPago_(id) {
  try {
    return mpGet_('/v1/payments/' + id, {});
  } catch (e) {
    if (/\b(404|400)\b/.test(e.message)) return null;
    throw e;
  }
}

/** Datos de un pago tuyo (un gasto). Un cobro no se acepta como gasto. */
function resumenGasto_(p, miId) {
  if (p.status !== 'approved') throw new Error('Esa operación no está aprobada en Mercado Pago.');
  if (String(get_(p, 'payer.id')) !== miId) throw new Error('Esa operación es un cobro, no un pago tuyo.');
  return {
    fecha: fechaLarga_(fechaPago_(p)),
    monto: Number(p.transaction_amount) || 0,
    destinatario: nombreDestinatario_(p),
  };
}

function nombreDestinatario_(p) {
  const banco = get_(p, 'point_of_interaction.transaction_data.bank_info.collector') || {};
  const persona = [get_(p, 'collector.first_name'), get_(p, 'collector.last_name')].filter(Boolean).join(' ');
  return sinCuentas_(banco.account_holder_name || persona || p.description || banco.long_name || '').slice(0, 80);
}

/**
 * Números que pueden ser el N° de operación: primero los que siguen a la palabra
 * "operación"; después, números sueltos de 10 a 13 cifras que no parecen un CUIT.
 */
function numerosOperacion_(texto) {
  const t = String(texto || '').replace(/[ \t ]+/g, ' ');
  const lista = [];
  const sumar = n => {
    const s = String(n).replace(/\D/g, '');
    if (s.length >= 9 && s.length <= 14 && lista.indexOf(s) === -1) lista.push(s);
  };
  const conEtiqueta = /operaci[oó]n[^\d\n]{0,30}(\d[\d .]{7,18}\d)/gi;
  let m;
  while ((m = conEtiqueta.exec(t))) sumar(m[1]);
  (t.match(/\b\d{10,13}\b/g) || []).forEach(n => {
    if (!/^(20|23|24|27|30|33|34)\d{9}$/.test(n)) sumar(n);
  });
  return lista;
}

// ------------------------------------------------------------- Google Drive

function driveFetch_(url, opciones) {
  const r = UrlFetchApp.fetch(url, Object.assign({
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  }, opciones || {}));
  const code = r.getResponseCode();
  if (code >= 300) throw new Error('Google Drive respondió ' + code + '. ¿Aceptaste el permiso de Drive?');
  return r;
}

/** Carpeta "Caja Hockey - Comprobantes" en tu Drive (se crea la primera vez). */
function carpetaComprobantes_() {
  const props = PropertiesService.getScriptProperties();
  const guardada = props.getProperty(CARPETA_PROP);
  if (guardada) {
    const r = UrlFetchApp.fetch(DRIVE + '/' + guardada + '?fields=id,trashed', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (r.getResponseCode() === 200 && !JSON.parse(r.getContentText()).trashed) return guardada;
  }
  const r = driveFetch_(DRIVE, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ name: 'Caja Hockey - Comprobantes', mimeType: 'application/vnd.google-apps.folder' }),
  });
  const id = JSON.parse(r.getContentText()).id;
  props.setProperty(CARPETA_PROP, id);
  return id;
}

/** Sube un archivo a Drive (multipart) y devuelve su ID. */
function subirDrive_(blob, meta, consulta) {
  const limite = 'cajahockey' + Utilities.getUuid().replace(/-/g, '');
  const cuerpo = Utilities.newBlob('--' + limite + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(meta) + '\r\n--' + limite + '\r\nContent-Type: ' + blob.getContentType() + '\r\n\r\n').getBytes()
    .concat(blob.getBytes())
    .concat(Utilities.newBlob('\r\n--' + limite + '--').getBytes());
  const r = driveFetch_('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart' + (consulta || ''), {
    method: 'post', contentType: 'multipart/related; boundary=' + limite, payload: cuerpo,
  });
  return JSON.parse(r.getContentText()).id;
}

/** Texto de una imagen: Drive la convierte a documento con OCR; el documento se borra. */
function ocr_(blob) {
  const id = subirDrive_(blob, { name: 'ocr-temporal-caja-hockey', mimeType: 'application/vnd.google-apps.document' },
    '&ocrLanguage=es');
  try {
    return driveFetch_(DRIVE + '/' + id + '/export?mimeType=text/plain').getContentText();
  } finally {
    try {
      driveFetch_(DRIVE + '/' + id, { method: 'delete' });
    } catch (e) {
      // queda un documento temporal en Drive; no afecta nada
    }
  }
}

// ------------------------------------------------------------- utilidades

function miembroPorApodo_(miembros, apodo) {
  const m = miembros.find(x => x.apodo === String(apodo == null ? '' : apodo).trim());
  if (!m) throw new Error('Elegí un integrante de la lista.');
  return m;
}

function montoValido_(v) {
  const monto = Math.round(Number(String(v == null ? '' : v).replace(/\./g, '').replace(',', '.')) * 100) / 100;
  if (!(monto > 0 && monto <= MONTO_MAXIMO_APP)) throw new Error('Revisá el monto.');
  return monto;
}

function textoLibre_(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** "2026-10-10" → fecha local. Sin fechas futuras salvo que se permita hasta 60 días (altas). */
function fechaApp_(s, futuraPermitida) {
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  const fecha = p ? new Date(Number(p[1]), Number(p[2]) - 1, Number(p[3])) : null;
  const tope = futuraPermitida ? new Date(soloDia_(new Date()).getTime() + 60 * 24 * 3600 * 1000) : soloDia_(new Date());
  if (!fecha || fecha.getMonth() !== Number(p[2]) - 1 || fecha.getFullYear() < 2020 || fecha > tope) {
    throw new Error('Revisá la fecha.');
  }
  return fecha;
}

/** "2026-12" → 1/12/2026. */
function mesApp_(s) {
  const p = /^(\d{4})-(\d{2})$/.exec(String(s || ''));
  if (!p || Number(p[2]) < 1 || Number(p[2]) > 12) throw new Error('Elegí el mes.');
  return new Date(Number(p[1]), Number(p[2]) - 1, 1);
}

function pesos_(n) {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
