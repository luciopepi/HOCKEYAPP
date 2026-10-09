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
