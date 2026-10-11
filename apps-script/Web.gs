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
    gastos: d.gastos.filter(g => !g.anulado).sort((a, b) => b.fecha - a.fecha).slice(0, 30).map(g => ({
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

/**
 * Filas de "Por revisar": tipo "Ingreso" (transferencias sin asignar), "Devolución"
 * (Mercado Pago devolvió un pago ya cargado; op = "R" + N°) y "Egreso" (pago al club por otro monto).
 */
function porRevisar_(ss) {
  const h = ss.getSheetByName(HOJA.REVISAR);
  const n = h ? h.getLastRow() - 1 : 0;
  if (n < 1) return [];
  const v = h.getRange(2, 1, n, COL_REVISAR.TOTAL).getValues();
  const t = h.getRange(2, 1, n, COL_REVISAR.TOTAL).getDisplayValues();
  const lista = [];
  v.forEach((f, i) => {
    const op = normalizarOp_(f[COL_REVISAR.OPERACION - 1]);
    const tipo = String(f[2]).trim();
    if (['Ingreso', 'Devolución', 'Egreso'].indexOf(tipo) === -1 || !op) return;
    lista.push({ fila: i + 2, tipo: tipo, op: op, fecha: t[i][0], cuando: f[0] instanceof Date ? f[0] : null, monto: Number(f[1]) || 0,
      medio: String(f[3]), nombre: String(f[4]), cuit: soloDigitos_(f[5]), payerId: normalizarOp_(f[6]), motivo: String(f[8]) });
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
  guardarPin_(PropertiesService.getScriptProperties(), pin);
  ui.alert('PIN guardado. En la app, tocá "Administrar" al pie de la pantalla.');
}

function guardarPin_(props, pin) {
  conLockPin_(() => {
    const sal = Utilities.getUuid();
    props.setProperty(PIN_PROP, sal + ':' + hashPin_(sal, pin));
    props.deleteProperty(FALLOS_PROP);
    props.deleteProperty(TOKENS_PROP); // un PIN nuevo cierra la sesión de los celulares recordados
  });
}

/** El PIN y la lista de celulares se leen y escriben de a uno por vez. */
function conLockPin_(fn) {
  const lock = LockService.getUserLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** Sal del PIN vigente: cambia cada vez que se define un PIN nuevo. */
function salPin_(props) {
  const guardado = props.getProperty(PIN_PROP) || '';
  return guardado.slice(0, guardado.indexOf(':'));
}

/**
 * Código para un celular que eligió "Recordar". Se guarda solo su hash, atado al PIN con
 * el que se entró: si el PIN cambió mientras tanto, no se entrega.
 */
function nuevoCelular_(props, sal) {
  return conLockPin_(() => {
    if (!sal || salPin_(props) !== sal) throw new Error('El PIN cambió. Entrá de nuevo con el PIN nuevo.');
    const token = 't:' + (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase();
    const lista = celulares_(props).concat([{ h: hashPin_('celular', token), desde: fechaTexto_(new Date()), sal: sal }]);
    props.setProperty(TOKENS_PROP, JSON.stringify(lista.slice(-MAX_CELULARES)));
    return token;
  });
}

function hashPin_(sal, pin) {
  return Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sal + '|' + pin, Utilities.Charset.UTF_8));
}

/**
 * La credencial es el PIN o, en un celular que eligió "Recordar", un código largo
 * ("t:…") que se entrega al entrar. Los intentos fallidos de PIN bloquean el PIN
 * 15 minutos, pero no los celulares recordados: nadie puede dejar afuera al
 * administrador probando PIN equivocados. Devuelve la sal del PIN vigente.
 */
function verificarPin_(cred) {
  const props = PropertiesService.getScriptProperties();
  const guardado = props.getProperty(PIN_PROP);
  if (!guardado) {
    throw new Error('Todavía no hay PIN. Definilo en la planilla: menú Caja Hockey → Definir PIN del panel de administrador.');
  }
  const sal = guardado.slice(0, guardado.indexOf(':'));
  const c = String(cred == null ? '' : cred).trim();
  if (/^t:[0-9a-f]{64}$/.test(c)) {
    const h = hashPin_('celular', c);
    // Los códigos sin sal son anteriores a este control; los demás valen solo con el PIN con que se entregaron.
    if (celulares_(props).some(t => t.h === h && (!t.sal || t.sal === sal))) return sal;
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
  return sal;
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

/** Todo lo que muestra el panel. Nunca CUIT ni IDs de cuentas: esos van solo en el detalle de un integrante, para editarlos. */
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
  const cfg = hoja_(ss, HOJA.CONFIG);
  const vinculado = vinculadoMp_(ss);
  const integ = leerIntegrantes_(hoja_(ss, HOJA.INTEGRANTES));
  const filas = porRevisar_(ss);
  const revisar = filas.filter(x => x.tipo === 'Ingreso').map(x => ({
    op: x.op, fecha: x.fecha, monto: x.monto, medio: x.medio, nombre: x.nombre, motivo: x.motivo,
    banco: !x.cuit && !x.payerId,
    duplicados: duplicadosDe_(d.pagos, x, integ, vinculado).slice(0, 3).map(dup => ({
      apodo: dup.apodo, fecha: fechaCorta_(dup.fecha), monto: dup.monto,
      filas: dup.filas.map(p => ({ fila: p.fila, apodo: p.apodo, monto: p.monto })),
    })),
  }));
  const devoluciones = filas.filter(x => x.tipo === 'Devolución').map(x => ({
    op: x.op, fecha: x.fecha, monto: Math.abs(x.monto),
    pagos: d.pagos.filter(p => p.op === x.op.replace(/^R/, '')).map(p => ({ apodo: p.apodo, monto: p.monto, imputacion: p.imputacion })),
  }));
  const egresos = filas.filter(x => x.tipo === 'Egreso').map(x => ({ op: x.op, fecha: x.fecha, monto: x.monto, nombre: x.nombre, motivo: x.motivo }));

  return {
    hoy: Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd'),
    mes: nombreMes_(est.mesActual),
    cuotaMes: est.cuotaMes,
    canchaMes: est.cancha.costo,
    url: url,
    porRevisar: revisar.reverse().slice(0, 50),
    devoluciones: devoluciones,
    egresos: egresos,
    porClasificar: d.pagos.filter(p => p.imputacion === IMP.CLASIFICAR).reverse().map(p => ({
      fila: p.fila, apodo: p.apodo, fecha: fechaLarga_(p.fecha), monto: p.monto, medio: p.medio,
    })),
    integrantes: est.integrantes.map(x => {
      const m = porMiembro[x.apodo] || { cuits: [], ids: [] };
      return {
        apodo: x.apodo, deuda: x.deuda, adelantado: x.adelantado, cuotasDebe: x.cuotasDebe, auto: x.auto,
        baja: x.baja ? nombreMes_(x.baja) : '', noJuega: !!x.baja && x.baja < d.inicio, alta: fechaLarga_(x.alta), hasta: x.hasta ? nombreMes_(x.hasta) : '',
        cuentas: m.cuits.length + m.ids.length,
      };
    }),
    valores: tablaValores_(d.valores),
    filasValores: filasValores_(ss).map(v => ({ fila: v.fila, clave: claveMes_(v.desde), texto: nombreMes_(v.desde),
      cuota: v.cuota, cancha: v.cancha })),
    mesActual: claveMes_(est.mesActual),
    mesesBaja: [{ clave: claveMes_(sumarMeses_(d.inicio, -1)), texto: 'No juega esta temporada' }].concat(mesesSel(-3, 12)),
    mesesValor: mesesSel(0, 12),
    mesesTemporada: mesesSel(-120, 12),
    pagos: d.pagos.slice().sort((a, b) => b.fecha - a.fecha || b.fila - a.fila).slice(0, 300).map(p => pagoAdmin_(p, vinculado)),
    gastos: d.gastos.slice().sort((a, b) => b.fecha - a.fecha || b.fila - a.fila).slice(0, 100).map(g => gastoAdmin_(g, vinculado)),
    config: {
      saldoInicial: d.saldoInicial,
      alias: cfg.getRange(CELDA.ALIAS).getDisplayValue(),
      vence: Number(cfg.getRange(CELDA.VENCIMIENTO).getValue()) || 10,
    },
  };
}

function isoDia_(d) {
  return Utilities.formatDate(d, ZONA, 'yyyy-MM-dd');
}

function pagoAdmin_(p, vinculado) {
  return { fila: p.fila, fecha: fechaLarga_(p.fecha), iso: isoDia_(p.fecha), apodo: p.apodo, monto: p.monto,
    imputacion: p.imputacion, medio: p.medio, bloqueado: pagoBloqueado_(p.op, p.notas, vinculado), notas: p.notas.slice(0, 500) };
}

function gastoAdmin_(g, vinculado) {
  return { fila: g.fila, fecha: fechaLarga_(g.fecha), iso: isoDia_(g.fecha), tipo: g.tipo, concepto: g.concepto,
    mes: claveMes_(g.mes || primerDia_(soloDia_(g.fecha))),
    monto: g.monto, destinatario: g.destinatario, anulado: g.anulado, bloqueado: gastoBloqueado_(g.op, g.notas, vinculado),
    notas: g.notas.slice(0, 500) };
}

/**
 * ¿El N° de operación es de un movimiento de Mercado Pago ya visto? La sincronización
 * anota en _procesados cada operación que encuentra, también las que ya estaban cargadas.
 */
function vinculadoMp_(ss) {
  const proc = registroProcesados_(ss);
  return op => !!op && proc.tiene(op);
}

/** Lo que vino de Mercado Pago no cambia de monto ni de fecha (decisiones 31 y 36). */
function pagoBloqueado_(op, notas, vinculado) {
  const n = String(notas || '');
  return vinculado(op) || n.indexOf(NOTA_AUTO) === 0 || n.indexOf(NOTA_ASIGNADA) === 0;
}

function gastoBloqueado_(op, notas, vinculado) {
  return vinculado(op) || String(notas || '').indexOf(NOTA_AUTO) === 0;
}

/**
 * Pagos cargados que pueden ser esta transferencia de "Por revisar". Una transferencia
 * desde un banco (sin datos de quien envía) puede ser de cualquiera; una con CUIT o cuenta
 * de un integrante, solo de ese integrante; una de alguien desconocido, de nadie.
 */
function duplicadosDe_(pagos, x, integ, vinculado) {
  if (!x.cuando) return [];
  if (!x.cuit && !x.payerId) return posibleDuplicado_(pagos, x.monto, x.cuando, { vinculado: vinculado });
  const m = (x.payerId && integ.porIdMp[x.payerId]) || (x.cuit && integ.porCuit[x.cuit]);
  return m ? posibleDuplicado_(pagos, x.monto, x.cuando, { apodo: m.apodo, vinculado: vinculado }) : [];
}

function respuestaAdmin_(mensaje, extra) {
  SpreadsheetApp.flush();
  recalcular_();
  return Object.assign({ mensaje: mensaje, admin: adminDatos_(), datos: datosApp_() }, extra || {});
}

/** Entra al panel. Con "recordar", devuelve un código para este celular en lugar de guardar el PIN. */
function adminEntrar(cred, recordar) {
  const sal = verificarPin_(cred);
  const props = PropertiesService.getScriptProperties();
  if (!/^t:/.test(String(cred))) {
    props.deleteProperty(FALLOS_PROP);
    if (recordar) {
      const token = nuevoCelular_(props, sal);
      return Object.assign(adminDatos_(), { token: token });
    }
  }
  return adminDatos_();
}

/** "Salir del panel" en un celular recordado: ese código deja de servir. */
function adminSalir(cred) {
  const c = String(cred == null ? '' : cred).trim();
  if (!/^t:[0-9a-f]{64}$/.test(c)) return true;
  const props = PropertiesService.getScriptProperties();
  const h = hashPin_('celular', c);
  conLockPin_(() => props.setProperty(TOKENS_PROP, JSON.stringify(celulares_(props).filter(t => t.h !== h))));
  return true;
}

/** Saldo inicial, alias y día de vencimiento de la cancha (decisión 38). */
function adminConfig(pin, d) {
  verificarPin_(pin);
  d = d || {};
  return conLock_(() => {
    const cfg = hoja_(SpreadsheetApp.getActive(), HOJA.CONFIG);
    const saldo = numeroApp_(d.saldoInicial);
    if (!(saldo >= 0 && saldo <= 100000000)) throw new Error('Revisá el saldo inicial.');
    const alias = textoLibre_(d.alias, 40);
    if (alias && !/^[A-Za-z0-9.\-]{3,40}$/.test(alias)) throw new Error('El alias lleva letras, números, puntos o guiones.');
    const dia = Number(d.vence);
    if (!(Number.isInteger(dia) && dia >= 1 && dia <= 28)) throw new Error('El día de vencimiento va del 1 al 28.');
    cfg.getRange(CELDA.SALDO_INICIAL).setValue(saldo);
    cfg.getRange(CELDA.ALIAS).setNumberFormat('@').setValue(alias);
    cfg.getRange(CELDA.VENCIMIENTO).setNumberFormat('0').setValue(dia);
    return respuestaAdmin_('Listo: configuración guardada.');
  });
}

/**
 * Cambia el PIN. Pide el PIN actual aunque se haya entrado con un celular recordado.
 * Los demás celulares recordados tienen que volver a entrar.
 */
function adminCambiarPin(cred, actual, nuevo, recordar) {
  verificarPin_(cred);
  const c = String(cred == null ? '' : cred).trim();
  const a = String(actual == null ? '' : actual).trim();
  if (!/^\d{6,12}$/.test(a)) throw new Error('Escribí tu PIN actual.');
  // Otro texto que "PIN incorrecto": la app no tiene que cerrar el panel por esto.
  if (!/^t:/.test(c)) {
    // Se entró con el PIN y ya se verificó: un error de tipeo no cuenta como intento fallido.
    if (a !== c) throw new Error('El PIN actual no es correcto.');
  } else {
    try {
      verificarPin_(a); // con un celular recordado, el PIN actual es la protección si alguien tiene el código
    } catch (e) {
      throw new Error(/PIN incorrecto/.test(e.message) ? 'El PIN actual no es correcto.' : e.message);
    }
  }
  const n = String(nuevo == null ? '' : nuevo).trim();
  if (!/^\d{6,12}$/.test(n)) throw new Error('El PIN nuevo tiene que tener de 6 a 12 números.');
  const props = PropertiesService.getScriptProperties();
  guardarPin_(props, n);
  return {
    mensaje: 'Listo: PIN cambiado. Los otros celulares recordados tienen que volver a entrar.',
    token: recordar ? nuevoCelular_(props, salPin_(props)) : '',
  };
}

/** Detalle de un integrante: meses con lo que falta y sus pagos, para reclasificar. */
function adminIntegrante(pin, apodo) {
  verificarPin_(pin);
  const ss = SpreadsheetApp.getActive();
  const d = leerDatos_(ss);
  const est = calcularEstado_(d);
  const x = est.integrantes.find(i => i.apodo === String(apodo == null ? '' : apodo).trim());
  if (!x) throw new Error('No encuentro ese integrante.');
  const m = d.miembros.find(i => i.apodo === x.apodo);
  return {
    apodo: x.apodo, deuda: x.deuda, adelantado: x.adelantado, pagado: x.pagado, auto: x.auto,
    baja: x.baja ? nombreMes_(x.baja) : '',
    meses: x.estados.map((s, i) => ({ mes: nombreMes_(est.meses[i]), e: s.e, medio: s.medio, falta: s.falta }))
      .filter((s, i) => est.meses[i] <= est.mesActual && s.e !== 'nojuega'),
    pagos: d.pagos.filter(p => p.apodo === x.apodo).sort((a, b) => b.fecha - a.fecha || b.fila - a.fila).map(p => pagoAdmin_(p, vinculadoMp_(ss))),
    datos: {
      nombre: m.nombre, apellido: m.apellido, cuits: m.cuits.join(', '), cvus: m.cvus,
      cuentasMp: m.ids.map(id => ({ id: id, fin: id.slice(-4), cuit: m.cuits.indexOf(cuentasMp_()[id]) !== -1 ? cuentasMp_()[id] : '' })),
      alta: m.alta ? isoDia_(m.alta) : '',
    },
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

/** Lee una fila de Pagos y verifica que siga siendo el pago que se ve en el panel. */
function filaPago_(h, fila, esperado) {
  const f = Number(fila);
  if (!(Number.isInteger(f) && f >= 2 && f <= h.getLastRow())) throw new Error('Ese pago ya no está. Actualizá la lista.');
  const v = h.getRange(f, 1, 1, COL_PAGOS.TOTAL).getValues()[0];
  esperado = esperado || {};
  if (String(v[1]).trim() !== String(esperado.apodo) || Number(v[2]) !== Number(esperado.monto)) {
    throw new Error('La planilla cambió. Actualizá la lista y probá de nuevo.');
  }
  return { f: f, v: v };
}

/** Suma una línea a las notas: qué se cambió y cuándo. */
function notaCambio_(notas, texto) {
  const previa = String(notas == null ? '' : notas).trim();
  const linea = texto + ' (' + Utilities.formatDate(new Date(), ZONA, 'dd/MM/yyyy') + ', desde la app)';
  return texto_((previa ? previa + ' | ' : '') + linea).slice(0, 2000);
}

/**
 * Corrige un pago (decisión 31). Lo que tiene N° de operación de Mercado Pago
 * no cambia de monto ni de fecha. Un pago anulado se restaura eligiendo su imputación.
 */
function adminEditarPago(pin, fila, esperado, d) {
  verificarPin_(pin);
  d = d || {};
  return conLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const h = hoja_(ss, HOJA.PAGOS);
    const { f, v } = filaPago_(h, fila, esperado);
    const antes = { apodo: String(v[1]).trim(), monto: Number(v[2]), imp: imputacion_(v[3]),
      fecha: v[0] instanceof Date ? soloDia_(v[0]) : null };
    const bloqueado = pagoBloqueado_(normalizarOp_(v[COL_PAGOS.OPERACION - 1]), v[COL_PAGOS.TOTAL - 1], vinculadoMp_(ss));
    const m = miembroPorApodo_(leerMiembros_(hoja_(ss, HOJA.INTEGRANTES)), d.apodo);
    const validas = [IMP.CUOTA, IMP.DEUDA_ANTERIOR, IMP.OTRO_CAJA, IMP.NO_CAJA]
      .concat(antes.imp === IMP.CLASIFICAR ? [IMP.CLASIFICAR] : []);
    if (validas.indexOf(d.imputacion) === -1) throw new Error('Elegí a qué corresponde el pago.');
    const monto = bloqueado ? antes.monto : montoValido_(d.monto);
    const fecha = bloqueado ? antes.fecha : fechaApp_(d.fecha);
    const nota = textoLibre_(d.nota, 200);

    const cambios = [];
    if (m.apodo !== antes.apodo) cambios.push('integrante ' + antes.apodo + ' → ' + m.apodo);
    if (!antes.fecha || fecha.getTime() !== antes.fecha.getTime()) {
      cambios.push('fecha ' + fechaLarga_(antes.fecha) + ' → ' + fechaLarga_(fecha));
    }
    if (monto !== antes.monto) cambios.push('monto ' + pesos_(antes.monto) + ' → ' + pesos_(monto));
    if (d.imputacion !== antes.imp) {
      cambios.push(antes.imp === IMP.ANULADO ? 'restaurado como ' + d.imputacion : antes.imp + ' → ' + d.imputacion);
    }
    if (!cambios.length && !nota) throw new Error('No cambiaste nada.');

    h.getRange(f, 1).setNumberFormat('dd/mm/yyyy');
    h.getRange(f, 1, 1, 4).setValues([[fecha, m.apodo, monto, d.imputacion]]);
    let notas = v[COL_PAGOS.TOTAL - 1];
    if (cambios.length) notas = notaCambio_(notas, 'Corregido: ' + cambios.join(', '));
    if (nota) notas = notaCambio_(notas, 'Nota: ' + nota);
    h.getRange(f, COL_PAGOS.TOTAL).setValue(notas);
    if (antes.imp === IMP.ANULADO) h.getRange(f, 1, 1, COL_PAGOS.TOTAL).setFontLine('none');
    return respuestaAdmin_(antes.imp === IMP.ANULADO ? 'Listo: pago restaurado como "' + d.imputacion + '".'
      : 'Listo: pago de ' + m.apodo + ' guardado.');
  });
}

/**
 * Reparte un pago entre integrantes (decisión 40): la fila queda con la primera parte y se
 * agregan filas para las demás, con la misma fecha, medio y N° de operación. La suma no cambia.
 * partes = [{apodo, monto, imputacion}]
 */
function adminRepartirPago(pin, fila, esperado, partes) {
  verificarPin_(pin);
  return conLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const h = hoja_(ss, HOJA.PAGOS);
    const { f, v } = filaPago_(h, fila, esperado);
    if (imputacion_(v[3]) === IMP.ANULADO) throw new Error('Ese pago está anulado.');
    if (!Array.isArray(partes) || partes.length < 2 || partes.length > 5) throw new Error('Repartilo en 2 a 5 partes.');
    const miembros = leerMiembros_(hoja_(ss, HOJA.INTEGRANTES));
    const validas = [IMP.CUOTA, IMP.DEUDA_ANTERIOR, IMP.OTRO_CAJA, IMP.NO_CAJA];
    const lista = partes.map(p => {
      p = p || {};
      if (validas.indexOf(p.imputacion) === -1) throw new Error('Elegí a qué corresponde cada parte.');
      return { apodo: miembroPorApodo_(miembros, p.apodo).apodo, monto: montoValido_(p.monto), imputacion: p.imputacion };
    });
    const total = Number(v[2]);
    if (Math.round(lista.reduce((s, p) => s + p.monto, 0) * 100) !== Math.round(total * 100)) {
      throw new Error('Las partes tienen que sumar ' + pesos_(total) + '.');
    }
    const op = normalizarOp_(v[COL_PAGOS.OPERACION - 1]);
    const detalle = lista.map(p => pesos_(p.monto) + ' ' + p.apodo).join(', ');
    const notaParte = texto_('Parte de un pago de ' + pesos_(total) + (op ? ' (op. ' + op + ')' : '') + ' repartido desde la app el ' +
      Utilities.formatDate(new Date(), ZONA, 'dd/MM/yyyy') + ': ' + detalle);
    h.getRange(f, 2, 1, 3).setValues([[lista[0].apodo, lista[0].monto, lista[0].imputacion]]);
    h.getRange(f, COL_PAGOS.TOTAL).setValue(notaCambio_(v[COL_PAGOS.TOTAL - 1], 'Repartido: ' + detalle));
    agregarFilas_(h, lista.slice(1).map(p => [v[0], p.apodo, p.monto, p.imputacion, v[4], texto_(v[5]), v[6], v[7], op, notaParte]),
      COL_PAGOS.TOTAL, [6, 7, 8, 9], COLOR_MANUAL);
    h.getRange(h.getLastRow() - lista.length + 2, 1, lista.length - 1, 1).setNumberFormat('dd/mm/yyyy');
    return respuestaAdmin_('Listo: pago repartido (' + detalle + ').');
  });
}

/** Anula un pago: deja de sumar y queda en la planilla, tachado (decisión 31). */
function adminAnularPago(pin, fila, esperado) {
  verificarPin_(pin);
  return conLock_(() => {
    const h = hoja_(SpreadsheetApp.getActive(), HOJA.PAGOS);
    const { f, v } = filaPago_(h, fila, esperado);
    const imp = imputacion_(v[3]);
    if (imp === IMP.ANULADO) throw new Error('Ese pago ya está anulado.');
    h.getRange(f, 4).setValue(IMP.ANULADO);
    h.getRange(f, COL_PAGOS.TOTAL).setValue(notaCambio_(v[COL_PAGOS.TOTAL - 1], 'Anulado (era ' + imp + ')'));
    h.getRange(f, 1, 1, COL_PAGOS.TOTAL).setFontLine('line-through');
    return respuestaAdmin_('Listo: pago de ' + String(v[1]).trim() + ' por ' + pesos_(v[2]) + ' anulado. Ya no suma.');
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
    const pendientes = porRevisar_(ss).filter(x => x.tipo === 'Ingreso');
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

/**
 * Saca un aviso de "Por revisar": una transferencia o un pago al club que no es de la caja,
 * o una devolución que ya está corregida. No se vuelve a importar.
 */
function adminDescartar(pin, op) {
  verificarPin_(pin);
  return conLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const x = porRevisar_(ss).find(y => y.op === normalizarOp_(op));
    if (!x) throw new Error('Ese aviso ya no está en Por revisar. Actualizá la lista.');
    hoja_(ss, HOJA.REVISAR).deleteRow(x.fila);
    return respuestaAdmin_(x.tipo === 'Devolución' ? 'Listo: aviso de devolución cerrado.'
      : 'Listo: ' + (x.tipo === 'Egreso' ? 'pago' : 'transferencia') + ' de ' + pesos_(Math.abs(x.monto)) + ' marcado como que no es de la caja.');
  });
}

/** Mercado Pago devolvió un pago ya cargado: lo anula (todas sus filas) y cierra el aviso. */
function adminAnularDevuelto(pin, marca) {
  verificarPin_(pin);
  return conLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const x = porRevisar_(ss).find(y => y.tipo === 'Devolución' && y.op === String(marca == null ? '' : marca).trim());
    if (!x) throw new Error('Ese aviso ya no está en Por revisar. Actualizá la lista.');
    const op = x.op.replace(/^R/, '');
    const h = hoja_(ss, HOJA.PAGOS);
    let anulados = 0;
    leerDatos_(ss).pagos.filter(p => p.op === op && p.imputacion !== IMP.ANULADO).forEach(p => {
      h.getRange(p.fila, 4).setValue(IMP.ANULADO);
      h.getRange(p.fila, COL_PAGOS.TOTAL).setValue(notaCambio_(p.notas, 'Anulado: Mercado Pago lo devolvió (era ' + p.imputacion + ')'));
      h.getRange(p.fila, 1, 1, COL_PAGOS.TOTAL).setFontLine('line-through');
      anulados++;
    });
    hoja_(ss, HOJA.REVISAR).deleteRow(x.fila);
    return respuestaAdmin_(anulados ? 'Listo: pago devuelto anulado. Ya no suma.' : 'Listo: ese pago ya no estaba en Pagos; cerré el aviso.');
  });
}

/**
 * La transferencia de "Por revisar" es un pago que ya estaba cargado (por ejemplo,
 * con el número del comprobante del banco). El pago queda con el N° de Mercado Pago
 * y no se suma dos veces (decisión 32).
 */
function adminEsElMismo(pin, op, esperados) {
  verificarPin_(pin);
  return conLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const x = porRevisar_(ss).find(y => y.tipo === 'Ingreso' && y.op === normalizarOp_(op));
    if (!x) throw new Error('Esa transferencia ya no está en Por revisar. Actualizá la lista.');
    // Solo se acepta una de las opciones que calcula el servidor (mismas reglas que el aviso).
    const opciones = duplicadosDe_(leerDatos_(ss).pagos, x, leerIntegrantes_(hoja_(ss, HOJA.INTEGRANTES)), vinculadoMp_(ss));
    const pedidas = (Array.isArray(esperados) ? esperados : []).map(e => Number(e && e.fila)).sort((a, b) => a - b).join(',');
    const dup = opciones.find(o => o.filas.map(p => p.fila).sort((a, b) => a - b).join(',') === pedidas);
    if (!dup) throw new Error('La planilla cambió. Actualizá la lista y probá de nuevo.');
    esperados.forEach(e => {
      const p = dup.filas.find(q => q.fila === Number(e.fila));
      if (p.apodo !== String(e.apodo) || p.monto !== Number(e.monto)) throw new Error('La planilla cambió. Actualizá la lista y probá de nuevo.');
    });
    const hPagos = hoja_(ss, HOJA.PAGOS);
    dup.filas.forEach(p => {
      hPagos.getRange(p.fila, COL_PAGOS.OPERACION).setNumberFormat('@').setValue(x.op);
      hPagos.getRange(p.fila, COL_PAGOS.TOTAL).setValue(notaCambio_(p.notas,
        'Es la transferencia de Mercado Pago op. ' + x.op + (p.op ? '; N° del comprobante: ' + p.op : '')));
    });
    // No se guarda ninguna cuenta: una transferencia de banco no la trae y la de un integrante ya es suya.
    hoja_(ss, HOJA.REVISAR).deleteRow(x.fila);
    return respuestaAdmin_('Listo: era el pago de ' + dup.apodo + ' que ya estaba cargado. No se suma dos veces.');
  });
}

/** "Buscar transferencias ahora" del panel (decisión 33). */
function adminSincronizar(pin) {
  verificarPin_(pin);
  const texto = sincronizar_();
  if (!texto) throw new Error('Ya hay una búsqueda en curso. Probá de nuevo en un minuto.');
  return respuestaAdmin_('Búsqueda lista: ' + texto + '.');
}

/** Suma el CUIT y el ID de Mercado Pago a la fila del integrante, si nadie más los tiene. */
function aprenderCuenta_(hInt, miembros, m, cuit, payerId) {
  let aprendio = false;
  const deOtro = (campo, valor) => miembros.some(x => x !== m && x[campo].indexOf(valor) !== -1);
  // La transferencia es de la cuenta de otro integrante (pagó por alguien más): no se aprende nada.
  if (cuit && deOtro('cuits', cuit)) return false;
  if (cuit && m.cuits.indexOf(cuit) === -1) {
    m.cuits.push(cuit);
    hInt.getRange(m.fila, COL_INT.CUIT).setNumberFormat('@').setValue(m.cuits.join(', '));
    aprendio = true;
  }
  if (payerId && m.ids.indexOf(payerId) === -1 && !deOtro('ids', payerId)) {
    m.ids.push(payerId);
    hInt.getRange(m.fila, COL_INT.ID_MP).setNumberFormat('@').setValue(m.ids.join(', '));
    aprendio = true;
  }
  if (payerId && m.ids.indexOf(payerId) !== -1) anotarCuentaMp_(payerId, cuit);
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
    const inicio = inicioBusqueda_(hoja_(ss, HOJA.CONFIG));
    if (mes < inicio) {
      // Agregado por error o al final no se sumó: no figura en ningún mes de la temporada.
      hInt.getRange(m.fila, COL_INT.ULTIMO).setNumberFormat('mmm yyyy').setValue(sumarMeses_(inicio, -1));
      return respuestaAdmin_('Listo: ' + m.apodo + ' no juega esta temporada. Ya no figura en la planilla.');
    }
    if (m.alta && mes < primerDia_(m.alta)) throw new Error('El último mes no puede ser anterior al alta.');
    hInt.getRange(m.fila, COL_INT.ULTIMO).setNumberFormat('mmm yyyy').setValue(mes);
    return respuestaAdmin_('Listo: ' + m.apodo + ' juega hasta ' + nombreMes_(mes) +
      '. Si debe algo, sigue figurando hasta que pague.');
  });
}

/**
 * Datos de un integrante (decisión 37). Si cambia el apodo, también se cambia en sus pagos.
 * Las cuentas de Mercado Pago reconocidas solo se pueden quitar: se aprenden al asignar.
 */
function adminEditarIntegrante(pin, apodoActual, d) {
  verificarPin_(pin);
  d = d || {};
  return conLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const hInt = hoja_(ss, HOJA.INTEGRANTES);
    const miembros = leerMiembros_(hInt);
    const m = miembroPorApodo_(miembros, apodoActual);
    const apodo = textoLibre_(d.apodo, 30);
    if (!/^[\p{L}\d][\p{L}\d .'-]*$/u.test(apodo)) throw new Error('Escribí un apodo con letras o números.');
    if (miembros.some(x => x !== m && x.apodo.toLowerCase() === apodo.toLowerCase())) {
      throw new Error('Ya hay otro integrante con ese apodo.');
    }
    const pares = cuentasMp_();
    const mantener = (Array.isArray(d.cuentasMp) ? d.cuentasMp : []).map(normalizarOp_);
    const ids = m.ids.filter(id => mantener.indexOf(id) !== -1);
    const quitadas = m.ids.filter(id => mantener.indexOf(id) === -1);
    const cuitsQuitados = quitadas.map(id => pares[id]).filter(Boolean);
    const cuits = [];
    String(d.cuits == null ? '' : d.cuits).split(/[,;\n]+/).map(soloDigitos_).filter(c => c && cuitsQuitados.indexOf(c) === -1).forEach(c => {
      if (c.length !== 11) throw new Error('Cada CUIT tiene que tener 11 números.');
      const otro = miembros.find(x => x !== m && x.cuits.indexOf(c) !== -1);
      if (otro) throw new Error('El CUIT ' + c + ' ya está cargado para ' + otro.apodo + '.');
      if (cuits.indexOf(c) === -1) cuits.push(c);
    });
    const cvus = String(d.cvus == null ? '' : d.cvus).split(/[,;\n]+/).map(t => textoLibre_(t, 60)).filter(Boolean);
    const alta = String(d.alta || '').trim() ? fechaApp_(d.alta, true) : '';
    const noJuega = m.ultimoMes && primerDia_(m.ultimoMes) < inicioBusqueda_(hoja_(ss, HOJA.CONFIG));
    if (alta && m.ultimoMes && !noJuega && primerDia_(alta) > primerDia_(m.ultimoMes)) {
      throw new Error('La fecha de alta no puede ser después del último mes que juega.');
    }

    hInt.getRange(m.fila, COL_INT.APODO, 1, 3).setValues([[apodo, texto_(textoLibre_(d.nombre, 40)),
      texto_(textoLibre_(d.apellido, 40))]]);
    hInt.getRange(m.fila, COL_INT.CUIT, 1, 2).setNumberFormat('@').setValues([[cuits.join(', '), texto_(cvus.join(', '))]]);
    hInt.getRange(m.fila, COL_INT.ID_MP).setNumberFormat('@').setValue(ids.join(', '));
    hInt.getRange(m.fila, COL_INT.ALTA).setNumberFormat('dd/mm/yyyy').setValue(alta);
    if (quitadas.length) {
      quitadas.forEach(id => { delete pares[id]; });
      PropertiesService.getScriptProperties().setProperty(PROP_CUENTAS, JSON.stringify(pares));
    }

    let renombrados = 0;
    if (apodo !== m.apodo) {
      const hPagos = hoja_(ss, HOJA.PAGOS);
      const n = hPagos.getLastRow() - 1;
      if (n > 0) {
        const col = hPagos.getRange(2, COL_PAGOS.INTEGRANTE, n, 1).getValues();
        col.forEach(f => { if (String(f[0]).trim() === m.apodo) { f[0] = apodo; renombrados++; } });
        if (renombrados) hPagos.getRange(2, COL_PAGOS.INTEGRANTE, n, 1).setValues(col);
      }
    }
    return respuestaAdmin_('Listo: datos de ' + apodo + ' guardados.' +
      (cuitsQuitados.length ? ' Saqué ' + (quitadas.length === 1 ? 'la cuenta y su CUIT' : 'las cuentas y sus CUIT') + ': sus transferencias van a ir a "Para revisar".' : '') +
      (renombrados ? ' El apodo nuevo quedó en ' + (renombrados === 1 ? 'su pago.' : 'sus ' + renombrados + ' pagos.') : ''),
      { apodo: apodo });
  });
}

/**
 * Qué cambiaría, sin guardarlo (decisión 35): quién tiene que pagar más o menos y
 * cuántas cuotas cubren la cancha. d.modo: "nuevo" (tipo, monto, desde),
 * "editar" (fila, esperado, desde, cuota, cancha) o "borrar" (fila, esperado).
 */
function adminSimularValor(pin, d) {
  verificarPin_(pin);
  const ss = SpreadsheetApp.getActive();
  const datos = leerDatos_(ss);
  const r = valoresSimulados_(ss, datos, d);
  const cuota = valorEn_(r.valores, 'cuota', r.mes);
  return {
    afectados: impactoValores_(datos, r.valores),
    necesarios: cuota > 0 ? Math.ceil(valorEn_(r.valores, 'cancha', r.mes) / cuota) : 0,
    desde: nombreMes_(r.mes),
  };
}

function valoresSimulados_(ss, datos, d) {
  d = d || {};
  if (d.modo === 'editar' || d.modo === 'borrar') {
    const r = valoresConCambio_(filasValores_(ss), d, datos.inicio);
    return { valores: r.valores, mes: r.mes };
  }
  const nuevo = valorNuevo_(d, datos.inicio);
  return { valores: conValor_(datos.valores, nuevo), mes: nuevo.desde };
}

/**
 * Valores con una fila corregida o borrada, sin guardarlos. Desde el inicio de la
 * temporada siempre tiene que haber una cuota y una cancha.
 */
function valoresConCambio_(filas, d, inicio) {
  const copia = filas.map(v => Object.assign({}, v));
  const i = copia.findIndex(v => v.fila === Number(d.fila));
  if (i === -1 || claveMes_(copia[i].desde) !== String(d.esperado)) {
    throw new Error('La hoja Valores cambió. Actualizá la lista y probá de nuevo.');
  }
  let mes = copia[i].desde;
  if (d.modo === 'borrar') {
    copia.splice(i, 1);
  } else {
    mes = mesApp_(d.desde);
    if (mes < inicio) throw new Error('El mes tiene que ser desde el inicio de la temporada.');
    if (copia.some((v, k) => k !== i && v.desde.getTime() === mes.getTime())) {
      throw new Error('Ya hay un valor para ' + nombreMes_(mes) + ': corregí ese.');
    }
    const monto = v => (String(v == null ? '' : v).trim() === '' ? null : montoValido_(v));
    const cuota = monto(d.cuota);
    const cancha = monto(d.cancha);
    if (cuota == null && cancha == null) throw new Error('Completá la cuota, la cancha o las dos. Para sacarlo, usá Borrar.');
    copia[i] = { fila: copia[i].fila, desde: mes, cuota: cuota, cancha: cancha };
  }
  copia.sort((a, b) => a.desde - b.desde);
  if (!(valorEn_(copia, 'cuota', inicio) > 0 && valorEn_(copia, 'cancha', inicio) > 0)) {
    throw new Error('Desde ' + nombreMes_(inicio) + ' (inicio de la temporada) tiene que haber una cuota y una cancha.');
  }
  return { valores: copia, mes: mes, fila: Number(d.fila) };
}

/**
 * Cuánto más (o menos) tiene que pagar cada uno con otros valores: la diferencia de
 * precio de los meses hasta el actual y de los que ya tiene pagados por adelantado.
 */
function impactoValores_(datos, valores) {
  const a = calcularEstado_(datos);
  const b = calcularEstado_(Object.assign({}, datos, { valores: valores }));
  const lista = [];
  a.integrantes.forEach((x, k) => {
    if (x.auto) return;
    let hasta = a.idxActual;
    x.estados.forEach((s, i) => { if (s.e === 'pagado' && i > hasta) hasta = i; });
    let dif = 0;
    for (let i = 0; i <= hasta && i < x.estados.length; i++) dif += b.integrantes[k].estados[i].c - x.estados[i].c;
    if (dif) lista.push({ apodo: x.apodo, diferencia: dif });
  });
  return lista;
}

/** Corrige una fila de Valores (mes, cuota o cancha). Una celda vacía sigue el valor anterior. */
function adminEditarValor(pin, d) {
  verificarPin_(pin);
  return conLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const datos = leerDatos_(ss);
    const r = valoresConCambio_(filasValores_(ss), Object.assign({}, d, { modo: 'editar' }), datos.inicio);
    const v = r.valores.find(x => x.fila === r.fila);
    const h = hojaValores_(ss);
    h.getRange(r.fila, 1).setNumberFormat('mmm yyyy');
    h.getRange(r.fila, 2, 1, 2).setNumberFormat('"$"#,##0');
    h.getRange(r.fila, 1, 1, 3).setValues([[v.desde, v.cuota == null ? '' : v.cuota, v.cancha == null ? '' : v.cancha]])
      .setFontColor(COLOR_MANUAL);
    return respuestaAdmin_('Listo: valor desde ' + nombreMes_(v.desde) + ' corregido.');
  });
}

function adminBorrarValor(pin, d) {
  verificarPin_(pin);
  return conLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const datos = leerDatos_(ss);
    const r = valoresConCambio_(filasValores_(ss), Object.assign({}, d, { modo: 'borrar' }), datos.inicio);
    hojaValores_(ss).deleteRow(r.fila);
    return respuestaAdmin_('Listo: valor desde ' + nombreMes_(r.mes) + ' borrado.');
  });
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
    const mes = d.tipo === 'Cancha' ? mesCancha_(d.mes, ss) : null;
    agregarFilas_(hGastos, [[soloDia_(fechaPago_(pago)), d.tipo, texto_(concepto), r.monto, saleDe_(d.tipo), texto_(destinatario), id,
      NOTA_APP + (archivo ? '. Comprobante: ' + archivo : '')]], COL_GASTOS.TOTAL, [7], COLOR_MANUAL);
    if (mes) hGastos.getRange(hGastos.getLastRow(), COL_GASTOS.MES).setNumberFormat('mmm yyyy').setValue(mes);
    const proc = registroProcesados_(ss);
    proc.marcar(id);
    proc.guardar();
    const aviso = porRevisar_(ss).find(x => x.tipo === 'Egreso' && x.op === id);
    if (aviso) hoja_(ss, HOJA.REVISAR).deleteRow(aviso.fila);
    return respuestaAdmin_('Listo: gasto de ' + pesos_(r.monto) + ' (' + concepto + ') guardado.');
  });
}

/** Mes de una cancha elegido en la app: desde el inicio de la temporada hasta 12 meses después de hoy. */
function mesCancha_(clave, ss) {
  const mes = mesApp_(clave);
  if (mes < inicioBusqueda_(hoja_(ss, HOJA.CONFIG)) || mes > sumarMeses_(primerDia_(hoyLocal_()), 12)) {
    throw new Error('Elegí un mes de la temporada para la cancha.');
  }
  return mes;
}

function saleDe_(tipo) {
  return tipo === 'Cancha' ? 'Cuotas del mes' : tipo === 'Equipamiento' ? 'Fondo equipamiento' : 'Caja';
}

/** Lee una fila de Gastos y verifica que siga siendo el gasto que se ve en el panel. */
function filaGasto_(h, fila, esperado) {
  const f = Number(fila);
  if (!(Number.isInteger(f) && f >= 2 && f <= h.getLastRow())) throw new Error('Ese gasto ya no está. Actualizá la lista.');
  const v = h.getRange(f, 1, 1, COL_GASTOS.TOTAL).getValues()[0];
  esperado = esperado || {};
  if (Number(v[3]) !== Number(esperado.monto) || String(v[2]).trim() !== String(esperado.concepto == null ? '' : esperado.concepto).trim()) {
    throw new Error('La planilla cambió. Actualizá la lista y probá de nuevo.');
  }
  return { f: f, v: v };
}

/** Corrige un gasto (decisión 36). Lo que vino de Mercado Pago no cambia de monto ni de fecha. */
function adminEditarGasto(pin, fila, esperado, d) {
  verificarPin_(pin);
  d = d || {};
  return conLock_(() => {
    const ss = SpreadsheetApp.getActive();
    const h = hoja_(ss, HOJA.GASTOS);
    const { f, v } = filaGasto_(h, fila, esperado);
    const antes = { tipo: String(v[1]).trim(), concepto: String(v[2]).trim(), monto: Number(v[3]),
      destinatario: String(v[5]).trim(), fecha: v[0] instanceof Date ? soloDia_(v[0]) : null };
    const mesGuardado = h.getMaxColumns() >= COL_GASTOS.MES ? h.getRange(f, COL_GASTOS.MES).getValue() : '';
    antes.mes = antes.tipo === 'Cancha' && antes.fecha ? (mesGuardado instanceof Date ? primerDia_(mesGuardado) : primerDia_(antes.fecha)) : null;
    const bloqueado = gastoBloqueado_(normalizarOp_(v[COL_GASTOS.OPERACION - 1]), v[COL_GASTOS.TOTAL - 1], vinculadoMp_(ss));
    if (TIPOS_GASTO.indexOf(d.tipo) === -1) throw new Error('Elegí el tipo de gasto.');
    const concepto = textoLibre_(d.concepto, 80);
    if (!concepto) throw new Error('Escribí el concepto.');
    const destinatario = textoLibre_(d.destinatario, 80);
    const monto = bloqueado ? antes.monto : montoValido_(d.monto);
    const fecha = bloqueado ? antes.fecha : fechaApp_(d.fecha);

    const cambios = [];
    if (antes.tipo === IMP.ANULADO) cambios.push('restaurado como ' + d.tipo);
    else if (d.tipo !== antes.tipo) cambios.push('tipo ' + antes.tipo + ' → ' + d.tipo);
    if (concepto !== antes.concepto) cambios.push('concepto');
    if (destinatario !== antes.destinatario) cambios.push('destinatario');
    if (!antes.fecha || fecha.getTime() !== antes.fecha.getTime()) {
      cambios.push('fecha ' + fechaLarga_(antes.fecha) + ' → ' + fechaLarga_(fecha));
    }
    if (monto !== antes.monto) cambios.push('monto ' + pesos_(antes.monto) + ' → ' + pesos_(monto));
    // El mes de la cancha se puede cambiar aunque el gasto venga de Mercado Pago (decisión 41).
    const mes = d.tipo === 'Cancha' ? mesCancha_(d.mes || claveMes_(primerDia_(fecha)), ss) : null;
    if (mes && (!antes.mes || mes.getTime() !== antes.mes.getTime())) cambios.push('cancha de ' + nombreMes_(mes));
    if (!cambios.length) throw new Error('No cambiaste nada.');

    h.getRange(f, 1).setNumberFormat('dd/mm/yyyy');
    h.getRange(f, 1, 1, 6).setValues([[fecha, d.tipo, texto_(concepto), monto, saleDe_(d.tipo), texto_(destinatario)]]);
    if (h.getMaxColumns() < COL_GASTOS.MES) h.insertColumnsAfter(h.getMaxColumns(), COL_GASTOS.MES - h.getMaxColumns());
    h.getRange(f, COL_GASTOS.MES).setNumberFormat('mmm yyyy').setValue(mes || '');
    h.getRange(f, COL_GASTOS.TOTAL).setValue(notaCambio_(v[COL_GASTOS.TOTAL - 1], 'Corregido: ' + cambios.join(', ')));
    if (antes.tipo === IMP.ANULADO) h.getRange(f, 1, 1, COL_GASTOS.TOTAL).setFontLine('none');
    return respuestaAdmin_(antes.tipo === IMP.ANULADO ? 'Listo: gasto restaurado.' : 'Listo: gasto guardado.');
  });
}

/** Anula un gasto: deja de restar y queda en la planilla, tachado. */
function adminAnularGasto(pin, fila, esperado) {
  verificarPin_(pin);
  return conLock_(() => {
    const h = hoja_(SpreadsheetApp.getActive(), HOJA.GASTOS);
    const { f, v } = filaGasto_(h, fila, esperado);
    const tipo = String(v[1]).trim();
    if (tipo === IMP.ANULADO) throw new Error('Ese gasto ya está anulado.');
    h.getRange(f, COL_GASTOS.TIPO).setValue(IMP.ANULADO);
    h.getRange(f, COL_GASTOS.TOTAL).setValue(notaCambio_(v[COL_GASTOS.TOTAL - 1], 'Anulado (era ' + tipo + ')'));
    h.getRange(f, 1, 1, COL_GASTOS.TOTAL).setFontLine('line-through');
    return respuestaAdmin_('Listo: gasto de ' + pesos_(v[3]) + ' anulado. Ya no resta.');
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
  // Las transferencias desde bancos que recibís también figuran con vos como pagador.
  if (String(get_(p, 'payer.id')) !== miId || idCobrador_(p) === miId) throw new Error('Esa operación es un cobro, no un pago tuyo.');
  return {
    fecha: fechaLarga_(fechaPago_(p)),
    mes: claveMes_(primerDia_(soloDia_(fechaPago_(p)))),
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
  const monto = numeroApp_(v);
  if (!(monto > 0 && monto <= MONTO_MAXIMO_APP)) throw new Error('Revisá el monto.');
  return monto;
}

/**
 * Número escrito en la app. "262.5" (lo que manda un campo numérico) usa punto decimal;
 * "15.000" o "1.234,50" (escrito a mano) usan punto de miles y coma decimal.
 */
function numeroApp_(v) {
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  const s = String(v == null ? '' : v).trim();
  if (!s) return NaN;
  const n = /^-?\d+(\.\d{1,2})?$/.test(s) ? Number(s) : Number(s.replace(/\./g, '').replace(',', '.'));
  return Math.round(n * 100) / 100;
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
