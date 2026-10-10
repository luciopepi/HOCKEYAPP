/**
 * Caja Hockey: trae las transferencias de Mercado Pago a la planilla.
 *
 * - Transferencias recibidas de integrantes reconocidos (por ID de Mercado Pago
 *   o CUIT) se cargan solas en Pagos. Si el monto es múltiplo de la cuota quedan
 *   como "Cuota"; si no, como "Revisar" para que las separes a mano.
 * - Transferencias recibidas que no se pueden reconocer van a "Por revisar",
 *   solo si el monto puede ser de una cuota (no se copian ingresos personales).
 * - Transferencias enviadas al club por el monto de la cancha se cargan en Gastos.
 * - Cada pago se procesa una sola vez (hoja oculta _procesados).
 *
 * Instalación: ver README.md de esta carpeta.
 */

const HOJA = {
  PAGOS: 'Pagos',
  GASTOS: 'Gastos',
  INTEGRANTES: 'Integrantes',
  CONFIG: 'Config',
  REVISAR: 'Por revisar',
  PROCESADOS: '_procesados',
};

// Celdas y rangos de la hoja Config.
const CELDA = {
  CUOTA: 'B4',
  COSTOS_CANCHA: 'A16:B25', // vigente desde | monto
  IMPORTAR_DESDE: 'B33',
  ID_CLUB: 'B34',
  ULTIMA_SYNC: 'B35',
  RESULTADO: 'B36',
};

// Columnas (empezando en 1).
const COL_PAGOS = { FECHA: 1, INTEGRANTE: 2, MONTO: 3, OPERACION: 9, TOTAL: 10 };
const COL_INT = { APODO: 2, CUIT: 6, ID_MP: 10, TOTAL: 10 };
const COL_GASTOS = { FECHA: 1, TIPO: 2, MONTO: 4, OPERACION: 7, TOTAL: 8 };
const COL_REVISAR = { OPERACION: 8, TOTAL: 9 };

const TIPOS_TRANSFERENCIA = ['money_transfer', 'account_fund'];
const ESTADOS_REVERTIDOS = ['refunded', 'charged_back', 'cancelled'];
const API = 'https://api.mercadopago.com';
const ZONA = 'America/Argentina/San_Juan';
const MARGEN_DIAS = 2;          // vuelve a mirar 2 días antes de la última sincronización
const MAX_RESULTADOS = 10000;   // tope de la API de búsqueda
const MAX_CUOTAS_REVISAR = 6;   // ingresos no reconocidos de más de 6 cuotas no se copian
const MONTO_MINIMO_REVISAR = 1000;
const TOLERANCIA_CANCHA = 1.10; // admite hasta 10% de recargo por mora
const NOTA_AUTO = 'Cargado automáticamente desde Mercado Pago';
const COLOR_MANUAL = '#0000FF';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// ---------------------------------------------------------------- menú

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Caja Hockey')
    .addItem('Sincronizar ahora', 'sincronizarAhora')
    .addItem('Probar conexión con Mercado Pago', 'probarConexion')
    .addSeparator()
    .addItem('Guardar clave de Mercado Pago', 'guardarClave')
    .addItem('Activar sincronización cada 30 minutos', 'activarSincronizacion')
    .addItem('Desactivar sincronización automática', 'desactivarSincronizacion')
    .addSeparator()
    .addItem('Definir PIN del panel de administrador', 'definirPin')
    .addToUi();
}

/**
 * Corta si la función no se llamó desde el menú de la planilla. Las funciones
 * públicas también se pueden invocar desde la app web: así nadie puede, por
 * ejemplo, desactivar la sincronización desde afuera.
 */
function soloDesdePlanilla_() {
  SpreadsheetApp.getUi(); // fuera de la planilla, getUi() da error y corta la función
}

/** Guarda el Access Token en tus propiedades de usuario: otros editores no lo ven. */
function guardarClave() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Clave de Mercado Pago',
    'Pegá el Access Token de producción (empieza con APP_USR-):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const t = r.getResponseText().trim();
  if (!/^APP_USR-/.test(t)) {
    ui.alert('Eso no parece un Access Token de producción (debe empezar con APP_USR-). No se guardó.');
    return;
  }
  PropertiesService.getUserProperties().setProperty('MP_ACCESS_TOKEN', t);
  ui.alert('Clave guardada. Ahora probá "Probar conexión con Mercado Pago".');
}

function activarSincronizacion() {
  soloDesdePlanilla_();
  desactivarSincronizacion();
  ScriptApp.newTrigger('sincronizar').timeBased().everyMinutes(30).create();
  aviso_('Listo: la planilla se va a sincronizar con Mercado Pago cada 30 minutos.');
}

function desactivarSincronizacion() {
  soloDesdePlanilla_();
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sincronizar')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

function sincronizarAhora() {
  soloDesdePlanilla_();
  const texto = sincronizar();
  aviso_(texto || 'Ya hay una sincronización en curso. Probá de nuevo en un minuto.');
}

// ---------------------------------------------------------- sincronizar

/** Devuelve el texto del resultado, o null si ya había otra sincronización corriendo. */
function sincronizar() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return null;
  const ss = SpreadsheetApp.getActive();
  const config = hoja_(ss, HOJA.CONFIG);
  const inicio = new Date();
  try {
    const desde = fechaDesde_(config);
    if (desde > inicio) {
      const espera = 'En espera: se importa desde ' + fechaTexto_(desde) + '.';
      config.getRange(CELDA.RESULTADO).setValue(espera);
      return espera;
    }
    const miId = String(miUsuario_().id);
    const proc = registroProcesados_(ss);
    const todos = buscarPagos_({}, desde, inicio);

    const r = procesarRecibidos_(ss, config, todos, miId, desde, proc);
    let texto = `${r.cargados} pagos cargados, ${r.revisar} para revisar`;
    if (r.reversiones) texto += `, ${r.reversiones} devoluciones avisadas`;

    // Los pagos enviados van aparte: si fallan no frenan la carga de cuotas.
    try {
      const enviados = unirPorId_(todos, buscarPagos_({ 'payer.id': miId }, desde, inicio));
      const g = procesarEnviados_(ss, config, enviados, miId, desde, proc);
      texto += `, ${g.cargados} pagos al club cargados`;
      if (g.aviso) texto += '. ' + g.aviso;
    } catch (e) {
      texto += '. No se pudieron revisar los pagos al club: ' + e.message;
    }

    proc.guardar();
    limpiarCacheApp_();
    config.getRange(CELDA.ULTIMA_SYNC).setValue(inicio);
    config.getRange(CELDA.RESULTADO).setValue(texto);
    return texto;
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

function procesarRecibidos_(ss, config, pagos, miId, desde, proc) {
  const hPagos = hoja_(ss, HOJA.PAGOS);
  const hInt = hoja_(ss, HOJA.INTEGRANTES);
  const hRev = hojaRevisar_(ss);
  const cuota = Number(config.getRange(CELDA.CUOTA).getValue()) || 0;

  const enPagos = operaciones_(hPagos, COL_PAGOS.OPERACION);
  const yaVistos = operaciones_(hRev, COL_REVISAR.OPERACION);
  const yaCargados = clavesPagos_(hPagos);
  const integ = leerIntegrantes_(hInt);

  const filasPagos = [];
  const filasRevisar = [];
  const idsAprendidos = []; // [fila de Integrantes, id de Mercado Pago]
  let reversiones = 0;
  let retenido = 0;
  const opsRetenidas = [];

  pagos
    .filter(p => idCobrador_(p) === miId)
    .sort((a, b) => fechaPago_(a) - fechaPago_(b))
    .forEach(p => {
      const id = String(p.id);
      const devuelto = Number(p.transaction_amount_refunded) || 0;

      // Pago ya cargado que después Mercado Pago devolvió o revirtió.
      if (enPagos.has(id) && (ESTADOS_REVERTIDOS.indexOf(p.status) !== -1 || devuelto > 0)) {
        const marca = 'R' + id;
        if (!proc.tiene(marca) && !yaVistos.has(marca)) {
          filasRevisar.push([fechaPago_(p), -(devuelto || Number(p.transaction_amount) || 0), 'Devolución',
            '', '', '', '', marca, 'Este pago ya está en Pagos y Mercado Pago lo devolvió: corregí esa fila.']);
          proc.marcar(marca);
          reversiones++;
        }
        return;
      }

      if (p.status !== 'approved' || TIPOS_TRANSFERENCIA.indexOf(p.operation_type) === -1) return;
      const fecha = fechaPago_(p);
      if (fecha < desde || enPagos.has(id) || yaVistos.has(id) || proc.tiene(id)) return;

      const bruto = Number(p.transaction_amount) || 0;
      const monto = bruto - devuelto;
      if (monto <= 0) return;

      const payerId = String(get_(p, 'payer.id') || '');
      const esPropia = payerId === miId; // transferencias desde bancos llegan así
      const esBanco = p.payment_type_id === 'bank_transfer' || p.payment_method_id === 'cvu';
      if (esPropia && !esBanco) return; // movimiento propio que no es transferencia: no se copia
      const cuit = esPropia ? '' : soloDigitos_(get_(p, 'payer.identification.number'));
      const nombre = texto_(nombrePagador_(p));
      const medio = (p.operation_type === 'account_fund' || esBanco)
        ? 'Transferencia bancaria' : 'Transferencia Mercado Pago';

      let m = null;
      if (!esPropia && payerId) m = integ.porIdMp[payerId] || null;
      if (!m && cuit) m = integ.porCuit[cuit] || null;

      if (m) {
        const clave = claveDia_(m.apodo, monto, fecha);
        if (yaCargados.has(clave)) {
          filasRevisar.push(filaRevisar_(fecha, monto, medio, nombre, cuit, payerId, id,
            'Posible duplicado: ' + m.apodo + ' ya tiene un pago igual ese día en Pagos.'));
        } else {
          const esCuota = cuota > 0 && monto % cuota === 0;
          filasPagos.push([soloDia_(fecha), m.apodo, monto, esCuota ? 'Cuota' : 'Revisar', medio, nombre,
            cuit, '', id, esCuota ? NOTA_AUTO
              : NOTA_AUTO + '. El monto no es múltiplo de la cuota: separalo en filas (Cuota, Deuda anterior u Otro) con el mismo N° de operación.']);
          yaCargados.add(clave);
          const neto = Number(get_(p, 'transaction_details.net_received_amount'));
          if (neto > 0 && neto < bruto) {
            retenido += bruto - neto;
            opsRetenidas.push(id);
          }
          if (!esPropia && payerId && !m.idMp) {
            idsAprendidos.push([m.fila, payerId]);
            m.idMp = payerId;
            integ.porIdMp[payerId] = m;
          }
        }
        proc.marcar(id);
      } else if (monto >= MONTO_MINIMO_REVISAR && (!cuota || monto <= MAX_CUOTAS_REVISAR * cuota)) {
        filasRevisar.push(filaRevisar_(fecha, monto, medio, nombre, cuit, esPropia ? '' : payerId, id,
          esPropia ? 'Transferencia desde un banco: Mercado Pago no informa quién la envió.'
                   : 'No coincide con ningún integrante.'));
        proc.marcar(id);
      }
      // Otros ingresos (montos que no pueden ser cuotas) no se copian a la planilla.
    });

  agregarFilas_(hPagos, filasPagos, COL_PAGOS.TOTAL, [6, 7, 8, 9]);
  agregarFilas_(hRev, filasRevisar, COL_REVISAR.TOTAL, [5, 6, 7, 8]);
  idsAprendidos.forEach(([fila, idMp]) => {
    hInt.getRange(fila, COL_INT.ID_MP).setNumberFormat('@').setValue(idMp);
  });
  if (retenido > 0) {
    agregarFilas_(hoja_(ss, HOJA.GASTOS), [[soloDia_(new Date()), 'Otro', 'Retenciones de Mercado Pago',
      Math.round(retenido * 100) / 100, 'Cuotas del mes', 'Mercado Pago (impuestos)', '',
      'Diferencia entre lo transferido y lo acreditado. Operaciones: ' + opsRetenidas.join(', ')]],
      COL_GASTOS.TOTAL, [7]);
  }
  return { cargados: filasPagos.length, revisar: filasRevisar.length - reversiones, reversiones };
}

function filaRevisar_(fecha, monto, medio, nombre, cuit, payerId, id, motivo) {
  return [fecha, monto, 'Ingreso', medio, nombre, cuit, payerId, id, motivo];
}

// ------------------------------------------------------------- enviados

function procesarEnviados_(ss, config, pagos, miId, desde, proc) {
  const hGastos = hoja_(ss, HOJA.GASTOS);
  let idClub = soloDigitos_(config.getRange(CELDA.ID_CLUB).getValue());
  let aviso = '';
  if (!idClub) {
    const club = detectarClub_(hGastos, miId);
    if (!club) {
      return { cargados: 0, aviso: 'No se pudo detectar la cuenta del club: los pagos de cancha se cargan a mano.' };
    }
    // La búsqueda tiene que devolver el pago con el que se detectó el club.
    const dia = 24 * 3600 * 1000;
    const prueba = buscarPagos_({ 'payer.id': miId },
      new Date(club.fecha.getTime() - dia), new Date(club.fecha.getTime() + dia), 'date_created');
    if (!prueba.some(p => String(p.id) === club.pagoId)) {
      return { cargados: 0, aviso: 'Mercado Pago no devuelve tus pagos enviados en la búsqueda: los pagos de cancha se cargan a mano.' };
    }
    idClub = club.id;
    config.getRange(CELDA.ID_CLUB).setNumberFormat('@').setValue(idClub);
  }
  if (idClub === miId) {
    return { cargados: 0, aviso: 'Config ' + CELDA.ID_CLUB + ' tiene tu propio ID de Mercado Pago: borralo para que se detecte de nuevo.' };
  }

  const enGastos = operaciones_(hGastos, COL_GASTOS.OPERACION);
  const hRev = hojaRevisar_(ss);
  const enRevisar = operaciones_(hRev, COL_REVISAR.OPERACION);
  const yaCargados = clavesGastos_(hGastos);
  const costos = config.getRange(CELDA.COSTOS_CANCHA).getValues();
  const filas = [];
  const filasRevisar = [];
  const dudosos = [];

  pagos
    .filter(p => p.status === 'approved' && p.operation_type === 'money_transfer')
    .filter(p => String(get_(p, 'payer.id')) === miId && idCobrador_(p) === idClub)
    .filter(p => {
      const id = String(p.id);
      return fechaPago_(p) >= desde && !enGastos.has(id) && !enRevisar.has(id) && !proc.tiene(id);
    })
    .sort((a, b) => fechaPago_(a) - fechaPago_(b))
    .forEach(p => {
      const id = String(p.id);
      const fecha = fechaPago_(p);
      const monto = Number(p.transaction_amount) || 0;
      const costo = costoCancha_(costos, fecha);
      if (!(costo > 0 && monto >= costo && monto <= costo * TOLERANCIA_CANCHA)) {
        filasRevisar.push([fecha, monto, 'Egreso', 'Transferencia Mercado Pago', 'Club Social y Deportivo Aberastain',
          '', '', id, 'Pago al club por un monto distinto del costo de la cancha: cargalo a mano en Gastos si corresponde.']);
      } else if (yaCargados.has(claveDia_('Cancha', monto, fecha))) {
        dudosos.push(id);
      } else {
        const mes = MESES[Number(Utilities.formatDate(fecha, ZONA, 'M')) - 1];
        filas.push([soloDia_(fecha), 'Cancha', 'Cancha ' + mes, monto, 'Cuotas del mes',
          'Club Social y Deportivo Aberastain', id,
          monto > costo ? NOTA_AUTO + '. Incluye recargo por mora.' : NOTA_AUTO]);
        yaCargados.add(claveDia_('Cancha', monto, fecha));
      }
      proc.marcar(id);
    });

  agregarFilas_(hGastos, filas, COL_GASTOS.TOTAL, [7]);
  agregarFilas_(hRev, filasRevisar, COL_REVISAR.TOTAL, [5, 6, 7, 8]);
  if (dudosos.length) {
    aviso = 'Pago de cancha posiblemente ya cargado a mano (op. ' + dudosos.join(', ') +
      '): completá su N° de operación en Gastos.';
  }
  return { cargados: filas.length, aviso };
}

/** Busca un pago de cancha ya cargado en Gastos y lee a qué cuenta se envió. */
function detectarClub_(hGastos, miId) {
  const n = hGastos.getLastRow() - 1;
  if (n < 1) return null;
  const filas = hGastos.getRange(2, 1, n, COL_GASTOS.TOTAL).getValues();
  for (let i = filas.length - 1; i >= 0; i--) {
    const op = normalizarOp_(filas[i][COL_GASTOS.OPERACION - 1]);
    if (String(filas[i][COL_GASTOS.TIPO - 1]).trim() !== 'Cancha' || !/^\d+$/.test(op)) continue;
    try {
      const pago = mpGet_('/v1/payments/' + op, {});
      const club = pago && idCobrador_(pago);
      if (pago.status === 'approved' && String(get_(pago, 'payer.id')) === miId && club && club !== miId) {
        return { id: club, pagoId: String(pago.id), fecha: fechaPago_(pago) };
      }
    } catch (e) {
      // el número del comprobante no es un ID de pago de la API; probar con otro
    }
  }
  return null;
}

function costoCancha_(costos, fecha) {
  let costo = 0;
  costos.forEach(([desde, monto]) => {
    if (desde instanceof Date && desde <= fecha && Number(monto) > 0) costo = Number(monto);
  });
  return costo;
}

// --------------------------------------------------------- probar conexión

/** Muestra los últimos ingresos y si cada uno se reconoce o ya está en la planilla. */
function probarConexion() {
  soloDesdePlanilla_();
  const ss = SpreadsheetApp.getActive();
  const yo = miUsuario_();
  const miId = String(yo.id);
  const ahora = new Date();
  const recibidos = buscarPagos_({}, new Date(ahora.getTime() - 7 * 24 * 3600 * 1000), ahora)
    .filter(p => p.status === 'approved' && idCobrador_(p) === miId)
    .filter(p => TIPOS_TRANSFERENCIA.indexOf(p.operation_type) !== -1)
    .sort((a, b) => fechaPago_(b) - fechaPago_(a))
    .slice(0, 15);
  const integ = leerIntegrantes_(hoja_(ss, HOJA.INTEGRANTES));
  const enPagos = operaciones_(hoja_(ss, HOJA.PAGOS), COL_PAGOS.OPERACION);

  const lineas = recibidos.map(p => {
    const payerId = String(get_(p, 'payer.id') || '');
    const propia = payerId === miId;
    const cuit = soloDigitos_(get_(p, 'payer.identification.number'));
    const m = propia ? null : (integ.porIdMp[payerId] || integ.porCuit[cuit] || null);
    return [
      fechaTexto_(fechaPago_(p)),
      '$' + Number(p.transaction_amount).toLocaleString('es-AR'),
      m ? m.apodo : (propia ? 'desde un banco (sin datos)' : 'no reconocido'),
      'op. ' + p.id + (enPagos.has(String(p.id)) ? ' (ya está en Pagos)' : ''),
    ].join(' · ');
  });

  aviso_('Conectado como ' + (yo.first_name || yo.nickname || miId) + '.\n\n' +
    (lineas.length ? 'Transferencias recibidas en los últimos 7 días:\n' + lineas.join('\n')
                   : 'No hay transferencias recibidas en los últimos 7 días.'));
}

// ---------------------------------------------------------- Mercado Pago

function token_() {
  const t = PropertiesService.getUserProperties().getProperty('MP_ACCESS_TOKEN')
    || PropertiesService.getScriptProperties().getProperty('MP_ACCESS_TOKEN');
  if (!t) throw new Error('Falta la clave de Mercado Pago: usá el menú Caja Hockey > Guardar clave de Mercado Pago.');
  return t.trim();
}

function mpGet_(ruta, params) {
  const qs = Object.keys(params)
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
    .join('&');
  const url = API + ruta + (qs ? '?' + qs : '');
  for (let intento = 1; intento <= 3; intento++) {
    let res;
    try {
      res = UrlFetchApp.fetch(url, {
        headers: { Authorization: 'Bearer ' + token_() },
        muteHttpExceptions: true,
      });
    } catch (e) {
      if (intento < 3) { Utilities.sleep(2000 * intento); continue; } // corte de red
      throw e;
    }
    const code = res.getResponseCode();
    if (code === 200) return JSON.parse(res.getContentText());
    if (code === 401) throw new Error('Mercado Pago rechazó la clave (401). Guardá una clave nueva desde el menú.');
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

/**
 * Pagos de la cuenta entre dos fechas. Por defecto busca por última
 * actualización, así entran pagos aprobados tarde y devoluciones.
 */
function buscarPagos_(filtro, desde, hasta, rango) {
  const formato = "yyyy-MM-dd'T'HH:mm:ss.SSSXXX";
  const salida = [];
  let offset = 0;
  let total = 0;
  while (true) {
    const params = Object.assign({
      sort: 'date_created', criteria: 'desc', range: rango || 'date_last_updated',
      begin_date: Utilities.formatDate(desde, ZONA, formato),
      end_date: Utilities.formatDate(hasta, ZONA, formato),
      limit: 50, offset: offset,
    }, filtro);
    const res = mpGet_('/v1/payments/search', params);
    const lote = res.results || [];
    lote.forEach(p => salida.push(p));
    offset += lote.length;
    total = (res.paging && res.paging.total) || 0;
    if (!lote.length || offset >= total) break;
    if (offset + 50 > MAX_RESULTADOS) {
      throw new Error('Hay ' + total + ' movimientos para revisar y solo se pueden leer ' + MAX_RESULTADOS +
        '. Mové "Importar pagos desde" más cerca de hoy.');
    }
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
  const enc = ['Fecha y hora', 'Monto ($)', 'Tipo', 'Medio', 'Nombre de origen', 'CUIT/CUIL de origen',
    'ID de pagador en Mercado Pago', 'N° de operación', 'Motivo'];
  h.getRange(1, 1, 1, enc.length).setValues([enc])
    .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#0F2340')
    .setHorizontalAlignment('center').setWrap(true).setFontFamily('Arial');
  h.setFrozenRows(1);
  h.getRange('A:A').setNumberFormat('dd/mm/yyyy hh:mm');
  h.getRange('B:B').setNumberFormat('"$"#,##0;("$"#,##0);"-"');
  h.getRange('E:H').setNumberFormat('@');
  h.getRange(1, 1).setNote('Movimientos que la automatización no pudo asignar. Si es una cuota, cargala en Pagos ' +
    'con el integrante y copiá el N° de operación. Si no, dejala acá: no se vuelve a cargar.');
  return h;
}

/** Registro permanente de pagos ya procesados, en una hoja oculta. */
function registroProcesados_(ss) {
  let h = ss.getSheetByName(HOJA.PROCESADOS);
  if (!h) {
    h = ss.insertSheet(HOJA.PROCESADOS);
    h.getRange('A:A').setNumberFormat('@');
    h.getRange(1, 1).setValue('N° de operación ya procesado (no borrar)');
    h.hideSheet();
  }
  const vistos = operaciones_(h, 1);
  const nuevos = [];
  return {
    tiene: id => vistos.has(id),
    marcar: id => { if (!vistos.has(id)) { vistos.add(id); nuevos.push([id]); } },
    guardar: () => agregarFilas_(h, nuevos.splice(0), 1, [1]),
  };
}

function leerIntegrantes_(h) {
  const porCuit = {};
  const porIdMp = {};
  leerMiembros_(h).forEach(m => {
    m.cuits.forEach(c => { porCuit[c] = m; });
    m.ids.forEach(id => { porIdMp[id] = m; });
  });
  return { porCuit, porIdMp };
}

/**
 * Integrantes con sus CUIT e ID de Mercado Pago. Una celda puede tener varios,
 * separados por coma (por ejemplo, alguien que paga desde dos cuentas).
 */
function leerMiembros_(h) {
  if (h.getMaxColumns() < COL_INT.TOTAL) h.insertColumnsAfter(h.getMaxColumns(), COL_INT.TOTAL - h.getMaxColumns());
  const n = h.getLastRow() - 1;
  if (n < 1) return [];
  const lista = [];
  h.getRange(2, 1, n, COL_INT.TOTAL).getValues().forEach((f, i) => {
    const apodo = String(f[COL_INT.APODO - 1]).trim();
    if (!apodo) return;
    const ids = listaDe_(f[COL_INT.ID_MP - 1]);
    lista.push({ apodo: apodo, fila: i + 2, cuits: listaDe_(f[COL_INT.CUIT - 1]), ids: ids, idMp: ids[0] || '' });
  });
  return lista;
}

/** "20-29621474-5, 27123456789" → ['20296214745', '27123456789'] */
function listaDe_(v) {
  if (typeof v === 'number') return [v.toFixed(0)];
  return String(v == null ? '' : v).split(/[,;\/\n]+/).map(soloDigitos_).filter(Boolean);
}

/** N° de operación de una columna (desde la fila 2), normalizados. */
function operaciones_(h, col) {
  const n = h.getLastRow() - 1;
  if (n < 1) return new Set();
  return new Set(h.getRange(2, col, n, 1).getValues().map(f => normalizarOp_(f[0])).filter(Boolean));
}

/** "182.263.652.715", 182263652715 y "182263652715" quedan iguales; los códigos con letras no se tocan. */
function normalizarOp_(v) {
  if (typeof v === 'number') return v.toFixed(0);
  const s = String(v == null ? '' : v).replace(/^'/, '').trim();
  return /^[\d.,\s]+$/.test(s) ? s.replace(/\D/g, '') : s;
}

/**
 * Claves "integrante|monto|día" de los pagos ya cargados. También suma las filas
 * que comparten N° de operación (un pago separado en Cuota + Deuda anterior).
 */
function clavesPagos_(h) {
  const claves = new Set();
  const n = h.getLastRow() - 1;
  if (n < 1) return claves;
  const porOp = {};
  h.getRange(2, 1, n, COL_PAGOS.OPERACION).getValues().forEach(f => {
    const fecha = f[COL_PAGOS.FECHA - 1];
    const apodo = String(f[COL_PAGOS.INTEGRANTE - 1]).trim();
    const monto = Number(f[COL_PAGOS.MONTO - 1]) || 0;
    if (!(fecha instanceof Date) || !apodo) return;
    claves.add(claveDia_(apodo, monto, fecha));
    const op = normalizarOp_(f[COL_PAGOS.OPERACION - 1]);
    if (op) {
      porOp[op] = porOp[op] || { apodo: apodo, fecha: fecha, total: 0 };
      porOp[op].total += monto;
    }
  });
  Object.keys(porOp).forEach(op => claves.add(claveDia_(porOp[op].apodo, porOp[op].total, porOp[op].fecha)));
  return claves;
}

function clavesGastos_(h) {
  const claves = new Set();
  const n = h.getLastRow() - 1;
  if (n < 1) return claves;
  h.getRange(2, 1, n, COL_GASTOS.MONTO).getValues().forEach(f => {
    if (f[0] instanceof Date) claves.add(claveDia_(String(f[COL_GASTOS.TIPO - 1]).trim(), Number(f[COL_GASTOS.MONTO - 1]), f[0]));
  });
  return claves;
}

function claveDia_(nombre, monto, fecha) {
  return nombre + '|' + Math.round(monto) + '|' + Utilities.formatDate(fecha, ZONA, 'yyyy-MM-dd');
}

/**
 * Agrega filas al final (agranda la hoja si hace falta); las columnas indicadas quedan como texto.
 * Negro: cargado por la automatización. Azul (COLOR_MANUAL): cargado a mano.
 */
function agregarFilas_(h, filas, ancho, columnasTexto, color) {
  if (!filas.length) return;
  const inicio = h.getLastRow() + 1;
  const faltan = inicio + filas.length - 1 - h.getMaxRows();
  if (faltan > 0) h.insertRowsAfter(h.getMaxRows(), faltan);
  columnasTexto.forEach(c => h.getRange(inicio, c, filas.length, 1).setNumberFormat('@'));
  h.getRange(inicio, 1, filas.length, ancho).setValues(filas)
    .setFontColor(color || '#000000').setFontFamily('Arial');
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

/** La fecha sin hora, en el horario de Argentina. */
function soloDia_(d) {
  const [y, m, dd] = Utilities.formatDate(d, ZONA, 'yyyy-M-d').split('-').map(Number);
  return new Date(y, m - 1, dd);
}

/** Nombre de quien paga, sin email (no se copian datos de contacto). */
function nombrePagador_(p) {
  const nombre = [get_(p, 'payer.first_name'), get_(p, 'payer.last_name')]
    .filter(Boolean).join(' ').trim();
  return nombre || String(get_(p, 'point_of_interaction.transaction_data.bank_info.payer.long_name') || '');
}

/** Texto que viene de afuera: nunca se interpreta como fórmula. */
function texto_(v) {
  const s = String(v == null ? '' : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
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
