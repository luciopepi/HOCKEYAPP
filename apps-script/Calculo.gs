/**
 * Cálculo de cuotas, deudas y caja (DISENO.md, decisiones 10, 11, 12, 22, 25).
 *
 * - Cada mes vale la cuota vigente ese mes (hoja Valores). Los pagos "Cuota"
 *   de un integrante son saldo a favor en pesos y se descuentan mes a mes:
 *   si la cuota sube, lo adelantado puede quedar corto.
 * - Mes de alta: completo si se anotó hasta el día 15; medio mes si fue después.
 * - Después del último mes (baja) no se cobra más; la deuda que tenía sigue.
 * - El administrador (Cuota automática = Sí) siempre está al día.
 *
 * calcularEstado_() no lee ni escribe la planilla: recibe los datos y devuelve
 * el resultado. recalcular_() lo usa para escribir las hojas Cuotas y Resumen.
 */

const HOJA_VALORES = 'Valores';
const DIA_MEDIO_MES = 15;
const MESES_VISIBLES = 12;
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

// Imputaciones de Pagos. Las viejas ("Otro", "Revisar") se leen como las nuevas.
const IMP = {
  CUOTA: 'Cuota',
  DEUDA_ANTERIOR: 'Deuda anterior',
  OTRO_CAJA: 'Otro de la caja',
  NO_CAJA: 'No es de la caja',
  CLASIFICAR: 'Por clasificar',
};
const IMPUTACIONES = [IMP.CUOTA, IMP.DEUDA_ANTERIOR, IMP.OTRO_CAJA, IMP.NO_CAJA, IMP.CLASIFICAR];

function imputacion_(v) {
  const s = String(v == null ? '' : v).trim();
  if (s === 'Otro') return IMP.OTRO_CAJA;
  if (s === 'Revisar' || s === '') return IMP.CLASIFICAR;
  return s;
}

/** ¿El pago suma a la caja? Los "No es de la caja" y los "Por clasificar" no. */
function sumaACaja_(imp) {
  return imp === IMP.CUOTA || imp === IMP.DEUDA_ANTERIOR || imp === IMP.OTRO_CAJA;
}

// ------------------------------------------------------------- meses

function primerDia_(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function claveMes_(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function sumarMeses_(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function nombreMes_(d) {
  return MESES[d.getMonth()] + ' ' + d.getFullYear();
}

function mesCorto_(d) {
  return MESES_CORTOS[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2);
}

/** Hoy, en el horario de Argentina, como fecha local. */
function hoyLocal_() {
  return soloDia_(new Date());
}

// ------------------------------------------------------------- valores

/** Lee la hoja Valores: [{desde, cuota, cancha}] ordenado. Una celda vacía mantiene el valor anterior. */
function leerValores_(ss) {
  const h = hojaValores_(ss);
  const n = h.getLastRow() - 1;
  if (n < 1) return [];
  return h.getRange(2, 1, n, 3).getValues()
    .filter(f => f[0] instanceof Date)
    .map(f => ({
      desde: primerDia_(f[0]),
      cuota: Number(f[1]) > 0 ? Number(f[1]) : null,
      cancha: Number(f[2]) > 0 ? Number(f[2]) : null,
    }))
    .sort((a, b) => a.desde - b.desde);
}

/** Valor vigente en un mes ("cuota" o "cancha"). */
function valorEn_(valores, campo, mes) {
  let v = 0;
  valores.forEach(x => { if (x.desde <= mes && x[campo] != null) v = x[campo]; });
  return v;
}

/** Crea la hoja Valores la primera vez, con la cuota y la tabla de cancha que había en Config. */
function hojaValores_(ss) {
  let h = ss.getSheetByName(HOJA_VALORES);
  if (h) return h;
  h = ss.insertSheet(HOJA_VALORES);
  h.getRange(1, 1, 1, 3).setValues([['Vigente desde', 'Cuota ($)', 'Cancha ($)']])
    .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#0F2340').setFontFamily('Arial');
  h.setFrozenRows(1);
  h.getRange('A:A').setNumberFormat('mmm yyyy');
  h.getRange('B:C').setNumberFormat('"$"#,##0');
  h.getRange(1, 1).setNote('Cada fila cambia la cuota, la cancha o las dos desde ese mes. ' +
    'Una celda vacía mantiene el valor anterior. Se carga desde el panel de la app.');

  const config = ss.getSheetByName(HOJA.CONFIG);
  if (config) {
    const cuota = Number(config.getRange(CELDA.CUOTA).getValue()) || 0;
    const inicio = config.getRange(CELDA.INICIO).getValue();
    const filas = [];
    config.getRange(CELDA.COSTOS_CANCHA).getValues().forEach(([desde, monto]) => {
      if (desde instanceof Date && Number(monto) > 0) filas.push([primerDia_(desde), '', Number(monto)]);
    });
    filas.sort((a, b) => a[0] - b[0]);
    const desdeCuota = inicio instanceof Date ? primerDia_(inicio) : (filas[0] ? filas[0][0] : null);
    if (cuota > 0 && desdeCuota) {
      const misma = filas.find(f => f[0].getTime() === desdeCuota.getTime());
      if (misma) misma[1] = cuota;
      else filas.unshift([desdeCuota, cuota, '']);
    }
    if (filas.length) h.getRange(2, 1, filas.length, 3).setValues(filas);
    config.getRange(CELDA.CUOTA).setNote('Ya no se usa: la cuota está en la hoja Valores.');
    config.getRange(CELDA.COSTOS_CANCHA.split(':')[0]).setNote('Ya no se usa: los valores están en la hoja Valores.');
  }
  return h;
}

// ------------------------------------------------------------- estructura

/**
 * Agrega lo que la etapa 1 necesita en una planilla armada antes: la hoja
 * Valores, las columnas de alta y baja en Integrantes y las imputaciones nuevas.
 */
function asegurarEstructura_(ss) {
  hojaValores_(ss);
  const hInt = hoja_(ss, HOJA.INTEGRANTES);
  if (hInt.getMaxColumns() < COL_INT.TOTAL) hInt.insertColumnsAfter(hInt.getMaxColumns(), COL_INT.TOTAL - hInt.getMaxColumns());
  const enc = hInt.getRange(1, COL_INT.ALTA, 1, 2).getValues()[0];
  if (!String(enc[0]).trim() || !String(enc[1]).trim()) {
    hInt.getRange(1, COL_INT.ALTA, 1, 2).setValues([['Fecha de alta', 'Último mes (baja)']])
      .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#0F2340').setFontFamily('Arial');
    hInt.getRange(2, COL_INT.ALTA, hInt.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy');
    hInt.getRange(2, COL_INT.ULTIMO, hInt.getMaxRows() - 1, 1).setNumberFormat('mmm yyyy');
    hInt.getRange(1, COL_INT.ALTA).setNote('Vacía: juega desde el inicio. Si se anotó después del día 15, ese mes paga media cuota.');
    hInt.getRange(1, COL_INT.ULTIMO).setNote('Vacía: sigue jugando. Si tiene un mes, no se le cobra desde el mes siguiente.');
  }
  const hp = hoja_(ss, HOJA.PAGOS);
  const marca = hp.getRange(1, 4);
  if (marca.getNote() !== NOTA_IMPUTACIONES) {
    hp.getRange(2, 4, Math.max(hp.getMaxRows() - 1, 1), 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(IMPUTACIONES, true).setAllowInvalid(true).build());
    marca.setNote(NOTA_IMPUTACIONES);
  }
}

const NOTA_IMPUTACIONES = 'Cuota: suma a la cuota. Deuda anterior y Otro de la caja: suman a la caja, no a la cuota. ' +
  'No es de la caja (asados, etc.) y Por clasificar: no suman.';

// ------------------------------------------------------------- lectura

/** Junta todo lo que necesita el cálculo, desde la planilla. */
function leerDatos_(ss) {
  const config = hoja_(ss, HOJA.CONFIG);
  const inicio = config.getRange(CELDA.INICIO).getValue();
  const miembros = leerMiembros_(hoja_(ss, HOJA.INTEGRANTES));

  const hp = hoja_(ss, HOJA.PAGOS);
  const np = hp.getLastRow() - 1;
  const pagos = [];
  if (np > 0) {
    const v = hp.getRange(2, 1, np, COL_PAGOS.TOTAL).getValues();
    v.forEach((f, i) => {
      if (!(f[0] instanceof Date) || !(Number(f[2]) > 0)) return;
      pagos.push({ fila: i + 2, fecha: f[0], apodo: String(f[1]).trim(), monto: Number(f[2]),
        imputacion: imputacion_(f[3]), medio: String(f[4]), op: normalizarOp_(f[COL_PAGOS.OPERACION - 1]) });
    });
  }

  const hg = hoja_(ss, HOJA.GASTOS);
  const ng = hg.getLastRow() - 1;
  const gastos = [];
  if (ng > 0) {
    hg.getRange(2, 1, ng, COL_GASTOS.TOTAL).getValues().forEach(f => {
      if (!(f[0] instanceof Date) || !(Number(f[3]) > 0)) return;
      gastos.push({ fecha: f[0], tipo: String(f[1]), concepto: String(f[2]), monto: Number(f[3]),
        destinatario: String(f[5]) });
    });
  }

  return {
    inicio: inicio instanceof Date ? primerDia_(inicio) : primerDia_(hoyLocal_()),
    saldoInicial: Number(config.getRange(CELDA.SALDO_INICIAL).getValue()) || 0,
    valores: leerValores_(ss),
    miembros: miembros,
    pagos: pagos,
    gastos: gastos,
    hoy: hoyLocal_(),
  };
}

// ------------------------------------------------------------- cálculo

/**
 * Estado de cada integrante mes a mes y totales de la caja.
 * d = { inicio, saldoInicial, valores, miembros, pagos, gastos, hoy }
 */
function calcularEstado_(d) {
  const mesActual = primerDia_(d.hoy);
  const fin = sumarMeses_(d.inicio, MESES_VISIBLES - 1);
  const ultimoVisible = sumarMeses_(mesActual, 2) > fin ? sumarMeses_(mesActual, 2) : fin;
  const meses = [];
  for (let m = d.inicio; m <= ultimoVisible; m = sumarMeses_(m, 1)) meses.push(m);
  const idxActual = meses.findIndex(m => m.getTime() === mesActual.getTime());
  const cuotaDe = m => valorEn_(d.valores, 'cuota', m);

  const credito = {};
  d.pagos.forEach(p => {
    if (p.imputacion === IMP.CUOTA) credito[p.apodo] = (credito[p.apodo] || 0) + p.monto;
  });

  let cobradoAdmin = 0;
  const integrantes = d.miembros.map(m => {
    const alta = m.alta instanceof Date ? soloDia_(m.alta) : null;
    const mesAlta = alta ? primerDia_(alta) : d.inicio;
    const medioAlta = !!alta && alta.getDate() > DIA_MEDIO_MES && mesAlta >= d.inicio;
    const ultimo = m.ultimoMes instanceof Date ? primerDia_(m.ultimoMes) : null;

    const cargo = mes => {
      if (mes < mesAlta || (ultimo && mes > ultimo)) return 0;
      const c = cuotaDe(mes);
      return medioAlta && mes.getTime() === mesAlta.getTime() ? Math.round(c / 2) : c;
    };

    let acumulado = 0;
    let acumuladoActual = 0;
    let cargoActual = 0;
    let antesActual = 0;
    const cargos = meses.map((mes, i) => {
      const c = cargo(mes);
      if (i === idxActual) { antesActual = acumulado; cargoActual = c; }
      acumulado += c;
      if (mes <= mesActual) acumuladoActual = acumulado;
      return { mes, c, acumulado };
    });

    const pagado = m.auto ? acumuladoActual : (credito[m.apodo] || 0);
    if (m.auto) cobradoAdmin += acumuladoActual;

    let hasta = null;
    let cuotasDebe = 0;
    const estados = cargos.map(({ mes, c, acumulado: acum }) => {
      const medio = medioAlta && mes.getTime() === mesAlta.getTime();
      if (c === 0) return { e: 'nojuega', medio: false, falta: 0, c: 0 };
      if (pagado >= acum) { hasta = mes; return { e: 'pagado', medio, falta: 0, c }; }
      if (mes <= mesActual) {
        cuotasDebe++;
        return { e: 'debe', medio, falta: Math.min(c, acum - pagado), c };
      }
      return { e: 'sinvencer', medio, falta: 0, c };
    });

    return {
      apodo: m.apodo,
      auto: !!m.auto,
      alta: alta,
      baja: ultimo,
      activo: !ultimo || ultimo >= mesActual,
      pagado: pagado,
      deuda: Math.max(0, acumuladoActual - pagado),
      // Con baja, lo pagado de más que ya no se va a usar queda libre en la caja (decisión 11).
      adelantado: m.auto ? 0 : Math.max(0, Math.min(pagado, ultimo ? acumulado : Infinity) - acumuladoActual),
      cuotasDebe: cuotasDebe,
      hasta: hasta,
      estados: estados,
      cargoActual: cargoActual,
      aporteMes: Math.min(Math.max(pagado - antesActual, 0), cargoActual),
    };
  });

  // Caja
  let cobradoCuotas = 0;
  let cobradoOtros = 0;
  const porMes = {};
  d.pagos.forEach(p => {
    if (!sumaACaja_(p.imputacion)) return;
    if (p.imputacion === IMP.CUOTA) cobradoCuotas += p.monto; else cobradoOtros += p.monto;
    const k = claveMes_(p.fecha);
    porMes[k] = porMes[k] || { mes: primerDia_(p.fecha), cuotas: 0, otros: 0 };
    if (p.imputacion === IMP.CUOTA) porMes[k].cuotas += p.monto; else porMes[k].otros += p.monto;
  });
  // La cuota automática del administrador cuenta en cada mes vencido.
  integrantes.filter(x => x.auto).forEach(x => {
    x.estados.forEach((s, i) => {
      if (meses[i] > mesActual || s.e === 'nojuega') return;
      const k = claveMes_(meses[i]);
      porMes[k] = porMes[k] || { mes: meses[i], cuotas: 0, otros: 0 };
      porMes[k].cuotas += s.c;
    });
  });

  const gastado = d.gastos.reduce((s, g) => s + g.monto, 0);
  const cobrado = cobradoCuotas + cobradoAdmin + cobradoOtros;
  const saldo = d.saldoInicial + cobrado - gastado;
  const adelantos = integrantes.reduce((s, x) => s + x.adelantado, 0);

  const costo = valorEn_(d.valores, 'cancha', mesActual);
  const cuotaMes = cuotaDe(mesActual);
  const finMes = sumarMeses_(mesActual, 1);
  const pagoCancha = d.gastos.find(g => g.tipo === 'Cancha' && g.fecha >= mesActual && g.fecha < finMes);
  const recaudado = integrantes.reduce((s, x) => s + x.aporteMes, 0);
  const activos = integrantes.filter(x => x.cargoActual > 0);

  return {
    meses: meses,
    idxActual: idxActual,
    mesActual: mesActual,
    integrantes: integrantes,
    cuotaMes: cuotaMes,
    cancha: {
      costo: costo,
      recaudado: recaudado,
      faltan: Math.max(0, costo - recaudado),
      pagaron: activos.filter(x => x.estados[idxActual] && x.estados[idxActual].e === 'pagado').length,
      total: activos.length,
      necesarios: cuotaMes > 0 ? Math.ceil(costo / cuotaMes) : 0,
      pagada: !!pagoCancha,
      fechaPago: pagoCancha ? pagoCancha.fecha : null,
    },
    caja: {
      saldoInicial: d.saldoInicial,
      cobrado: cobrado,
      cobradoCuotas: cobradoCuotas + cobradoAdmin,
      cobradoAdmin: cobradoAdmin,
      cobradoOtros: cobradoOtros,
      gastado: gastado,
      saldo: saldo,
      adelantos: adelantos,
      fondo: saldo - adelantos - (pagoCancha ? 0 : costo),
      deuda: integrantes.reduce((s, x) => s + x.deuda, 0),
      conDeuda: integrantes.filter(x => x.deuda > 0).length,
    },
    porMes: Object.keys(porMes).sort().map(k => porMes[k]),
    porClasificar: d.pagos.filter(p => p.imputacion === IMP.CLASIFICAR).length,
  };
}

// ------------------------------------------------------------- escritura

/** Recalcula y escribe las hojas Cuotas y Resumen. Devuelve el estado calculado. */
function recalcular_() {
  const ss = SpreadsheetApp.getActive();
  asegurarEstructura_(ss);
  const datos = leerDatos_(ss);
  const est = calcularEstado_(datos);
  escribirCuotas_(ss, est);
  escribirResumen_(ss, est, datos);
  limpiarCacheApp_();
  return est;
}

const ESTADO_TEXTO = { pagado: 'Pagado', debe: 'Debe', sinvencer: '', nojuega: 'No juega' };

function escribirCuotas_(ss, est) {
  const h = ss.getSheetByName('Cuotas') || ss.insertSheet('Cuotas');
  const ancho = 5 + est.meses.length;
  if (h.getMaxColumns() < ancho) h.insertColumnsAfter(h.getMaxColumns(), ancho - h.getMaxColumns());
  const filas = [['Integrante', 'Pagado ($)', 'Debe ($)', 'Adelantado ($)', 'Pagado hasta']
    .concat(est.meses.map(mesCorto_))];
  est.integrantes.forEach(x => {
    filas.push([x.apodo + (x.baja ? ' (baja)' : ''), x.pagado, x.deuda, x.adelantado, x.hasta ? mesCorto_(x.hasta) : '-']
      .concat(x.estados.map(s => {
        const t = ESTADO_TEXTO[s.e];
        if (s.e === 'debe' && s.falta) return 'Debe $' + s.falta.toLocaleString('es-AR') + (s.medio ? ' (½)' : '');
        return t && s.medio ? t + ' (½)' : t;
      })));
  });
  const vacia = Array(ancho).fill('');
  const resumen = (etq, vals) => vacia.slice(0, 4).concat([etq]).concat(vals);
  const pagaron = est.meses.map((m, i) => est.integrantes.filter(x => x.estados[i].e === 'pagado').length);
  filas.push(vacia.slice());
  filas.push(resumen('Pagaron', pagaron));

  if (h.getMaxRows() < filas.length + 1) h.insertRowsAfter(h.getMaxRows(), filas.length + 1 - h.getMaxRows());
  const alto = Math.max(h.getLastRow(), filas.length + 1);
  h.getRange(1, 1, alto, h.getMaxColumns()).clearContent().clearNote();
  // Formatos antes de escribir: los meses ("oct 26") y "Pagado hasta" son texto, no fechas.
  h.getRange(1, 1, alto, h.getMaxColumns()).setNumberFormat('@');
  h.getRange(2, 2, alto - 1, 3).setNumberFormat('"$"#,##0;("$"#,##0);"-"');
  h.getRange(filas.length, 6, 1, est.meses.length).setNumberFormat('0');
  h.getRange(1, 1, filas.length, ancho).setValues(filas);
  h.getRange(1, 1, 1, ancho).setFontWeight('bold');
  h.setFrozenRows(1);

  const rango = h.getRange(2, 6, Math.max(est.integrantes.length, 1), est.meses.length);
  h.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('Pagado')
      .setBackground('#DCE6FB').setFontColor('#1A3E9E').setBold(true).setRanges([rango]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('Debe')
      .setBackground('#FDE3D3').setFontColor('#8F3209').setBold(true).setRanges([rango]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('No juega')
      .setFontColor('#9AA3B0').setRanges([rango]).build(),
  ]);
}

function escribirResumen_(ss, est, datos) {
  const h = ss.getSheetByName('Resumen') || ss.insertSheet('Resumen', 0);
  const c = est.cancha;
  const k = est.caja;
  const filas = [
    ['Caja del equipo de hockey', ''],
    ['Calculado por la app el ' + fechaTexto_(new Date()) + '. No editar: se reescribe sola.', ''],
    ['Mes actual', nombreMes_(est.mesActual)],
    ['', ''],
    ['Cancha del mes', ''],
    ['Integrantes con el mes pago', c.pagaron],
    ['Integrantes que juegan este mes', c.total],
    ['Cuotas necesarias para cubrir la cancha', c.necesarios],
    ['Recaudado para la cancha ($)', c.recaudado],
    ['Costo de la cancha ($)', c.costo],
    ['Faltan ($)', c.faltan],
    ['Cancha del mes pagada', c.pagada ? 'Sí' : 'No'],
    ['', ''],
    ['Caja', ''],
    ['Saldo inicial ($)', k.saldoInicial],
    ['Cobrado, incluida la cuota del administrador ($)', k.cobrado],
    ['Gastado ($)', k.gastado],
    ['Saldo en caja ($)', k.saldo],
    ['Cuotas pagadas por adelantado ($)', k.adelantos],
    ['Disponible para equipamiento ($)', k.fondo],
    ['', ''],
    ['Deudas', ''],
    ['Integrantes con deuda', k.conDeuda],
    ['Deuda total, incluido el mes actual ($)', k.deuda],
    ['Cobrado por otros conceptos de la caja ($)', k.cobradoOtros],
    ['Pagos por clasificar (no suman)', est.porClasificar],
  ];
  const antes = Math.max(h.getLastRow(), filas.length);
  const ancho = Math.min(Math.max(h.getMaxColumns(), 3), 6);
  h.getRange(1, 1, antes, ancho).clearContent().clearNote();
  // Cada fila con su formato: la hoja vieja tenía otros formatos en otras filas.
  filas.forEach((f, i) => {
    const celda = h.getRange(i + 1, 2);
    if (/\(\$\)$/.test(f[0])) celda.setNumberFormat('"$"#,##0;-"$"#,##0;"-"');
    else if (typeof f[1] === 'number') celda.setNumberFormat('0');
    else celda.setNumberFormat('@');
  });
  h.getRange(1, 1, filas.length, 2).setValues(filas);
}
