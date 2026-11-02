import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtMoney, setFormatLocale, currencyExcelFormat } from '../src/lib/format.js';
import { weekendMask, excelStatus } from '../src/lib/excelModel.js';

test('IDR formatting uses Rupiah conventions', () => {
  setFormatLocale('id-ID');
  assert.match(fmtMoney(1250000, 'IDR').replace(/\s/g, ' '), /^Rp 1\.250\.000$/);
  assert.match(fmtMoney(3.9e9, 'IDR', { compact: true }).replace(/\s/g, ' '), /^Rp 3,9 M$/);
  setFormatLocale('en-US');
  assert.match(fmtMoney(1250000, 'IDR').replace(/\s/g, ' '), /^Rp 1\.250\.000$/); // IDR keeps Indonesian grouping
  assert.equal(fmtMoney(1250, 'USD'), '$1,250');
  assert.equal(currencyExcelFormat('IDR'), '"Rp "#,##0;-"Rp "#,##0;"Rp "0');
});

test('Excel export helpers', () => {
  assert.equal(weekendMask({ workingDays: '[1,2,3,4,5]' }), '0000011');
  assert.equal(weekendMask({ workingDays: '[0,1,2,3,4]' }), '0000110');
  assert.equal(excelStatus({ status: 'in_progress' }, '2026-10-01', '2026-11-02'), 'Delayed');
  assert.equal(excelStatus({ status: 'blocked' }, '2026-12-01', '2026-11-02'), 'On Hold');
  assert.equal(excelStatus({ status: 'done' }, '2026-10-01', '2026-11-02'), 'Done');
});
