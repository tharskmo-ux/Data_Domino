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

  it('returns ok:false for blank or too-short codes', () => {
    expect(resolveByHsn('')).toEqual({ category: '', ok: false });
    expect(resolveByHsn('7')).toEqual({ category: '', ok: false });
    expect(resolveByHsn(undefined as unknown as string)).toEqual({ category: '', ok: false });
  });
});
