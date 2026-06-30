import { describe, it, expect } from 'vitest';
import { profileColumn } from './columnContent';
import { detectByContent, detectMappings } from './columnDetection';

describe('profileColumn', () => {
  it('detects a date column', () => {
    const p = profileColumn(['2025-04-01', '2025-04-03', '2025-04-05']);
    expect(p.dateFraction).toBe(1);
  });

  it('detects HSN-like 4-8 digit codes', () => {
    const p = profileColumn(['52051110', '73181500', '85015210']);
    expect(p.digitCodeFraction).toBe(1);
  });

  it('measures numeric sum and free-text length', () => {
    expect(profileColumn(['250000', '6,000', '75000']).sum).toBe(331000);
    expect(profileColumn(['Cotton Yarn 30s super combed']).avgLen).toBeGreaterThan(15);
  });
});

describe('detectByContent with UNRECOGNIZABLE header names', () => {
  // Columns named c1..c5 — name patterns would map NOTHING. Content must save us.
  const rows = [
    { c1: '2025-04-01', c2: 'Alpha Textiles Pvt Ltd', c3: 'Cotton Yarn 30s combed', c4: '52051110', c5: 250000 },
    { c1: '2025-04-03', c2: 'Beta Hardware Co', c3: 'Hex Bolt M12 stainless', c4: '73181500', c5: 6000 },
    { c1: '2025-04-05', c2: 'Alpha Textiles Pvt Ltd', c3: 'Polyester Fibre staple', c4: '54021900', c5: 75000 },
    { c1: '2025-04-08', c2: 'Gamma Electric Ltd', c3: 'Three Phase Motor 5HP', c4: '85015210', c5: 110000 },
  ];

  it('maps fields from values alone', () => {
    const m = detectByContent(['c1', 'c2', 'c3', 'c4', 'c5'], rows);
    expect(m['date']).toBe('c1');
    expect(m['hsn_code']).toBe('c4');
    expect(m['amount']).toBe('c5');
    expect(m['item_description']).toBe('c3');
    expect(m['supplier']).toBe('c2'); // repeats (Alpha twice) → lower distinct ratio
  });

  it('detectMappings hybrid fills these even with no name matches', () => {
    const m = detectMappings(['c1', 'c2', 'c3', 'c4', 'c5'], rows);
    expect(m['date']).toBe('c1');
    expect(m['hsn_code']).toBe('c4');
    expect(m['amount']).toBe('c5');
    expect(m['item_description']).toBe('c3');
  });

  it('name detection still wins when names are clear (no double-claim)', () => {
    const m = detectMappings(
      ['PARTY NAME', 'BASIC AMOUNT'],
      [{ 'PARTY NAME': 'Alpha', 'BASIC AMOUNT': 100 }],
    );
    expect(m['supplier']).toBe('PARTY NAME');
    expect(m['amount']).toBe('BASIC AMOUNT');
  });
});
