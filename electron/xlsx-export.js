'use strict';
/**
 * MauProject — Excel "WBS & Workload" export.
 * Produces a live, formula-driven workbook with the same layout as the team's
 * Resource Mapping template: Petunjuk, Master, Hari Libur, Task Plan, Ringkasan, Resource Map.
 * Cached results are written alongside every formula so the file previews correctly
 * before Excel recalculates.
 */
const ExcelJS = require('exceljs');

const NAVY = 'FF1F3864';
const INPUT_FILL = 'FFFFF9DB';
const INPUT_FONT = 'FF0000FF';
const SUMMARY_FILL = 'FFBDD7EE';
const TOTAL_FILL = 'FFD9E1F2';
const PHASE_FILL = 'FFF2F2F2';
const FONT = 'Arial';
// [summary, done, planned] per project (same palette as the template)
const PALETTE = [
  ['1F4E79', '2E75B6', 'BDD7EE'], ['375623', '70AD47', 'C6E0B4'], ['833C0B', 'ED7D31', 'F8CBAD'],
  ['3F3151', '8064A2', 'CCC0DA'], ['7F6000', 'FFC000', 'FFE699'], ['1D0F40', '351C75', 'AEA4C8'],
  ['5B5B5B', 'A6A6A6', 'DBDBDB'], ['694F00', 'BF9000', 'E5D399'], ['700000', 'CC0000', 'EB9999'],
];
const DARK_TEXT_ON = new Set([4, 6]); // palette indexes whose medium color needs black text
const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const DAY_LETTER_ID = ['S', 'S', 'R', 'K', 'J', 'S', 'M']; // Senin..Minggu (WEEKDAY(,2) order)

// ---------- helpers ----------
const DAY = 86400000;
const toDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(toDate(s).getTime() + n * DAY));
const wd2 = (s) => { const w = toDate(s).getUTCDay(); return w === 0 ? 7 : w; }; // Excel WEEKDAY(x,2)

function colLetter(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function solid(argb) { return { type: 'pattern', pattern: 'solid', fgColor: { argb }, bgColor: { argb } }; }
function font(opts = {}) { return { name: FONT, size: opts.size || 10, bold: !!opts.bold, color: { argb: opts.color || 'FF000000' }, italic: !!opts.italic }; }
const thin = { style: 'thin', color: { argb: 'FFD9D9D9' } };
const border = { top: thin, left: thin, bottom: thin, right: thin };

function setCell(ws, addr, value, style = {}) {
  const c = ws.getCell(addr);
  c.value = value;
  c.font = font(style.font || {});
  if (style.fill) c.fill = solid(style.fill);
  if (style.numFmt) c.numFmt = style.numFmt;
  if (style.align || style.wrap) c.alignment = { horizontal: style.align, vertical: 'middle', wrapText: !!style.wrap };
  if (style.border) c.border = border;
  return c;
}
const F = (formula, result) => ({ formula, result: result === undefined ? undefined : result });

function headerRow(ws, row, cols, labels, startCol = 1) {
  labels.forEach((label, i) => {
    setCell(ws, `${colLetter(startCol + i)}${row}`, label, { font: { bold: true, color: 'FFFFFFFF', size: 9 }, fill: NAVY, align: 'center', wrap: true, border: true });
  });
}

/**
 * @param {object} m model built by the renderer (src/lib/excelModel.js)
 */
async function buildWorkbook(m) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MauProject';
  wb.company = 'MauProject';
  wb.title = m.title;
  wb.subject = 'Project Management & Engineering Resource Planning';
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;

  const holidays = new Set(m.holidays.map((h) => h.date));
  const mask = m.weekendMask; // 7 chars Mon..Sun, '1' = weekend
  const isWorking = (d) => mask[wd2(d) - 1] === '0' && !holidays.has(d);
  const networkdays = (a, b) => { let n = 0; for (let d = a; d <= b; d = addDays(d, 1)) if (isWorking(d)) n++; return n; };
  const standardWeekend = mask === '0000011';
  const ndFormula = (a, b) => (standardWeekend ? `NETWORKDAYS(${a},${b},Hari_Libur)` : `_xlfn.NETWORKDAYS.INTL(${a},${b},"${mask}",Hari_Libur)`);
  const weekendExpr = (cell) => `MID("${mask}",WEEKDAY(${cell},2),1)="1"`;

  const days = [];
  for (let i = 0; i < m.days; i++) days.push(addDays(m.periodStart, i));
  const periodEnd = days[days.length - 1];
  const periodWorkdays = networkdays(m.periodStart, periodEnd);
  const nP = m.projects.length;
  const nR = m.resources.length;
  const moneyFmt = m.currencyFormat;

  // ======================= Petunjuk =======================
  const pj = wb.addWorksheet('Petunjuk', { views: [{ showGridLines: false }] });
  pj.columns = [{ width: 3 }, { width: 30 }, { width: 100 }];
  setCell(pj, 'B1', m.title, { font: { size: 16, bold: true, color: NAVY } });
  setCell(pj, 'B2', 'Dibuat oleh MauProject — Project Management & Engineering Resource Planning. Lihat siapa mengerjakan apa, di proyek mana, dan di hari apa.', { font: { size: 10, color: 'FF595959' } });
  setCell(pj, 'B4', 'ALUR PENGGUNAAN', { font: { bold: true, size: 11, color: 'FFFFFFFF' }, fill: NAVY });
  setCell(pj, 'C4', '', { fill: NAVY });
  const steps = [
    ['1. Master', 'Daftar proyek (kode, nama, PM), daftar resource (nama, peran, kapasitas jam/hari, tarif) dan daftar status. Kode proyek & nama resource menjadi pilihan dropdown di Task Plan.'],
    ['2. Hari Libur', 'Hari libur/cuti bersama dari kalender MauProject. Tanggal ini tidak dihitung sebagai hari kerja.'],
    ['3. Task Plan', 'Tiap proyek = 1 blok WBS hasil ekspor MauProject. Kolom biru boleh diubah: Aktivitas, PIC, Mulai, Selesai, Jam/Hari, % Selesai, Status. Baris kuning kosong di tiap blok disediakan untuk aktivitas tambahan.'],
    ['4. Resource Map', 'Otomatis. Per orang: baris TOTAL JAM (hijau/kuning/merah vs kapasitas) + rincian jam per proyek per hari.'],
    ['5. Ringkasan', `Otomatis. Utilisasi tiap orang, hari overload, jam puncak, biaya (${m.currency}), serta status, progres dan biaya tiap proyek.`],
  ];
  steps.forEach(([a, b], i) => { setCell(pj, `B${5 + i}`, a, { font: { bold: true } }); setCell(pj, `C${5 + i}`, b, { wrap: true }); });
  setCell(pj, 'B11', 'LEGENDA', { font: { bold: true, size: 11, color: 'FFFFFFFF' }, fill: NAVY });
  setCell(pj, 'C11', '', { fill: NAVY });
  const legend = [
    ['Teks biru / sel kuning muda', 'Sel input yang boleh Anda ubah. Teks hitam = rumus, jangan ditimpa.'],
    ['Bar Gantt gelap / sedang / terang', 'Gelap = ringkasan proyek, sedang = porsi yang sudah selesai (sesuai % Selesai), terang = sisa rencana.'],
    ['Kolom abu-abu', 'Akhir pekan. Header oranye = hari ini. Hari libur tidak dihitung di Resource Map.'],
    ['TOTAL JAM hijau / kuning / merah', 'Hijau = tepat kapasitas, kuning = di bawah kapasitas, merah = overload (melebihi kapasitas harian).'],
    ['Mata uang', `Semua biaya dalam ${m.currency}. Tarif per jam diambil dari data Team di MauProject.`],
  ];
  legend.forEach(([a, b], i) => { setCell(pj, `B${12 + i}`, a, { font: { bold: true } }); setCell(pj, `C${12 + i}`, b, { wrap: true }); });
  setCell(pj, 'B18', 'Periode', { font: { bold: true } });
  setCell(pj, 'C18', `${m.periodLabel} (${m.days} hari, ${periodWorkdays} hari kerja). Diekspor ${m.exportedLabel}.`);

  // ======================= Master =======================
  const ms = wb.addWorksheet('Master', { views: [{ showGridLines: false }] });
  ms.columns = [{ width: 3 }, { width: 40 }, { width: 30 }, { width: 22 }, { width: 18 }, { width: 18 }];
  setCell(ms, 'B1', 'Master Data', { font: { size: 14, bold: true, color: NAVY } });
  setCell(ms, 'B3', 'PENGATURAN PERIODE', { font: { bold: true, color: NAVY } });
  setCell(ms, 'B4', 'Tanggal mulai timeline');
  setCell(ms, 'C4', toDate(m.periodStart), { numFmt: 'dd-mmm-yyyy', align: 'center', fill: INPUT_FILL, font: { color: INPUT_FONT } });
  setCell(ms, 'D4', `Timeline ${m.days} hari`, { font: { size: 9, color: 'FF7F7F7F' } });
  setCell(ms, 'B5', `Tanggal akhir timeline (otomatis, ${m.days} hari)`);
  setCell(ms, 'C5', F(`C4+${m.days - 1}`, toDate(periodEnd)), { numFmt: 'dd-mmm-yyyy', align: 'center' });
  setCell(ms, 'B6', 'Jumlah hari kerja periode (otomatis)');
  setCell(ms, 'C6', F(ndFormula('C4', 'C5'), periodWorkdays), { align: 'center' });
  setCell(ms, 'B7', 'Tanggal hari ini (otomatis)');
  setCell(ms, 'C7', F('TODAY()', toDate(m.today)), { numFmt: 'dd-mmm-yyyy', align: 'center' });

  setCell(ms, 'B8', 'DAFTAR PROYEK', { font: { bold: true, color: NAVY } });
  headerRow(ms, 9, 5, ['Kode Proyek', 'Nama Proyek', 'PM', 'Warna di Gantt', `Anggaran (${m.currency})`], 2);
  const P0 = 10;
  const PL = P0 + Math.max(nP, 1) - 1;
  m.projects.forEach((p, i) => {
    const r = P0 + i;
    const pal = PALETTE[i % PALETTE.length];
    setCell(ms, `B${r}`, p.code, { fill: INPUT_FILL, font: { color: INPUT_FONT }, border: true });
    setCell(ms, `C${r}`, p.name, { fill: INPUT_FILL, font: { color: INPUT_FONT }, border: true });
    setCell(ms, `D${r}`, p.pm, { fill: INPUT_FILL, font: { color: INPUT_FONT }, border: true });
    setCell(ms, `E${r}`, '', { fill: 'FF' + pal[1], border: true });
    setCell(ms, `F${r}`, p.budget, { fill: INPUT_FILL, font: { color: INPUT_FONT }, numFmt: moneyFmt, border: true });
  });
  setCell(ms, `B${PL + 2}`, 'Kode proyek dipakai sebagai kunci di Task Plan. Warna mengikuti urutan proyek.', { font: { size: 9, italic: true, color: 'FF7F7F7F' } });

  const R0Title = PL + 4;
  setCell(ms, `B${R0Title}`, 'DAFTAR RESOURCE', { font: { bold: true, color: NAVY } });
  headerRow(ms, R0Title + 1, 4, ['Nama', 'Peran', 'Kapasitas (jam/hari)', `Tarif / jam (${m.currency})`], 2);
  const R0 = R0Title + 2;
  const RL = R0 + Math.max(nR, 1) - 1;
  m.resources.forEach((r, i) => {
    const row = R0 + i;
    setCell(ms, `B${row}`, r.name, { fill: INPUT_FILL, font: { color: INPUT_FONT }, border: true });
    setCell(ms, `C${row}`, r.role, { fill: INPUT_FILL, font: { color: INPUT_FONT }, border: true });
    setCell(ms, `D${row}`, r.cap, { fill: INPUT_FILL, font: { color: INPUT_FONT }, numFmt: '0.0', align: 'center', border: true });
    setCell(ms, `E${row}`, r.rate, { fill: INPUT_FILL, font: { color: INPUT_FONT }, numFmt: moneyFmt, border: true });
  });

  const S0Title = RL + 3;
  const STATUSES = ['Not Started', 'In Progress', 'Done', 'On Hold', 'Delayed'];
  setCell(ms, `B${S0Title}`, 'DAFTAR STATUS', { font: { bold: true, color: NAVY } });
  headerRow(ms, S0Title + 1, 1, ['Status'], 2);
  const S0 = S0Title + 2;
  STATUSES.forEach((s, i) => setCell(ms, `B${S0 + i}`, s, { fill: INPUT_FILL, font: { color: INPUT_FONT }, border: true }));
  const SL = S0 + STATUSES.length - 1;

  const projRange = `Master!$B$${P0}:$B$${PL}`;
  const resRange = `Master!$B$${R0}:$B$${RL}`;

  // ======================= Hari Libur =======================
  const hl = wb.addWorksheet('Hari Libur', { views: [{ showGridLines: false }] });
  hl.columns = [{ width: 16 }, { width: 45 }];
  setCell(hl, 'A1', 'Daftar Hari Libur & Cuti Bersama', { font: { size: 14, bold: true, color: NAVY } });
  hl.mergeCells('A2:B2');
  setCell(hl, 'A2', 'Tanggal di sini TIDAK dihitung sebagai hari kerja. Diekspor dari Settings → Working calendar di MauProject.', { font: { size: 9, color: 'FF595959' }, wrap: true });
  headerRow(hl, 4, 2, ['Tanggal', 'Keterangan']);
  const HL_ROWS = Math.max(30, m.holidays.length + 10);
  for (let i = 0; i < HL_ROWS; i++) {
    const h = m.holidays[i];
    setCell(hl, `A${5 + i}`, h ? toDate(h.date) : null, { numFmt: 'dd-mmm-yyyy', align: 'center', fill: INPUT_FILL, font: { color: INPUT_FONT }, border: true });
    setCell(hl, `B${5 + i}`, h ? h.name : null, { fill: INPUT_FILL, font: { color: INPUT_FONT }, border: true });
  }
  wb.definedNames.add(`'Hari Libur'!$A$5:$A$${4 + HL_ROWS}`, 'Hari_Libur');

  // ======================= Task Plan =======================
  const tp = wb.addWorksheet('Task Plan', { views: [{ state: 'frozen', xSplit: 4, ySplit: 5, showGridLines: false, zoomScale: 90 }] });
  const TL0 = 14; // column N
  const lastCol = TL0 + days.length - 1;
  const TLL = colLetter(TL0);
  const TLE = colLetter(lastCol);
  const widths = [4, 8, 18, 40, 22, 11, 11, 7, 7, 8, 8, 12, 4];
  widths.forEach((w, i) => { tp.getColumn(i + 1).width = w; });
  for (let c = TL0; c <= lastCol; c++) tp.getColumn(c).width = 3.3;
  setCell(tp, 'A1', `Task Plan — WBS & Timeline Gantt (${m.periodLabel})`, { font: { size: 14, bold: true, color: NAVY } });
  setCell(tp, 'A2', 'Isi kolom biru: Aktivitas, PIC, Mulai, Selesai, Jam/Hari, % Selesai, Status. Bar Gantt, hari kerja dan total jam dihitung otomatis.', { font: { size: 9 } });
  headerRow(tp, 5, 13, ['No', 'WBS', 'Proyek', 'Aktivitas / Deliverable', 'PIC', 'Mulai', 'Selesai', 'Hari Kerja', 'Jam / Hari', 'Total Jam', '% Selesai', 'Status', 'Idx']);
  tp.getRow(5).height = 28;
  // timeline header
  days.forEach((d, i) => {
    const col = colLetter(TL0 + i);
    const prev = i === 0 ? `Master!$C$4` : `${colLetter(TL0 + i - 1)}5+1`;
    setCell(tp, `${col}5`, F(i === 0 ? 'Master!$C$4' : prev, toDate(d)), { numFmt: 'd', font: { bold: true, size: 8, color: 'FFFFFFFF' }, fill: NAVY, align: 'center' });
    setCell(tp, `${col}4`, F(`CHOOSE(WEEKDAY(${col}5,2),"S","S","R","K","J","S","M")`, DAY_LETTER_ID[wd2(d) - 1]), { font: { bold: true, size: 8, color: 'FFFFFFFF' }, fill: NAVY, align: 'center' });
  });
  // month bands
  let mStart = 0;
  for (let i = 1; i <= days.length; i++) {
    if (i === days.length || days[i].slice(0, 7) !== days[mStart].slice(0, 7)) {
      const a = colLetter(TL0 + mStart);
      const b = colLetter(TL0 + i - 1);
      if (i - 1 > mStart) tp.mergeCells(`${a}3:${b}3`);
      const d = toDate(days[mStart]);
      setCell(tp, `${a}3`, F(`CHOOSE(MONTH(${a}5),"Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember")&" "&YEAR(${a}5)`, `${MONTHS_ID[d.getUTCMonth()]} ${d.getUTCFullYear()}`),
        { font: { bold: true, size: 9, color: 'FFFFFFFF' }, fill: NAVY, align: 'center' });
      mStart = i;
    }
  }

  const BLANK_ROWS = 3;
  let row = 6;
  let no = 1;
  const taskRows = []; // for Resource Map results {pic, start, finish, jam, code}
  const blocks = [];
  m.projects.forEach((p, pi) => {
    const s = row;
    const first = s + 1;
    const last = s + p.rows.length + BLANK_ROWS;
    blocks.push({ code: p.code, summaryRow: s, first, last });
    const idx = pi + 1;
    // summary row
    const sum = p.summary;
    const sStyle = { fill: SUMMARY_FILL, font: { bold: true }, border: true };
    setCell(tp, `A${s}`, null, sStyle);
    setCell(tp, `B${s}`, String(pi + 1), sStyle);
    setCell(tp, `C${s}`, F(`Master!$B$${P0 + pi}`, p.code), sStyle);
    setCell(tp, `D${s}`, F(`Master!$C$${P0 + pi}`, p.name), sStyle);
    setCell(tp, `E${s}`, null, sStyle);
    setCell(tp, `F${s}`, F(`IF(COUNT(F${first}:F${last})=0,"",MIN(F${first}:F${last}))`, sum.start ? toDate(sum.start) : ''), { ...sStyle, numFmt: 'dd-mmm-yy', align: 'center' });
    setCell(tp, `G${s}`, F(`IF(COUNT(G${first}:G${last})=0,"",MAX(G${first}:G${last}))`, sum.finish ? toDate(sum.finish) : ''), { ...sStyle, numFmt: 'dd-mmm-yy', align: 'center' });
    setCell(tp, `H${s}`, F(`IF(OR(F${s}="",G${s}=""),0,${ndFormula(`F${s}`, `G${s}`)})`, sum.start ? networkdays(sum.start, sum.finish) : 0), { ...sStyle, numFmt: '0;-0;;', align: 'center' });
    setCell(tp, `I${s}`, null, sStyle);
    let totalJ = 0, wK = 0;
    p.rows.forEach((r) => { if (r.pic && r.jam) { const h = networkdays(r.start, r.finish) * r.jam; totalJ += h; wK += h * r.pct; } });
    setCell(tp, `J${s}`, F(`SUM(J${first}:J${last})`, totalJ), { ...sStyle, numFmt: '0.0;-0.0;;', align: 'center' });
    const kRes = totalJ ? wK / totalJ : 0;
    setCell(tp, `K${s}`, F(`IF(J${s}=0,0,SUMPRODUCT(J${first}:J${last},K${first}:K${last})/J${s})`, kRes), { ...sStyle, numFmt: '0%', align: 'center' });
    setCell(tp, `L${s}`, F(`IF(K${s}>=1,"Done",IF(K${s}<=0,"Not Started","In Progress"))`, kRes >= 1 ? 'Done' : kRes <= 0 ? 'Not Started' : 'In Progress'), { ...sStyle, align: 'center' });
    setCell(tp, `M${s}`, F(`IFERROR(MATCH(C${s},${projRange},0),0)`, idx), { ...sStyle, align: 'center', font: { size: 8, color: 'FF7F7F7F' } });

    // task rows + blank input rows
    for (let k = 0; k < p.rows.length + BLANK_ROWS; k++) {
      const r = first + k;
      const t = p.rows[k];
      const phaseStyle = t && t.phase ? { fill: PHASE_FILL } : {};
      setCell(tp, `A${r}`, t ? no++ : null, { align: 'center', border: true, ...phaseStyle });
      setCell(tp, `B${r}`, t ? t.wbs : `${pi + 1}.${k + 1}`, { align: 'left', border: true, font: { bold: !!(t && t.phase) }, ...phaseStyle });
      setCell(tp, `C${r}`, F(`$C$${s}`, p.code), { border: true, font: { size: 9, color: 'FF595959' }, ...phaseStyle });
      const st = (extra = {}) => ({ fill: t && t.phase ? PHASE_FILL : INPUT_FILL, font: { color: INPUT_FONT, bold: !!(t && t.phase) }, border: true, ...extra });
      setCell(tp, `D${r}`, t ? `${'   '.repeat(Math.max(0, t.level))}${t.name}` : null, st());
      setCell(tp, `E${r}`, t ? t.pic || null : null, st({ align: 'center' }));
      setCell(tp, `F${r}`, t ? toDate(t.start) : null, st({ numFmt: 'dd-mmm-yy', align: 'center' }));
      setCell(tp, `G${r}`, t ? toDate(t.finish) : null, st({ numFmt: 'dd-mmm-yy', align: 'center' }));
      const hd = t ? networkdays(t.start, t.finish) : 0;
      setCell(tp, `H${r}`, F(`IF(OR(F${r}="",G${r}=""),0,${ndFormula(`F${r}`, `G${r}`)})`, hd), { numFmt: '0;-0;;', align: 'center', border: true, ...phaseStyle });
      setCell(tp, `I${r}`, t && t.jam ? t.jam : null, st({ numFmt: '0.0', align: 'center' }));
      setCell(tp, `J${r}`, F(`IF(OR(H${r}=0,I${r}=""),0,H${r}*I${r})`, t && t.jam ? hd * t.jam : 0), { numFmt: '0.0;-0.0;;', align: 'center', border: true, ...phaseStyle });
      setCell(tp, `K${r}`, t ? t.pct : null, st({ numFmt: '0%', align: 'center' }));
      setCell(tp, `L${r}`, t ? t.status : null, st({ align: 'center' }));
      setCell(tp, `M${r}`, F(`IFERROR(MATCH(C${r},${projRange},0),0)`, idx), { align: 'center', font: { size: 8, color: 'FF7F7F7F' }, ...phaseStyle });
      if (t && t.pic && t.jam) taskRows.push({ pic: t.pic, code: p.code, start: t.start, finish: t.finish, jam: t.jam });
      // input validation
      tp.getCell(`C${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [projRange] };
      tp.getCell(`E${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [resRange] };
      tp.getCell(`L${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`Master!$B$${S0}:$B$${SL}`] };
      tp.getCell(`I${r}`).dataValidation = { type: 'decimal', operator: 'between', allowBlank: true, formulae: [0, 24], showErrorMessage: true, error: 'Jam per hari 0–24' };
      tp.getCell(`K${r}`).dataValidation = { type: 'decimal', operator: 'between', allowBlank: true, formulae: [0, 1], showErrorMessage: true, error: '% Selesai 0–100%' };
    }
    row = last + 2; // blank separator row
  });
  const lastTaskRow = Math.max(row - 2, 6);
  // blank-row WBS codes: rewrite cleanly
  blocks.forEach((b, pi) => {
    const p = m.projects[pi];
    for (let k = 0; k < BLANK_ROWS; k++) tp.getCell(`B${b.first + p.rows.length + k}`).value = `${pi + 1}.${p.rows.length + k + 1}`;
  });

  // Gantt conditional formatting
  const ganttRef = `${TLL}6:${TLE}${lastTaskRow}`;
  const tpRules = [];
  let prio = 1;
  tpRules.push({ type: 'expression', priority: prio++, formulae: [`${TLL}$5=TODAY()`], style: { border: { left: { style: 'thin', color: { argb: 'FFFFC000' } }, right: { style: 'thin', color: { argb: 'FFFFC000' } } } } });
  m.projects.forEach((_, i) => {
    const k = i + 1;
    const [dark, mid, light] = PALETTE[i % PALETTE.length];
    tpRules.push({ type: 'expression', priority: prio++, formulae: [`AND(${TLL}$5>=$F6,${TLL}$5<=$G6,$M6=${k},ISERROR(FIND(".",$B6)))`], style: { fill: solid('FF' + dark) } });
    tpRules.push({ type: 'expression', priority: prio++, formulae: [`AND(${TLL}$5>=$F6,${TLL}$5<=$F6+ROUND(($G6-$F6+1)*$K6,0)-1,$M6=${k})`], style: { fill: solid('FF' + mid) } });
    tpRules.push({ type: 'expression', priority: prio++, formulae: [`AND(${TLL}$5>=$F6,${TLL}$5<=$G6,$M6=${k})`], style: { fill: solid('FF' + light) } });
  });
  tpRules.push({ type: 'expression', priority: prio++, formulae: [`OR(${weekendExpr(`${TLL}$5`)},COUNTIF(Hari_Libur,${TLL}$5)>0)`], style: { fill: solid('FFEDEDED') } });
  tp.addConditionalFormatting({ ref: ganttRef, rules: tpRules });
  tp.addConditionalFormatting({ ref: `${TLL}4:${TLE}5`, rules: [
    { type: 'expression', priority: 1, formulae: [`${TLL}$5=TODAY()`], style: { fill: solid('FFFFC000'), font: { color: { argb: 'FF000000' } } } },
    { type: 'expression', priority: 2, formulae: [`COUNTIF(Hari_Libur,${TLL}$5)>0`], style: { fill: solid('FFC00000') } },
    { type: 'expression', priority: 3, formulae: [weekendExpr(`${TLL}$5`)], style: { fill: solid('FF7F7F7F') } },
  ] });
  tp.addConditionalFormatting({ ref: `${TLL}3:${TLE}3`, rules: [{ type: 'expression', priority: 1, formulae: [`MOD(MONTH(${TLL}$5),2)=0`], style: { fill: solid('FF2F5597') } }] });
  tp.addConditionalFormatting({ ref: `L6:L${lastTaskRow}`, rules: [
    { type: 'expression', priority: 1, formulae: ['$L6="Done"'], style: { fill: solid('FFC6E0B4') } },
    { type: 'expression', priority: 2, formulae: ['$L6="In Progress"'], style: { fill: solid('FFBDD7EE') } },
    { type: 'expression', priority: 3, formulae: ['$L6="Delayed"'], style: { fill: solid('FFF4B6B6') } },
    { type: 'expression', priority: 4, formulae: ['$L6="On Hold"'], style: { fill: solid('FFD9D9D9') } },
  ] });

  // ======================= Ringkasan (placeholder, filled after Resource Map rows are known) =======================
  const rs = wb.addWorksheet('Ringkasan', { views: [{ showGridLines: false }] });

  // ======================= Resource Map =======================
  const rm = wb.addWorksheet('Resource Map', { views: [{ state: 'frozen', xSplit: 2, ySplit: 6, showGridLines: false, zoomScale: 90 }] });
  const G0 = 7; // column G
  const gL = colLetter(G0);
  const gE = colLetter(G0 + days.length - 1);
  [26, 26, 10, 10, 9, 4].forEach((w, i) => { rm.getColumn(i + 1).width = w; });
  for (let c = G0; c < G0 + days.length; c++) rm.getColumn(c).width = 3.3;
  setCell(rm, 'A1', 'Resource Map — Siapa Mengerjakan Apa, di Hari Apa (jam per hari)', { font: { size: 14, bold: true, color: NAVY } });
  setCell(rm, 'A2', 'Otomatis dari Task Plan — tidak perlu diisi. Baris TOTAL JAM: hijau = pas kapasitas, kuning = di bawah kapasitas, merah = overload.', { font: { size: 9 } });
  headerRow(rm, 5, 6, ['Resource', 'Proyek', 'Kapasitas /hari', 'Total Jam', 'Utilisasi', 'Idx']);
  rm.getRow(5).height = 28;
  const TP = "'Task Plan'";
  const tpRange = (c) => `${TP}!$${c}$6:$${c}$${lastTaskRow}`;
  days.forEach((d, i) => {
    const col = colLetter(G0 + i);
    setCell(rm, `${col}5`, F(i === 0 ? 'Master!$C$4' : `${colLetter(G0 + i - 1)}5+1`, toDate(d)), { numFmt: 'd', font: { bold: true, size: 8, color: 'FFFFFFFF' }, fill: NAVY, align: 'center' });
    setCell(rm, `${col}4`, F(`CHOOSE(WEEKDAY(${col}5,2),"S","S","R","K","J","S","M")`, DAY_LETTER_ID[wd2(d) - 1]), { font: { bold: true, size: 8, color: 'FFFFFFFF' }, fill: NAVY, align: 'center' });
    setCell(rm, `${col}6`, F(`IF(AND(MID("${mask}",WEEKDAY(${col}5,2),1)="0",COUNTIF(Hari_Libur,${col}5)=0),1,0)`, isWorking(d) ? 1 : 0), { font: { size: 8, color: 'FF7F7F7F' }, align: 'center' });
  });
  mStart = 0;
  for (let i = 1; i <= days.length; i++) {
    if (i === days.length || days[i].slice(0, 7) !== days[mStart].slice(0, 7)) {
      const a = colLetter(G0 + mStart);
      const b = colLetter(G0 + i - 1);
      if (i - 1 > mStart) rm.mergeCells(`${a}3:${b}3`);
      const d = toDate(days[mStart]);
      setCell(rm, `${a}3`, F(`CHOOSE(MONTH(${a}5),"Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember")&" "&YEAR(${a}5)`, `${MONTHS_ID[d.getUTCMonth()]} ${d.getUTCFullYear()}`),
        { font: { bold: true, size: 9, color: 'FFFFFFFF' }, fill: NAVY, align: 'center' });
      mStart = i;
    }
  }
  setCell(rm, 'A6', 'Hari kerja? (1 = ya, 0 = akhir pekan/libur)', { font: { size: 8, color: 'FF7F7F7F' } });

  const loadOf = (pic, code, d) => taskRows.reduce((s, t) => (t.pic === pic && (!code || t.code === code) && t.start <= d && t.finish >= d ? s + t.jam : s), 0);
  let rr = 7;
  const resStats = [];
  m.resources.forEach((res, ri) => {
    const totalRow = rr;
    const tStyle = { fill: TOTAL_FILL, font: { bold: true, size: 9 } };
    setCell(rm, `A${totalRow}`, F(`Master!$B$${R0 + ri}`, res.name), tStyle);
    setCell(rm, `B${totalRow}`, 'TOTAL JAM', tStyle);
    setCell(rm, `C${totalRow}`, F(`Master!$D$${R0 + ri}`, res.cap), { ...tStyle, numFmt: '0.0', align: 'center' });
    let total = 0, peak = 0, overDays = 0;
    days.forEach((d, i) => {
      const col = colLetter(G0 + i);
      const v = isWorking(d) ? loadOf(res.name, null, d) : 0;
      total += v; peak = Math.max(peak, v); if (v > res.cap) overDays++;
      setCell(rm, `${col}${totalRow}`, F(`${col}$6*SUMIFS(${tpRange('I')},${tpRange('E')},$A${totalRow},${tpRange('F')},"<="&${col}$5,${tpRange('G')},">="&${col}$5)`, v),
        { numFmt: 'General;-General;;', align: 'center', font: { bold: true, size: 9 } });
    });
    setCell(rm, `D${totalRow}`, F(`SUM(${gL}${totalRow}:${gE}${totalRow})`, total), { ...tStyle, numFmt: '0.0;-0.0;;', align: 'center' });
    const util = res.cap ? total / (res.cap * periodWorkdays) : 0;
    setCell(rm, `E${totalRow}`, F(`IFERROR(D${totalRow}/(C${totalRow}*Master!$C$6),0)`, util), { ...tStyle, numFmt: '0%', align: 'center' });
    setCell(rm, `F${totalRow}`, null, tStyle);
    resStats.push({ totalRow, total, peak, overDays, util });
    m.projects.forEach((p, pi) => {
      const r = totalRow + 1 + pi;
      setCell(rm, `A${r}`, F(`$A$${totalRow}`, res.name), { font: { size: 9, color: 'FFBFBFBF' } });
      setCell(rm, `B${r}`, F(`Master!$B$${P0 + pi}`, p.code), { font: { size: 9 } });
      let sub = 0;
      days.forEach((d, i) => {
        const col = colLetter(G0 + i);
        const v = isWorking(d) ? loadOf(res.name, p.code, d) : 0;
        sub += v;
        setCell(rm, `${col}${r}`, F(`${col}$6*SUMIFS(${tpRange('I')},${tpRange('E')},$A$${totalRow},${tpRange('C')},$B${r},${tpRange('F')},"<="&${col}$5,${tpRange('G')},">="&${col}$5)`, v),
          { numFmt: 'General;-General;;', align: 'center', font: { size: 9 } });
      });
      setCell(rm, `D${r}`, F(`SUM(${gL}${r}:${gE}${r})`, sub), { numFmt: '0.0;-0.0;;', align: 'center', font: { size: 9 } });
      setCell(rm, `F${r}`, F(`MATCH(B${r},${projRange},0)`, pi + 1), { align: 'center', font: { size: 8, color: 'FF7F7F7F' } });
    });
    rr = totalRow + 1 + nP;
  });
  const rmLast = Math.max(rr - 1, 7);
  const rmRef = `${gL}7:${gE}${rmLast}`;
  const rmRules = [];
  prio = 1;
  rmRules.push({ type: 'expression', priority: prio++, formulae: [`AND($B7="TOTAL JAM",${gL}7>$C7)`], style: { fill: solid('FFFF7C80'), font: { color: { argb: 'FFFFFFFF' }, bold: true } } });
  rmRules.push({ type: 'expression', priority: prio++, formulae: [`AND($B7="TOTAL JAM",${gL}7>0,${gL}7=$C7)`], style: { fill: solid('FFA9D08E') } });
  rmRules.push({ type: 'expression', priority: prio++, formulae: [`AND($B7="TOTAL JAM",${gL}7>0)`], style: { fill: solid('FFFFF2CC') } });
  m.projects.forEach((_, i) => {
    const mid = PALETTE[i % PALETTE.length][1];
    rmRules.push({ type: 'expression', priority: prio++, formulae: [`AND(${gL}7>0,$F7=${i + 1})`], style: { fill: solid('FF' + mid), font: { color: { argb: DARK_TEXT_ON.has(i % PALETTE.length) ? 'FF000000' : 'FFFFFFFF' } } } });
  });
  rmRules.push({ type: 'expression', priority: prio++, formulae: [`OR(${weekendExpr(`${gL}$5`)},COUNTIF(Hari_Libur,${gL}$5)>0)`], style: { fill: solid('FFEDEDED') } });
  rm.addConditionalFormatting({ ref: rmRef, rules: rmRules });
  rm.addConditionalFormatting({ ref: `${gL}4:${gE}5`, rules: [
    { type: 'expression', priority: 1, formulae: [`${gL}$5=TODAY()`], style: { fill: solid('FFFFC000'), font: { color: { argb: 'FF000000' } } } },
    { type: 'expression', priority: 2, formulae: [`COUNTIF(Hari_Libur,${gL}$5)>0`], style: { fill: solid('FFC00000') } },
    { type: 'expression', priority: 3, formulae: [weekendExpr(`${gL}$5`)], style: { fill: solid('FF7F7F7F') } },
  ] });
  rm.addConditionalFormatting({ ref: `${gL}3:${gE}3`, rules: [{ type: 'expression', priority: 1, formulae: [`MOD(MONTH(${gL}$5),2)=0`], style: { fill: solid('FF2F5597') } }] });
  rm.addConditionalFormatting({ ref: `E7:E${rmLast}`, rules: [{ type: 'expression', priority: 1, formulae: ['AND($B7="TOTAL JAM",E7>1)'], style: { fill: solid('FFFF7C80'), font: { color: { argb: 'FFFFFFFF' } } } }] });

  // ======================= Ringkasan =======================
  [24, 24, 14, 16, 12, 11, 12, 14, 24, 18].forEach((w, i) => { rs.getColumn(i + 1).width = w; });
  setCell(rs, 'A1', 'Ringkasan Beban Kerja & Proyek', { font: { size: 14, bold: true, color: NAVY } });
  setCell(rs, 'A2', `Semua angka otomatis dari Task Plan & Resource Map. Mata uang: ${m.currency}.`, { font: { size: 9 } });
  setCell(rs, 'A4', 'BEBAN PER RESOURCE', { font: { bold: true, color: NAVY } });
  headerRow(rs, 5, 10, ['Resource', 'Peran', 'Kapasitas/hari', 'Kapasitas Periode (jam)', 'Jam Terplot', 'Utilisasi', 'Hari Overload', 'Jam Puncak/hari', 'Kondisi', `Biaya (${m.currency})`]);
  rs.getRow(5).height = 30;
  const RMS = "'Resource Map'";
  m.resources.forEach((res, i) => {
    const r = 6 + i;
    const s = resStats[i];
    const tr = s.totalRow;
    setCell(rs, `A${r}`, F(`Master!$B$${R0 + i}`, res.name), { border: true });
    setCell(rs, `B${r}`, F(`Master!$C$${R0 + i}`, res.role), { border: true });
    setCell(rs, `C${r}`, F(`Master!$D$${R0 + i}`, res.cap), { border: true, numFmt: '0.0', align: 'center' });
    setCell(rs, `D${r}`, F(`C${r}*Master!$C$6`, res.cap * periodWorkdays), { border: true, numFmt: '0', align: 'center' });
    setCell(rs, `E${r}`, F(`${RMS}!$D$${tr}`, s.total), { border: true, numFmt: '0.0', align: 'center' });
    setCell(rs, `F${r}`, F(`IFERROR(E${r}/D${r},0)`, s.util), { border: true, numFmt: '0%', align: 'center' });
    setCell(rs, `G${r}`, F(`SUMPRODUCT((${RMS}!$${gL}$${tr}:$${gE}$${tr}>C${r})*1)`, s.overDays), { border: true, align: 'center' });
    setCell(rs, `H${r}`, F(`MAX(${RMS}!$${gL}$${tr}:$${gE}$${tr})`, s.peak), { border: true, numFmt: '0.0', align: 'center' });
    const cond = s.overDays > 0 ? 'OVERLOAD' : s.util < 0.5 ? 'Banyak kapasitas kosong' : 'OK';
    setCell(rs, `I${r}`, F(`IF(G${r}>0,"OVERLOAD",IF(F${r}<0.5,"Banyak kapasitas kosong","OK"))`, cond), { border: true, align: 'center' });
    setCell(rs, `J${r}`, F(`E${r}*Master!$E$${R0 + i}`, s.total * res.rate), { border: true, numFmt: moneyFmt });
  });
  const rsResLast = 5 + Math.max(nR, 1);
  rs.addConditionalFormatting({ ref: `I6:I${rsResLast}`, rules: [
    { type: 'expression', priority: 1, formulae: ['$I6="OVERLOAD"'], style: { fill: solid('FFFF7C80'), font: { color: { argb: 'FFFFFFFF' }, bold: true } } },
    { type: 'expression', priority: 2, formulae: ['$I6="OK"'], style: { fill: solid('FFC6E0B4') } },
    { type: 'expression', priority: 3, formulae: ['$I6="Banyak kapasitas kosong"'], style: { fill: solid('FFFFF2CC') } },
  ] });

  const ps = rsResLast + 3;
  setCell(rs, `A${ps}`, 'STATUS PER PROYEK', { font: { bold: true, color: NAVY } });
  headerRow(rs, ps + 1, 10, ['Kode', 'Nama Proyek', 'PM', 'Mulai', 'Selesai', 'Total Jam', '% Selesai', 'Status', 'Jumlah Aktivitas', `Biaya Rencana (${m.currency})`]);
  rs.getRow(ps + 1).height = 30;
  const rate = new Map(m.resources.map((r) => [r.name, r.rate]));
  let grandCost = 0;
  m.projects.forEach((p, i) => {
    const r = ps + 2 + i;
    const b = blocks[i];
    const sr = b.summaryRow;
    let total = 0, wk = 0, cost = 0, count = 0;
    p.rows.forEach((t) => {
      if (!t.pic) return;
      count++;
      const h = t.jam ? networkdays(t.start, t.finish) * t.jam : 0;
      total += h; wk += h * t.pct; cost += h * (rate.get(t.pic) || 0);
    });
    const k = total ? wk / total : 0;
    grandCost += cost;
    setCell(rs, `A${r}`, F(`Master!$B$${P0 + i}`, p.code), { border: true });
    setCell(rs, `B${r}`, F(`Master!$C$${P0 + i}`, p.name), { border: true });
    setCell(rs, `C${r}`, F(`Master!$D$${P0 + i}`, p.pm), { border: true });
    setCell(rs, `D${r}`, F(`${TP}!F${sr}`, p.summary.start ? toDate(p.summary.start) : ''), { border: true, numFmt: 'dd-mmm-yy', align: 'center' });
    setCell(rs, `E${r}`, F(`${TP}!G${sr}`, p.summary.finish ? toDate(p.summary.finish) : ''), { border: true, numFmt: 'dd-mmm-yy', align: 'center' });
    setCell(rs, `F${r}`, F(`${TP}!J${sr}`, total), { border: true, numFmt: '0.0', align: 'center' });
    setCell(rs, `G${r}`, F(`${TP}!K${sr}`, k), { border: true, numFmt: '0%', align: 'center' });
    setCell(rs, `H${r}`, F(`${TP}!L${sr}`, k >= 1 ? 'Done' : k <= 0 ? 'Not Started' : 'In Progress'), { border: true, align: 'center' });
    setCell(rs, `I${r}`, F(`COUNTIFS(${tpRange('C')},A${r},${tpRange('E')},"<>")`, count), { border: true, align: 'center' });
    setCell(rs, `J${r}`, F(`SUMPRODUCT((${tpRange('C')}=A${r})*${tpRange('J')}*SUMIF(Master!$B$${R0}:$B$${RL},${tpRange('E')},Master!$E$${R0}:$E$${RL}))`, cost), { border: true, numFmt: moneyFmt });
  });
  const pe = ps + 2 + nP;
  setCell(rs, `I${pe}`, 'Total', { font: { bold: true }, align: 'right' });
  setCell(rs, `J${pe}`, F(`SUM(J${ps + 2}:J${pe - 1})`, grandCost), { font: { bold: true }, numFmt: moneyFmt });

  // sheet order like the template: Petunjuk, Master, Hari Libur, Task Plan, Ringkasan, Resource Map
  return wb.xlsx.writeBuffer();
}

module.exports = { buildWorkbook };
