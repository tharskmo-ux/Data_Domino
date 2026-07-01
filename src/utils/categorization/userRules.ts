/**
 * User-taught category rules — the UI equivalent of editing keywordRules.ts, but
 * created by the end user and persisted client-side (localStorage, per user).
 *
 * When a user manually assigns a category to an uncategorized item and ticks
 * "remember", we store a rule (description-substring → category, for a level).
 * On future Auto-categorize runs these rules fill matching empty categories, so
 * the same item never has to be classified by hand again.
 *
 * localStorage keeps it fully client-side (no backend, nothing leaves the browser).
 */
export interface UserRule {
  key: string;   // normalised description substring to match (lowercase)
  category: string;
  level: 'l1' | 'l2' | 'l3';
}

const storeKey = (scope: string) => `dd_cat_rules_${scope || 'default'}`;

export function loadUserRules(scope: string): UserRule[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const arr = JSON.parse(localStorage.getItem(storeKey(scope)) || '[]');
    return Array.isArray(arr) ? arr.filter((r) => r && r.key && r.category && r.level) : [];
  } catch {
    return [];
  }
}

/** Add/replace a rule (dedup by level+key) and persist. Returns the updated list. */
export function saveUserRule(scope: string, rule: UserRule): UserRule[] {
  const key = String(rule.key || '').trim().toLowerCase();
  if (!key || !rule.category) return loadUserRules(scope);
  const rules = loadUserRules(scope).filter((r) => !(r.level === rule.level && r.key === key));
  rules.push({ key, category: rule.category, level: rule.level });
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(storeKey(scope), JSON.stringify(rules));
  } catch {
    /* storage full / unavailable — rule still applies this session via the returned list */
  }
  return rules;
}

export function removeUserRule(scope: string, level: UserRule['level'], key: string): UserRule[] {
  const norm = String(key || '').trim().toLowerCase();
  const rules = loadUserRules(scope).filter((r) => !(r.level === level && r.key === norm));
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(storeKey(scope), JSON.stringify(rules));
  } catch { /* ignore */ }
  return rules;
}

/**
 * Apply user rules to fill EMPTY categories at one level. Pure — returns a new rows
 * array and the number of rows filled. A row is "empty" if its category is blank,
 * "Uncategorized", or "Other / Review".
 */
export function applyUserRules(
  rows: Array<Record<string, any>>,
  opts: { descKey: string; catCol: string; level: 'l1' | 'l2' | 'l3' },
  rules: UserRule[],
): { rows: Array<Record<string, any>>; applied: number } {
  const lvl = rules.filter((r) => r.level === opts.level);
  if (!lvl.length) return { rows, applied: 0 };
  let applied = 0;
  const out = rows.map((row) => {
    const cur = row[opts.catCol];
    if (cur && String(cur).trim() && cur !== 'Uncategorized' && cur !== 'Other / Review') return row;
    const desc = String(row[opts.descKey] ?? '').toLowerCase();
    for (const r of lvl) {
      if (r.key && desc.includes(r.key)) {
        applied++;
        return { ...row, [opts.catCol]: r.category };
      }
    }
    return row;
  });
  return { rows: out, applied };
}
