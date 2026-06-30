import { describe, it, expect } from 'vitest';
import { detectMappings } from './columnDetection';

// The real Aarti "PURCHASE 2025-26.xls" header row.
const AARTI_HEADERS = [
  'SNO.', 'MRN NO.', 'MRN DATE', 'BILL NO.', 'BILL DATE', 'PO NO.', 'PO DATE',
  'PARTY NAME', 'STATE CODE /NAME', 'GSTIN NO.', 'GATE ENTRY NO.', 'ITEM CODE',
  'ITEM DESC.', 'HSN/SAC CODE', 'MRN TYPE', 'QTY RCVD.', 'UOM', 'LOT',
  'GROSS RATE', 'DISCOUNT', 'NET RATE', 'BASIC AMOUNT', 'FREIGHT',
  'PACKING FORWARDING', 'TAX %', 'TYPE', 'TAX TYPE', 'SGST', 'CGST', 'IGST',
  'CESS', 'TCS%', 'TCS', 'OTHER', 'GROSS ', 'DEPARTMENT', 'VOU. NO.', 'VOU.DATE',
];

describe('detectMappings on real Aarti headers', () => {
  const m = detectMappings(AARTI_HEADERS);

  it('maps supplier to PARTY NAME, not STATE CODE /NAME', () => {
    expect(m['supplier']).toBe('PARTY NAME');
  });

  it('maps location to the STATE column (not supplier)', () => {
    expect(m['location']).toBe('STATE CODE /NAME');
  });

  it('maps the receipt date, not bill/po/voucher date', () => {
    expect(m['date']).toBe('MRN DATE');
  });

  it('detects amount, hsn, description, quantity, unit_price, po', () => {
    expect(m['amount']).toBe('BASIC AMOUNT');
    expect(m['hsn_code']).toBe('HSN/SAC CODE');
    expect(m['item_description']).toBe('ITEM DESC.');
    expect(m['quantity']).toBe('QTY RCVD.');
    expect(m['unit_price']).toBe('NET RATE'); // prefers NET over GROSS RATE
    expect(m['po_number']).toBe('PO NO.'); // not PO DATE
  });

  it('puts DEPARTMENT in business_unit, NOT category_l1', () => {
    expect(m['business_unit']).toBe('DEPARTMENT');
    expect(m['category_l1']).toBeUndefined(); // no real category column exists
  });

  it('never assigns the same header to two fields', () => {
    const used = Object.values(m);
    expect(new Set(used).size).toBe(used.length);
  });
});
