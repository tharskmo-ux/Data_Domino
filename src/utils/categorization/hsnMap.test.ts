import { describe, it, expect } from 'vitest';
import { resolveByHsn } from './hsnMap';

describe('resolveByHsn', () => {
  it('maps an 8-digit cotton code via chapter 52', () => {
    expect(resolveByHsn('52010010')).toEqual({ category: 'Fibres & Yarn', ok: true });
  });

  it('applies a 4-digit heading override before chapter', () => {
    expect(resolveByHsn('34031900')).toEqual({ category: 'Lubricants & Oils', ok: true });
  });

  it('strips non-digits (spaces, dots)', () => {
    expect(resolveByHsn('8536.90')).toEqual({ category: 'Electrical & Electronics', ok: true });
  });

  it('restores a dropped leading zero (Excel numeric storage) for chapters 01-09', () => {
    // Real Aarti dairy codes that lost their leading zero (04xxxxxx -> 4xxxxxx).
    expect(resolveByHsn('4012000')).toEqual({ category: 'Food & Agri Products', ok: true }); // milk 0401
    expect(resolveByHsn('4039010')).toEqual({ category: 'Food & Agri Products', ok: true }); // lassi 0403
    expect(resolveByHsn('4061000')).toEqual({ category: 'Food & Agri Products', ok: true }); // paneer 0406
    expect(resolveByHsn('401')).toEqual({ category: 'Food & Agri Products', ok: true }); // milk, 3-digit
  });

  it('does not disturb even-length codes (chapter read unchanged)', () => {
    expect(resolveByHsn('40169990')).toEqual({ category: 'Plastics & Rubber', ok: true }); // real rubber, chapter 40
  });

  it('returns ok:false for blank or too-short codes', () => {
    expect(resolveByHsn('')).toEqual({ category: '', ok: false });
    expect(resolveByHsn('7')).toEqual({ category: '', ok: false });
    expect(resolveByHsn(undefined as unknown as string)).toEqual({ category: '', ok: false });
  });
});
