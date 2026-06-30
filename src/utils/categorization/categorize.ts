import { OTHER, TAXONOMY } from './taxonomy';
import { resolveByHsn } from './hsnMap';
import { resolveByKeyword } from './keywordRules';
import type { CategoryResult, ClassifyFn } from './types';

export interface CategorizeKeys {
  hsnKey: string;
  descKey: string;
}

export async function categorize(
  rows: Array<Record<string, any>>,
  keys: CategorizeKeys,
  classify?: ClassifyFn,
): Promise<CategoryResult[]> {
  // Passes 1 & 2 — deterministic, offline.
  const results: CategoryResult[] = rows.map((row) => {
    const hsn = resolveByHsn(row[keys.hsnKey]);
    if (hsn.ok) return { category: hsn.category, source: 'hsn', confidence: 'high' };

    const kw = resolveByKeyword(row[keys.descKey]);
    if (kw.ok) return { category: kw.category, source: 'keyword', confidence: 'high' };

    return { category: OTHER, source: 'unmapped', confidence: 'low' };
  });

  // Pass 3 — optional LLM on unique unknown descriptions.
  if (classify) {
    const unknownIdx = results
      .map((r, i) => (r.source === 'unmapped' ? i : -1))
      .filter((i) => i >= 0);

    const uniqueDescs = [
      ...new Set(
        unknownIdx
          .map((i) => String(rows[i][keys.descKey] ?? '').trim())
          .filter((d) => d.length > 0),
      ),
    ];

    if (uniqueDescs.length > 0) {
      let labels: string[] = [];
      try {
        labels = await classify(uniqueDescs, TAXONOMY);
      } catch {
        labels = [];
      }

      const descToCat = new Map<string, string>();
      uniqueDescs.forEach((d, i) => {
        const lbl = labels[i];
        if (lbl && (TAXONOMY as readonly string[]).includes(lbl)) descToCat.set(d, lbl);
      });

      for (const i of unknownIdx) {
        const d = String(rows[i][keys.descKey] ?? '').trim();
        const lbl = descToCat.get(d);
        if (lbl) results[i] = { category: lbl, source: 'ai', confidence: 'medium' };
      }
    }
  }

  return results;
}
