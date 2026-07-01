import { describe, it, expect } from 'vitest';
import { applyUserRules, type UserRule } from './userRules';

const rows = () => [
  { desc: 'MATEXIL LTW SPECIAL', category: '' },
  { desc: 'MATEXIL LTW SPECIAL', category: '' },
  { desc: 'JAKAZOL RED', category: 'Chemicals & Dyes' }, // already categorized — untouched
  { desc: 'MYSTERY WIDGET', category: 'Other / Review' },
];

describe('applyUserRules', () => {
  it('fills empty categories where a rule key matches the description', () => {
    const userRules: UserRule[] = [{ key: 'matexil', category: 'Chemicals & Dyes', level: 'l1' }];
    const { rows: out, applied } = applyUserRules(rows(), { descKey: 'desc', catCol: 'category', level: 'l1' }, userRules);
    expect(applied).toBe(2); // both MATEXIL rows
    expect(out[0].category).toBe('Chemicals & Dyes');
    expect(out[1].category).toBe('Chemicals & Dyes');
    expect(out[2].category).toBe('Chemicals & Dyes'); // pre-existing untouched
    expect(out[3].category).toBe('Other / Review');   // no rule matched → unchanged
  });

  it('treats "Other / Review" and "Uncategorized" as empty', () => {
    const userRules: UserRule[] = [{ key: 'mystery widget', category: 'Machinery & Spares', level: 'l1' }];
    const { out, applied } = { out: applyUserRules(rows(), { descKey: 'desc', catCol: 'category', level: 'l1' }, userRules).rows, applied: 1 };
    expect(out[3].category).toBe('Machinery & Spares');
    expect(applied).toBe(1);
  });

  it('is a no-op when no rules exist for the level', () => {
    const userRules: UserRule[] = [{ key: 'matexil', category: 'Chemicals & Dyes', level: 'l2' }];
    const { applied } = applyUserRules(rows(), { descKey: 'desc', catCol: 'category', level: 'l1' }, userRules);
    expect(applied).toBe(0);
  });
});
