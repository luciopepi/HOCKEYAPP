'use strict';
/**
 * Mocks for Google Apps Script services, enough to run Codigo.gs in a Node vm context.
 * Sheets semantics emulated (as Google Sheets does on setValues/setValue):
 *  - strings in cells whose number format is NOT '@' are parsed: "=..." -> formula, numeric -> Number
 *  - Date values come back from getValues() as Date objects of the script realm
 *  - getDisplayValues() renders according to number format
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SHEET_TZ = 'America/Argentina/San_Juan';

// ------------------------------------------------------------ Utilities.formatDate
function tzParts(ms, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const o = {};
  f.formatToParts(new Date(ms)).forEach(p => { o[p.type] = p.value; });
  const asUtc = Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second);
  const offsetMin = Math.round((asUtc - (ms - (ms % 1000 + 1000) % 1000)) / 60000);
  return { y: +o.year, M: +o.month, d: +o.day, H: +o.hour, m: +o.minute, s: +o.second,
    S: ((ms % 1000) + 1000) % 1000, off: offsetMin };
}
const pad = (n, w) => String(n).padStart(w, '0');
function formatDate(date, tz, pattern) {
  if (!date || typeof date.getTime !== 'function' || isNaN(date.getTime())) {
    throw new Error('Utilities.formatDate: invalid date argument');
  }
  const p = tzParts(date.getTime(), tz);
  return pattern.replace(/'[^']*'|y+|M+|d+|H+|m+|s+|S+|X+/g, tok => {
    if (tok[0] === "'") return tok.slice(1, -1);
    const n = tok.length;
    switch (tok[0]) {
      case 'y': return n === 2 ? pad(p.y % 100, 2) : pad(p.y, n);
      case 'M': return pad(p.M, n);
      case 'd': return pad(p.d, n);
      case 'H': return pad(p.H, n);
      case 'm': return pad(p.m, n);
      case 's': return pad(p.s, n);
      case 'S': return pad(p.S, 3).slice(0, n);
      case 'X': {
        if (p.off === 0) return 'Z';
        const sign = p.off < 0 ? '-' : '+';
        const a = Math.abs(p.off);
        return n >= 3 ? `${sign}${pad(Math.floor(a / 60), 2)}:${pad(a % 60, 2)}`
          : `${sign}${pad(Math.floor(a / 60), 2)}${pad(a % 60, 2)}`;
      }
    }
    return tok;
  });
}

// ------------------------------------------------------------ Sheets
const isDate = v => Object.prototype.toString.call(v) === '[object Date]';

function colToNum(s) { let n = 0; for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
function numToCol(n) { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }

function groupThousands(n) {
  const neg = n < 0; const s = String(Math.round(Math.abs(n)));
  return (neg ? '-' : '') + s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

class Sheet {
  constructor(world, name, maxRows = 1000, maxCols = 26) {
    this.world = world; this.name = name; this.maxRows = maxRows; this.maxCols = maxCols;
    this.cells = new Map(); // "r,c" -> {v, fmt, formula, note}
    this.frozen = 0;
  }
  cell(r, c, create) {
    const k = r + ',' + c;
    let x = this.cells.get(k);
    if (!x && create) { x = { v: '' }; this.cells.set(k, x); }
    return x;
  }
  getName() { return this.name; }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  setFrozenRows(n) { this.frozen = n; return this; }
  setConditionalFormatRules(r) { this.cfRules = r; return this; }
  hideSheet() { this.hidden = true; return this; }
  insertColumnsAfter(after, n) { this.maxCols += n; return this; }
  insertRowsAfter(after, n) { this.maxRows += n; return this; }
  // Mueve las celdas desde la fila r (las fórmulas no se reescriben: limitación del simulador).
  shiftRows_(r, delta) {
    const nuevo = new Map();
    for (const [k, x] of this.cells) {
      const [rr, cc] = k.split(',').map(Number);
      if (delta < 0 && rr === r) continue;
      nuevo.set((rr >= r ? rr + delta : rr) + ',' + cc, x);
    }
    this.cells = nuevo;
  }
  insertRowBefore(r) { this.shiftRows_(r, 1); this.maxRows += 1; this.world.log.push('insertRowBefore ' + this.name + ' ' + r); return this; }
  deleteRow(r) { this.shiftRows_(r, -1); this.maxRows -= 1; this.world.log.push('deleteRow ' + this.name + ' ' + r); return this; }
  getLastRow() {
    let last = 0;
    for (const [k, x] of this.cells) {
      if (x.formula || (x.v !== '' && x.v != null)) { const r = +k.split(',')[0]; if (r > last) last = r; }
    }
    return last;
  }
  getLastColumn() {
    let last = 0;
    for (const [k, x] of this.cells) {
      if (x.formula || (x.v !== '' && x.v != null)) { const c = +k.split(',')[1]; if (c > last) last = c; }
    }
    return last;
  }
  getRange(a, b, nr, nc) {
    if (typeof a === 'string') {
      const m = /^([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/.exec(a.trim());
      if (!m) throw new Error('Range not found: ' + a);
      const c1 = colToNum(m[1]);
      const r1 = m[2] ? +m[2] : 1;
      const c2 = m[3] ? colToNum(m[3]) : c1;
      const r2 = m[4] ? +m[4] : (m[2] && !m[3] ? r1 : this.maxRows);
      return new Range(this, r1, c1, r2 - r1 + 1, c2 - c1 + 1);
    }
    return new Range(this, a, b, nr == null ? 1 : nr, nc == null ? 1 : nc);
  }
  // ---- harness helpers
  rows(fromRow = 2) {
    const out = [];
    const last = this.getLastRow();
    const lastCol = Math.max(this.getLastColumn(), 1);
    for (let r = fromRow; r <= last; r++) {
      const row = [];
      for (let c = 1; c <= lastCol; c++) row.push(this.display(r, c));
      out.push(row);
    }
    return out;
  }
  raw(r, c) { const x = this.cell(r, c); return x ? x : { v: '' }; }
  display(r, c) {
    const x = this.cell(r, c);
    if (!x) return '';
    if (x.formula) return 'FORMULA:' + x.formula;
    const v = x.v;
    if (v === '' || v == null) return '';
    if (isDate(v) || (v && v.__date)) {
      const ms = v.__date ? v.ms : v.getTime();
      const f = (x.fmt || '').toLowerCase();
      if (f === 'dd/mm/yyyy') return formatDate(new Date(ms), SHEET_TZ, 'dd/MM/yyyy');
      return formatDate(new Date(ms), SHEET_TZ, 'dd/MM/yyyy HH:mm:ss');
    }
    if (typeof v === 'number') {
      if (x.fmt === '#,##0') return groupThousands(v);
      if (x.fmt === '"$"#,##0') return '$' + groupThousands(v);
      return String(v);
    }
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  }
}

class Range {
  constructor(sheet, r, c, nr, nc) {
    if (!(r >= 1 && c >= 1)) throw new Error('Exception: Range coordinates must be >= 1 (got ' + r + ',' + c + ')');
    if (nr < 1) throw new Error('Exception: The number of rows in the range must be at least 1.');
    if (nc < 1) throw new Error('Exception: The number of columns in the range must be at least 1.');
    if (r + nr - 1 > sheet.maxRows || c + nc - 1 > sheet.maxCols) {
      throw new Error('Exception: The coordinates of the range are outside the dimensions of the sheet.');
    }
    Object.assign(this, { sheet, r, c, nr, nc });
  }
  getA1Notation() { return numToCol(this.c) + this.r + (this.nr > 1 || this.nc > 1 ? ':' + numToCol(this.c + this.nc - 1) + (this.r + this.nr - 1) : ''); }
  getRow() { return this.r; }
  getNumRows() { return this.nr; }
  forEachCell(fn) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) fn(this.sheet.cell(this.r + i, this.c + j, true), i, j); }
  getValues() {
    const W = this.sheet.world;
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) {
        const x = this.sheet.cell(this.r + i, this.c + j);
        if (!x) { row.push(''); continue; }
        if (x.formula) { row.push(x.formulaValue != null ? x.formulaValue : ''); continue; }
        const v = x.v;
        if (v && v.__date) row.push(W.mkDate(v.ms));
        else row.push(v == null ? '' : v);
      }
      out.push(row);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  getDisplayValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) row.push(this.sheet.display(this.r + i, this.c + j));
      out.push(row);
    }
    return out;
  }
  getDisplayValue() { return this.getDisplayValues()[0][0]; }
  setValues(values) {
    if (!Array.isArray(values) || values.length !== this.nr) {
      throw new Error(`Exception: The number of rows in the data does not match the number of rows in the range. The data has ${values && values.length} but the range has ${this.nr}.`);
    }
    values.forEach((row, i) => {
      if (row.length !== this.nc) {
        throw new Error(`Exception: The number of columns in the data does not match the number of columns in the range. The data has ${row.length} but the range has ${this.nc}.`);
      }
      row.forEach((v, j) => writeCell(this.sheet, this.r + i, this.c + j, v));
    });
    this.sheet.world.log.push(`setValues ${this.sheet.name}!${this.getA1Notation()}`);
    return this;
  }
  setValue(v) { this.forEachCell((x, i, j) => writeCell(this.sheet, this.r + i, this.c + j, v)); return this; }
  setNumberFormat(f) { this.forEachCell(x => { x.fmt = f; }); return this; }
  setNote(n) { this.forEachCell(x => { x.note = n; }); return this; }
  getNote() { const x = this.sheet.cell(this.r, this.c); return (x && x.note) || ''; }
  clearContent() { this.forEachCell(x => { x.v = ''; delete x.formula; delete x.formulaValue; }); return this; }
  setDataValidation(rule) { this.forEachCell(x => { x.validation = rule; }); return this; }
  setFontColor(c) { this.forEachCell(x => { x.color = c; }); return this; }
  setFontFamily(f) { this.forEachCell(x => { x.font = f; }); return this; }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setHorizontalAlignment() { return this; }
  setWrap() { return this; }
  copyTo(dest, type) {
    for (let i = 0; i < Math.min(this.nr, dest.nr); i++) for (let j = 0; j < Math.min(this.nc, dest.nc); j++) {
      const src = this.sheet.cell(this.r + i, this.c + j);
      const dst = dest.sheet.cell(dest.r + i, dest.c + j, true);
      if (src) { dst.fmt = src.fmt; dst.color = src.color; }
    }
    this.sheet.world.log.push('copyTo ' + type + ' ' + dest.sheet.name + '!' + dest.getA1Notation());
    return this;
  }
  getFormulasR1C1() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) { const x = this.sheet.cell(this.r + i, this.c + j); row.push(x && x.formula ? x.formula : ''); }
      out.push(row);
    }
    return out;
  }
  setFormulasR1C1(f) {
    f.forEach((row, i) => row.forEach((v, j) => {
      const x = this.sheet.cell(this.r + i, this.c + j, true);
      if (v) { x.formula = v; x.formulaValue = '#FORMULA'; x.v = ''; } else { delete x.formula; delete x.formulaValue; x.v = ''; }
    }));
    return this;
  }
}

function writeCell(sheet, r, c, v) {
  const x = sheet.cell(r, c, true);
  delete x.formula; delete x.formulaValue;
  if (v == null) { x.v = ''; return; }
  if (isDate(v)) { x.v = { __date: true, ms: v.getTime() }; return; }
  if (typeof v === 'number' || typeof v === 'boolean') { x.v = v; return; }
  const s = String(v);
  if (s.startsWith("'")) { x.v = s.slice(1); return; } // Sheets: leading apostrophe forces literal text
  if (x.fmt === '@') { x.v = s; return; }
  if (s.startsWith('=')) { x.formula = s; x.v = ''; x.formulaValue = '#FORMULA'; sheet.world.formulas.push(`${sheet.name}!${numToCol(c)}${r}: ${s}`); return; }
  if (/^-?\d+(\.\d+)?$/.test(s.trim())) { x.v = Number(s); return; }
  x.v = s;
}

// ------------------------------------------------------------ Mercado Pago fake
function makeMP(world, opts) {
  const o = Object.assign({ unfilteredIncludesPayer: false, invalidRange: 'error400', ignoreRange: false, maxLimit: 50, maxOffset: 10000 }, opts);
  world.mpOpts = o;
  return function fetch(url, params) {
    world.fetches.push(url);
    const auth = params && params.headers && params.headers.Authorization;
    if (auth !== 'Bearer ' + world.token) return resp(401, { message: 'invalid token' });
    const u = new URL(url);
    if (u.pathname === '/users/me') return resp(200, { id: world.me, nickname: 'ADMIN', first_name: 'Admin' });
    if (u.pathname === '/v1/payments/search') {
      const q = u.searchParams;
      const limit = +q.get('limit') || 30; const offset = +q.get('offset') || 0;
      if (limit > o.maxLimit) return resp(400, { message: 'limit too big' });
      if (offset > o.maxOffset) return resp(400, { message: 'offset too big' });
      const range = q.get('range') || 'date_created';
      const b = q.get('begin_date'); const e = q.get('end_date');
      const bt = b ? Date.parse(b) : -Infinity; const et = e ? Date.parse(e) : Infinity;
      if (b && isNaN(bt)) return resp(400, { message: 'bad begin_date ' + b });
      if (e && isNaN(et)) return resp(400, { message: 'bad end_date ' + e });
      if (bt > et && !o.ignoreRange) {
        if (o.invalidRange === 'error400') return resp(400, { message: 'begin_date must be before end_date' });
        return resp(200, { results: [], paging: { total: 0, limit, offset } });
      }
      let list = world.payments.filter(p => {
        if (!o.ignoreRange) {
          const t = Date.parse(p[range] || p.date_created);
          if (t < bt || t > et) return false;
        }
        const pid = q.get('payer.id');
        if (pid) return String(p.payer && p.payer.id) === String(pid);
        return String(p.collector_id) === String(world.me) ||
          (o.unfilteredIncludesPayer && String(p.payer && p.payer.id) === String(world.me));
      });
      const sortKey = q.get('sort') || 'date_created';
      const desc = (q.get('criteria') || 'desc') === 'desc';
      list = list.slice().sort((x, y) => (Date.parse(x[sortKey]) - Date.parse(y[sortKey])) * (desc ? -1 : 1));
      const page = list.slice(offset, offset + limit);
      return resp(200, { results: JSON.parse(JSON.stringify(page)), paging: { total: list.length, limit, offset } });
    }
    const m = /^\/v1\/payments\/(\d+)$/.exec(u.pathname);
    if (m) {
      const p = world.payments.find(x => String(x.id) === m[1]);
      if (!p) return resp(404, { message: 'Payment not found' });
      if (String(p.collector_id) !== String(world.me) && String(p.payer && p.payer.id) !== String(world.me)) {
        return resp(404, { message: 'Payment not found' });
      }
      return resp(200, JSON.parse(JSON.stringify(p)));
    }
    return resp(404, { message: 'not found ' + u.pathname });
  };
}
function resp(code, body) {
  const t = typeof body === 'string' ? body : JSON.stringify(body);
  return { getResponseCode: () => code, getContentText: () => t };
}

// ------------------------------------------------------------ World
/**
 * Create a fresh "spreadsheet + MP account + Apps Script runtime" and load Codigo.gs in it.
 */
// Google Drive: carpeta, subidas (con o sin OCR), exportar texto y borrar.
function driveFake(world, url, params) {
  world.drive = world.drive || { files: {}, n: 0, calls: [] };
  const D = world.drive;
  const method = ((params && params.method) || 'get').toLowerCase();
  D.calls.push(method + ' ' + url);
  if ((params && params.headers && params.headers.Authorization) !== 'Bearer drive-token') return resp(401, { error: 'no auth' });
  if (method === 'post' && /\/upload\/drive\/v3\/files/.test(url)) {
    const id = 'arch' + (++D.n);
    const texto = Buffer.from(params.payload.map(b => b & 255)).toString('latin1');
    D.files[id] = { ocr: /google-apps\.document/.test(texto), parents: /"parents":\["([^"]+)"/.exec(texto) };
    return resp(200, { id });
  }
  if (method === 'post' && /\/drive\/v3\/files$/.test(url)) { const id = 'carpeta' + (++D.n); D.files[id] = { folder: true }; return resp(200, { id }); }
  const exp = /\/drive\/v3\/files\/([^/?]+)\/export/.exec(url);
  if (exp) return resp(200, world.ocrTexto || '');
  const del = /\/drive\/v3\/files\/([^/?]+)$/.exec(url);
  if (method === 'delete' && del) { delete D.files[del[1]]; return resp(204, {}); }
  return resp(404, { error: 'drive ' + url });
}

function chain(tipo) {
  const calls = [];
  const obj = new Proxy({}, { get: (t, k) => (k === 'build' ? () => ({ tipo, calls }) : (...a) => { calls.push([k, a]); return obj; }) });
  return obj;
}

function createWorld(opts) {
  const world = {
    me: opts.me, token: 'APP_USR-test', payments: opts.payments || [],
    sheets: new Map(), fetches: [], log: [], scriptProps: {}, formulas: [], consoleOut: [], sleeps: 0, triggers: [],
  };
  const ss = {
    getSheetByName: n => world.sheets.get(n) || null,
    insertSheet: n => {
      if (world.sheets.has(n)) throw new Error('A sheet with the name "' + n + '" already exists.');
      const s = new Sheet(world, n); world.sheets.set(n, s); world.log.push('insertSheet ' + n); return s;
    },
    getSheets: () => [...world.sheets.values()],
  };
  world.ss = ss;
  world.addSheet = (name, rows, maxCols) => {
    const s = new Sheet(world, name, 1000, maxCols || 26);
    world.sheets.set(name, s);
    (rows || []).forEach((row, i) => row.forEach((v, j) => {
      if (v === undefined) return;
      const x = s.cell(i + 1, j + 1, true);
      if (v && typeof v === 'object' && 'value' in v) { // {value, fmt}
        x.fmt = v.fmt;
        if (v.value instanceof Date) x.v = { __date: true, ms: v.value.getTime() };
        else x.v = v.value;
      } else if (v instanceof Date) x.v = { __date: true, ms: v.getTime() };
      else x.v = v;
    }));
    return s;
  };

  const sandbox = {
    console: { log: (...a) => world.consoleOut.push(a.join(' ')), error: (...a) => world.consoleOut.push('ERR ' + a.join(' ')), warn: (...a) => world.consoleOut.push('WARN ' + a.join(' ')) },
    SpreadsheetApp: {
      getActive: () => ss, getActiveSpreadsheet: () => ss, flush: () => {},
      newConditionalFormatRule: () => chain('cf'), newDataValidation: () => chain('dv'),
      CopyPasteType: { PASTE_FORMAT: 'PASTE_FORMAT', PASTE_NORMAL: 'PASTE_NORMAL' },
      getUi: () => { if (opts.ui) return opts.ui; throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); },
    },
    UrlFetchApp: { fetch: ((mp) => (url, params) => (/googleapis\.com/.test(url) ? driveFake(world, url, params) : mp(url, params)))(makeMP(world, opts.mp || {})) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (world.scriptProps[k] == null ? null : world.scriptProps[k]), setProperty: (k, v) => { world.scriptProps[k] = String(v); } }), getUserProperties: () => ({ getProperty: k => (k === 'MP_ACCESS_TOKEN' ? world.token : null), setProperty: (k, v) => { world.token = v; } }) },
    CacheService: { getScriptCache: () => ({
      get: k => (world.cache && world.cache[k]) || null,
      put: (k, v) => { (world.cache = world.cache || {})[k] = v; },
      remove: k => { if (world.cache) delete world.cache[k]; world.cacheRemoved = (world.cacheRemoved || 0) + 1; },
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    Utilities: {
      formatDate, sleep: () => { world.sleeps++; },
      getUuid: () => require('crypto').randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, text) => [...require('crypto').createHash(alg).update(String(text), 'utf8').digest()].map(b => (b > 127 ? b - 256 : b)),
      base64Encode: bytes => Buffer.from(bytes.map(b => b & 255)).toString('base64'),
      base64Decode: str => [...Buffer.from(String(str), 'base64')].map(b => (b > 127 ? b - 256 : b)),
      newBlob: (data, tipo, nombre) => {
        const bytes = Array.isArray(data) ? data : [...Buffer.from(String(data), 'utf8')].map(b => (b > 127 ? b - 256 : b));
        return { getBytes: () => bytes.slice(), getContentType: () => tipo || 'text/plain', getName: () => nombre || 'blob' };
      },
    },
    ScriptApp: {
      getOAuthToken: () => 'drive-token',
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }),
      newTrigger: h => { const t = { h }; const b = { timeBased: () => b, everyMinutes: () => b, create: () => { world.triggers.push(t); return t; } }; return b; },
      getProjectTriggers: () => world.triggers.map(t => ({ getHandlerFunction: () => t.h })),
      deleteTrigger: () => {},
    },
  };
  const ctx = vm.createContext(sandbox);
  // Controllable clock inside the script realm.
  vm.runInContext(`
    (function(){
      const RealDate = Date;
      let nowMs = RealDate.now();
      class FakeDate extends RealDate {
        constructor(...a) { if (a.length === 0) super(nowMs); else super(...a); }
        static now() { return nowMs; }
      }
      globalThis.Date = FakeDate;
      globalThis.__setNow = ms => { nowMs = ms; };
      globalThis.__mkDate = ms => new FakeDate(ms);
    })();`, ctx);
  world.mkDate = ms => ctx.__mkDate(ms);
  world.setNow = iso => ctx.__setNow(Date.parse(iso));
  const src = fs.readFileSync(opts.codePath, 'utf8');
  vm.runInContext(src, ctx, { filename: 'Codigo.gs' });
  ['Calculo.gs', 'Web.gs'].forEach(f => {
    const extra = path.join(path.dirname(opts.codePath), f);
    if (fs.existsSync(extra)) vm.runInContext(fs.readFileSync(extra, 'utf8'), ctx, { filename: f });
  });
  world.ctx = ctx;
  world.run = (fn) => vm.runInContext(fn + '()', ctx);
  world.sheet = n => world.sheets.get(n);
  return world;
}

module.exports = { createWorld, formatDate, Sheet };
