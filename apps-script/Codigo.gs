/**
 * Caja Hockey: trae las transferencias de Mercado Pago a la planilla.
 *
 * - Pagos recibidos de integrantes identificados (por ID de Mercado Pago o CUIT)
 *   se cargan solos en la hoja Pagos como "Cuota".
 * - Pagos recibidos que no se pueden identificar (por ejemplo, transferencias
 *   desde un banco, que llegan sin datos del que paga) van a "Por revisar".
 * - Pagos enviados al club se cargan solos en Gastos como "Cancha".
 * - Ningún otro movimiento de la cuenta se copia a la planilla.
 *
 * Instalación: ver README.md de esta carpeta.
 */

const HOJA = {
  PAGOS: 'Pagos',
  GASTOS: 'Gastos',
  INTEGRANTES: 'Integrantes',
  CONFIG: 'Config',
  REVISAR: 'Por revisar',
};

// Celdas de la hoja Config que usa la automatización.
const CELDA = {
  IMPORTAR_DESDE: 'B33',
  ID_CLUB: 'B34',
  ULTIMA_SYNC: 'B35',
  RESULTADO: 'B36',
};

// Columnas (empezando en 1).
const COL_PAGOS = { INTEGRANTE: 2, MONTO: 3, OPERACION: 9, TOTAL: 10 };
const COL_INT = { APODO: 2, CUIT: 6, ID_MP: 10, TOTAL: 10 };
const COL_GASTOS = { TIPO: 2, OPERACION: 7, TOTAL: 8 };
const COL_REVISAR = { OPERACION: 8, TOTAL: 10 };

const TIPOS_TRANSFERENCIA = ['money_transfer', 'account_fund'];
const API = 'https://api.mercadopago.com';
const ZONA = 'America/Argentina/San_Juan';
const MARGEN_DIAS = 2; // vuelve a mirar 2 días antes de la última sincronización
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// ---------------------------------------------------------------- menú

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Caja Hockey')
    .addItem('Sincronizar ahora', 'sincronizar')
    .addItem('Probar conexión con Mercado Pago', 'probarConexion')
    .addSeparator()
    .addItem('Activar sincronización cada 30 minutos', 'activarSincronizacion')
    .addItem('Desactivar sincronización automática', 'desactivarSincronizacion')
    .addToUi();
}

function activarSincronizacion() {
  desactivarSincronizacion();
  ScriptApp.newTrigger('sincronizar').timeBased().everyMinutes(30).create();
  aviso_('Listo: la planilla se va a sincronizar con Mercado Pago cada 30 minutos.');
}

function desactivarSincronizacion() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sincronizar')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

// ---------------------------------------------------------- sincronizar

function sincronizar() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return; // ya hay otra sincronización corriendo
  const ss = SpreadsheetApp.getActive();
  const config = hoja_(ss, HOJA.CONFIG);
  const inicio = new Date();
  try {
    const miId = miUsuario_().id;
    const desde = fechaDesde_(config);
    // La búsqueda sin filtro trae los pagos de la cuenta; la segunda asegura los enviados.
    const todos = buscarPagos_({}, desde);
    const enviados = unirPorId_(todos, buscarPagos_({ 'payer.id': miId }, desde));
    const r = procesarRecibidos_(ss, todos, miId, desde);
    const g = procesarEnviados_(ss, enviados, miId, desde, config);
    let texto = `${r.cargados} pagos cargados, ${r.revisar} para revisar, ${g.cargados} pagos al club cargados`;
    if (g.aviso) texto += '. ' + g.aviso;
    config.getRange(CELDA.ULTIMA_SYNC).setValue(inicio);
    config.getRange(CELDA.RESULTADO).setValue(texto);
  } catch (e) {
    config.getRange(CELDA.RESULTADO).setValue('Error (' + fechaTexto_(inicio) + '): ' + e.message);
    throw e;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Desde cuándo buscar: 2 días antes de la última sincronización correcta,
 * pero nunca antes de "Importar pagos desde".
 */
function fechaDesde_(config) {
  const minimo = config.getRange(CELDA.IMPORTAR_DESDE).getValue();
  if (!(minimo instanceof Date)) {
    throw new Error('Completá "Importar pagos desde" en Config (' + CELDA.IMPORTAR_DESDE + ').');
  }
  const ultima = config.getRange(CELDA.ULTIMA_SYNC).getValue();
  if (ultima instanceof Date) {
    const conMargen = new Date(ultima.getTime() - MARGEN_DIAS * 24 * 3600 * 1000);
    return conMargen > minimo ? conMargen : minimo;
  }
  return minimo;
}

// ------------------------------------------------------------ recibidos

function procesarRecibidos_(ss, pagos, miId, desde) {
  const hPagos = hoja_(ss, HOJA.PAGOS);
  const hInt = hoja_(ss, HOJA.INTEGRANTES);
  const hRev = hojaRevisar_(ss);

  const enPagos = valoresColumna_(hPagos, COL_PAGOS.OPERACION);
  const enRevisar = valoresColumna_(hRev, COL_REVISAR.OPERACION);
  const yaCargados = clavesPagos_(hPagos);
  const integ = leerIntegrantes_(hInt);

  const filasPagos = [];
  const filasRevisar = [];
  const idsAprendidos = []; // [fila de Integrantes, id de Mercado Pago]

  pagos
    .filter(p => p.status === 'approved')
    .filter(p => idCobrador_(p) === String(miId))
    .filter(p => TIPOS_TRANSFERENCIA.indexOf(p.operation_type) !== -1)
    .sort((a, b) => fechaPago_(a) - fechaPago_(b))
    .forEach(p => {
      const id = String(p.id);
      const fecha = fechaPago_(p);
      if (fecha < desde || enPagos.has(id) || enRevisar.has(id)) return;

      const monto = Number(p.transaction_amount) || 0;
      const payerId = String(get_(p, 'payer.id') || '');
      const esPropia = payerId === String(miId); // transferencias desde bancos llegan así
      const cuit = soloDigitos_(get_(p, 'payer.identification.number'));
      const nombre = nombrePagador_(p);
      const medio = (p.operation_type === 'account_fund' || p.payment_type_id === 'bank_transfer')
        ? 'Transferencia bancaria' : 'Transferencia Mercado Pago';

      let m = null;
      if (payerId && !esPropia) m = integ.porIdMp[payerId] || null;
      if (!m && cuit && !esPropia) m = integ.porCuit[cuit] || null;

      if (m) {
        const clave = claveDia_(m.apodo, monto, fecha);
        if (yaCargados.has(clave)) {
          filasRevisar.push(filaRevisar_(fecha, monto, medio, nombre, cuit, payerId, id, p,
            'Posible duplicado: ' + m.apodo + ' ya tiene un pago igual ese día en Pagos.'));
        } else {
          filasPagos.push([fecha, m.apodo, monto, 'Cuota', medio, nombre, cuit, '', id,
            'Cargado automáticamente desde Mercado Pago']);
          yaCargados.add(clave);
          if (payerId && !esPropia && !m.idMp) {
            idsAprendidos.push([m.fila, payerId]);
            m.idMp = payerId;
          }
        }
        enPagos.add(id);
      } else {
        filasRevisar.push(filaRevisar_(fecha, monto, medio, nombre, cuit, esPropia ? '' : payerId, id, p,
          esPropia ? 'Transferencia sin datos de quién la envió (suele ser desde un banco).'
                   : 'No coincide con ningún integrante.'));
        enRevisar.add(id);
      }
    });

  agregarFilas_(hPagos, filasPagos, COL_PAGOS.TOTAL, [7, 8, 9]);
  agregarFilas_(hRev, filasRevisar, COL_REVISAR.TOTAL, [6, 7, 8]);
  idsAprendidos.forEach(([fila, idMp]) => {
    hInt.getRange(fila, COL_INT.ID_MP).setNumberFormat('@').setValue(idMp);
  });
  return { cargados: filasPagos.length, revisar: filasRevisar.length };
}

function filaRevisar_(fecha, monto, medio, nombre, cuit, payerId, id, p, motivo) {
  return [fecha, monto, 'Ingreso', medio, nombre, cuit, payerId, id,
    String(p.description || ''), motivo];
}

// ------------------------------------------------------------- enviados

function procesarEnviados_(ss, pagos, miId, desde, config) {
  const hGastos = hoja_(ss, HOJA.GASTOS);
  let idClub = String(config.getRange(CELDA.ID_CLUB).getValue() || '').trim();
  if (!idClub) {
    idClub = detectarIdClub_(hGastos);
    if (!idClub) {
      return { cargados: 0, aviso: 'No se pudo detectar la cuenta del club; los pagos de cancha se cargan a mano.' };
    }
    config.getRange(CELDA.ID_CLUB).setNumberFormat('@').setValue(idClub);
  }

  const enGastos = valoresColumna_(hGastos, COL_GASTOS.OPERACION);
  const filas = pagos
    .filter(p => p.status === 'approved')
    .filter(p => String(get_(p, 'payer.id')) === String(miId))
    .filter(p => idCobrador_(p) === idClub)
    .filter(p => fechaPago_(p) >= desde && !enGastos.has(String(p.id)))
    .sort((a, b) => fechaPago_(a) - fechaPago_(b))
    .map(p => {
      const fecha = fechaPago_(p);
      const mes = MESES[Number(Utilities.formatDate(fecha, ZONA, 'M')) - 1];
      return [fecha, 'Cancha', 'Cancha ' + mes, Number(p.transaction_amount) || 0, 'Cuotas del mes',
        'Club Social y Deportivo Aberastain', String(p.id), 'Cargado automáticamente desde Mercado Pago'];
    });
  agregarFilas_(hGastos, filas, COL_GASTOS.TOTAL, [7]);
  return { cargados: filas.length, aviso: '' };
}

/** Busca un pago de cancha ya cargado en Gastos y lee a qué cuenta se envió. */
function detectarIdClub_(hGastos) {
  const n = hGastos.getLastRow() - 1;
  if (n < 1) return '';
  const filas = hGastos.getRange(2, 1, n, COL_GASTOS.TOTAL).getDisplayValues();
  for (let i = filas.length - 1; i >= 0; i--) {
    const tipo = filas[i][COL_GASTOS.TIPO - 1];
    const op = soloDigitos_(filas[i][COL_GASTOS.OPERACION - 1]);
    if (tipo !== 'Cancha' || !op) continue;
    try {
      const pago = mpGet_('/v1/payments/' + op, {});
      if (pago && idCobrador_(pago)) return idCobrador_(pago);
    } catch (e) {
      // el número del comprobante no es un ID de pago de la API; probar con otro
    }
  }
  return '';
}

// --------------------------------------------------------- probar conexión

/** Muestra los últimos ingresos y si cada uno se reconoce o ya está en la planilla. */
function probarConexion() {
  const ss = SpreadsheetApp.getActive();
  const yo = miUsuario_();
  const desde = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const recibidos = buscarPagos_({}, desde)
    .filter(p => p.status === 'approved' && idCobrador_(p) === String(yo.id))
    .filter(p => TIPOS_TRANSFERENCIA.indexOf(p.operation_type) !== -1)
    .sort((a, b) => fechaPago_(b) - fechaPago_(a))
    .slice(0, 15);
  const integ = leerIntegrantes_(hoja_(ss, HOJA.INTEGRANTES));
  const enPagos = valoresColumna_(hoja_(ss, HOJA.PAGOS), COL_PAGOS.OPERACION);

  const lineas = recibidos.map(p => {
    const payerId = String(get_(p, 'payer.id') || '');
    const cuit = soloDigitos_(get_(p, 'payer.identification.number'));
    const m = (payerId !== String(yo.id) && (integ.porIdMp[payerId] || integ.porCuit[cuit])) || null;
    return [
      fechaTexto_(fechaPago_(p)),
      '$' + Number(p.transaction_amount).toLocaleString('es-AR'),
      m ? m.apodo : (payerId === String(yo.id) ? 'sin datos del que envía' : 'no reconocido'),
      'op. ' + p.id + (enPagos.has(String(p.id)) ? ' (ya está en Pagos)' : ''),
    ].join(' · ');
  });

  aviso_('Conectado como ' + (yo.first_name || yo.nickname || yo.id) + '.\n\n' +
    (lineas.length ? 'Transferencias recibidas en los últimos 7 días:\n' + lineas.join('\n')
                   : 'No hay transferencias recibidas en los últimos 7 días.'));
}

// ---------------------------------------------------------- Mercado Pago

function token_() {
  const t = PropertiesService.getScriptProperties().getProperty('MP_ACCESS_TOKEN');
  if (!t) throw new Error('Falta la clave MP_ACCESS_TOKEN en Configuración del proyecto > Propiedades de la secuencia de comandos.');
  return t.trim();
}

function mpGet_(ruta, params) {
  const qs = Object.keys(params)
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
    .join('&');
  const url = API + ruta + (qs ? '?' + qs : '');
  for (let intento = 1; intento <= 3; intento++) {
    const res = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + token_() },
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    if (code === 200) return JSON.parse(res.getContentText());
    if (code === 401) throw new Error('Mercado Pago rechazó la clave (401). Revisá MP_ACCESS_TOKEN.');
    if ((code === 429 || code >= 500) && intento < 3) {
      Utilities.sleep(2000 * intento);
      continue;
    }
    throw new Error('Mercado Pago respondió ' + code + ' en ' + ruta);
  }
}

function miUsuario_() {
  return mpGet_('/users/me', {});
}

function buscarPagos_(filtro, desde) {
  const salida = [];
  const formato = "yyyy-MM-dd'T'HH:mm:ss.SSSXXX";
  const begin = Utilities.formatDate(desde, ZONA, formato);
  const end = Utilities.formatDate(new Date(), ZONA, formato);
  let offset = 0;
  while (offset < 1000) {
    const params = Object.assign({
      sort: 'date_created', criteria: 'desc', range: 'date_created',
      begin_date: begin, end_date: end, limit: 50, offset: offset,
    }, filtro);
    const res = mpGet_('/v1/payments/search', params);
    const lote = res.results || [];
    lote.forEach(p => salida.push(p));
    offset += lote.length;
    const total = (res.paging && res.paging.total) || 0;
    if (!lote.length || offset >= total) break;
  }
  return salida;
}

// ------------------------------------------------------------- planilla

function hoja_(ss, nombre) {
  const h = ss.getSheetByName(nombre);
  if (!h) throw new Error('No encuentro la hoja "' + nombre + '".');
  return h;
}

function hojaRevisar_(ss) {
  let h = ss.getSheetByName(HOJA.REVISAR);
  if (h) return h;
  h = ss.insertSheet(HOJA.REVISAR);
  const enc = ['Fecha', 'Monto ($)', 'Tipo', 'Medio', 'Nombre de origen', 'CUIT/CUIL de origen',
    'ID de pagador en Mercado Pago', 'N° de operación', 'Descripción', 'Motivo'];
  h.getRange(1, 1, 1, enc.length).setValues([enc])
    .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#0F2340')
    .setHorizontalAlignment('center').setWrap(true);
  h.setFrozenRows(1);
  h.getRange('A:A').setNumberFormat('dd/mm/yyyy');
  h.getRange('B:B').setNumberFormat('"$"#,##0');
  h.getRange('F:H').setNumberFormat('@');
  h.getRange(1, 1, 1, enc.length).setNote(
    'Ingresos que la automatización no pudo asignar. Si es una cuota, cargala en Pagos con el integrante; si no, ignorala.');
  return h;
}

function leerIntegrantes_(h) {
  const porCuit = {};
  const porIdMp = {};
  const n = h.getLastRow() - 1;
  if (n < 1) return { porCuit, porIdMp };
  const filas = h.getRange(2, 1, n, COL_INT.TOTAL).getDisplayValues();
  filas.forEach((f, i) => {
    const apodo = String(f[COL_INT.APODO - 1]).trim();
    if (!apodo) return;
    const m = { apodo: apodo, fila: i + 2, idMp: String(f[COL_INT.ID_MP - 1]).trim() };
    const cuit = soloDigitos_(f[COL_INT.CUIT - 1]);
    if (cuit) porCuit[cuit] = m;
    if (m.idMp) porIdMp[m.idMp] = m;
  });
  return { porCuit, porIdMp };
}

/** Valores de una columna (desde la fila 2) como texto, sin espacios. */
function valoresColumna_(h, col) {
  const n = h.getLastRow() - 1;
  if (n < 1) return new Set();
  return new Set(h.getRange(2, col, n, 1).getDisplayValues()
    .map(f => String(f[0]).trim()).filter(Boolean));
}

/** Claves "integrante|monto|día" de los pagos ya cargados, para detectar duplicados. */
function clavesPagos_(h) {
  const n = h.getLastRow() - 1;
  const claves = new Set();
  if (n < 1) return claves;
  h.getRange(2, 1, n, COL_PAGOS.MONTO).getValues().forEach(f => {
    if (f[0] instanceof Date && f[1]) claves.add(claveDia_(String(f[1]).trim(), Number(f[2]), f[0]));
  });
  return claves;
}

function claveDia_(apodo, monto, fecha) {
  return apodo + '|' + Math.round(monto) + '|' + Utilities.formatDate(fecha, ZONA, 'yyyy-MM-dd');
}

/** Agrega filas al final; las columnas indicadas quedan como texto (CUIT, cuentas, operaciones). */
function agregarFilas_(h, filas, ancho, columnasTexto) {
  if (!filas.length) return;
  const inicio = h.getLastRow() + 1;
  columnasTexto.forEach(c => h.getRange(inicio, c, filas.length, 1).setNumberFormat('@'));
  h.getRange(inicio, 1, filas.length, ancho).setValues(filas);
  h.getRange(inicio, 1, filas.length, ancho).setFontColor('#0000FF').setFontFamily('Arial');
}

// -------------------------------------------------------------- utilidades

function idCobrador_(p) {
  return String(p.collector_id || get_(p, 'collector.id') || '');
}

/** Une dos listas de pagos sin repetir el mismo ID. */
function unirPorId_(a, b) {
  const vistos = new Set(a.map(p => String(p.id)));
  return a.concat(b.filter(p => !vistos.has(String(p.id))));
}

function fechaPago_(p) {
  return new Date(p.date_approved || p.date_created);
}

function nombrePagador_(p) {
  const nombre = [get_(p, 'payer.first_name'), get_(p, 'payer.last_name')]
    .filter(Boolean).join(' ').trim();
  return nombre
    || String(get_(p, 'point_of_interaction.transaction_data.bank_info.payer.long_name') || '')
    || String(get_(p, 'payer.email') || '');
}

function soloDigitos_(v) {
  return String(v == null ? '' : v).replace(/\D/g, '');
}

function get_(obj, ruta) {
  return ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function fechaTexto_(d) {
  return Utilities.formatDate(d, ZONA, 'dd/MM/yyyy HH:mm');
}

function aviso_(texto) {
  try {
    SpreadsheetApp.getUi().alert(texto);
  } catch (e) {
    console.log(texto); // corriendo desde un disparador, sin pantalla
  }
}
