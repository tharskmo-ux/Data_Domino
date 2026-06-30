# Auto-Categorization Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically assign a standard `Category_L1` to every spend line via a deterministic HSN→keyword cascade with an optional pluggable LLM pass, so reports stop collapsing to "Uncategorized."

**Architecture:** A pure, framework-free `src/utils/categorization/` module (taxonomy config + HSN lookup + keyword rules + cascade), an optional local-first LLM adapter behind one interface, and an "Auto-categorize" button wired into the existing `CategoryMapper.tsx`. Passes 1–2 are deterministic/offline; pass 3 (LLM) is optional and never blocks.

**Tech Stack:** TypeScript, React 19, Vite 7, Vitest (new), ExcelJS/xlsx (existing), Firebase Functions (existing, only for the optional Gemini adapter).

## Global Constraints

- Public/runtime behavior must not break the existing ETL: `CategoryMapper` keeps its manual-assignment UI; auto-categorize is additive.
- Taxonomy is the authoritative list in `taxonomy.ts` (23 buckets incl. `Other / Review`); never hardcode category strings elsewhere — import them.
- The cascade NEVER hard-depends on an LLM. `classify` is optional; on any failure, affected rows become `Other / Review` (`source: 'unmapped'`).
- Re-running auto-categorize must never overwrite rows with `source: 'manual'`.
- Reconciliation invariant: summed spend across assigned categories equals the dataset grand total (no row dropped).
- LLM provider selected by env `VITE_CATEGORIZER_LLM = ollama | gemini | none` (default `none`); local default URL `http://localhost:11434`.

---

### Task 1: Add Vitest test runner

**Files:**
- Modify: `package.json` (scripts + devDependencies)
- Create: `vitest.config.ts`
- Create: `src/utils/categorization/__smoke__.test.ts` (temporary, deleted in Step 6)

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test` command running Vitest in node environment.

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest@^2.1.0`
Expected: added to devDependencies, no errors.

- [ ] **Step 2: Add test script to package.json**

In `package.json` `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Write a smoke test**

Create `src/utils/categorization/__smoke__.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('vitest', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: PASS, 1 test passed.

- [ ] **Step 6: Delete the smoke test and commit**

```bash
rm src/utils/categorization/__smoke__.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add Vitest test runner"
```

---

### Task 2: Types

**Files:**
- Create: `src/utils/categorization/types.ts`

**Interfaces:**
- Produces:
  - `type CategorySource = 'hsn' | 'keyword' | 'ai' | 'manual' | 'unmapped'`
  - `type Confidence = 'high' | 'medium' | 'low'`
  - `interface CategoryResult { category: string; source: CategorySource; confidence: Confidence }`
  - `type ClassifyFn = (descriptions: string[], taxonomy: readonly string[]) => Promise<string[]>`

- [ ] **Step 1: Create types.ts**

```ts
export type CategorySource = 'hsn' | 'keyword' | 'ai' | 'manual' | 'unmapped';
export type Confidence = 'high' | 'medium' | 'low';

export interface CategoryResult {
  category: string;
  source: CategorySource;
  confidence: Confidence;
}

/** Pluggable LLM classifier: returns one taxonomy label per input description, same order. */
export type ClassifyFn = (
  descriptions: string[],
  taxonomy: readonly string[],
) => Promise<string[]>;
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/categorization/types.ts
git commit -m "feat(categorization): result + classifier types"
```

---

### Task 3: Taxonomy + HSN chapter map

**Files:**
- Create: `src/utils/categorization/taxonomy.ts`
- Test: `src/utils/categorization/taxonomy.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `const OTHER = 'Other / Review'`
  - `const TAXONOMY: readonly string[]` (23 entries incl. OTHER)
  - `const HSN_HEADING_OVERRIDES: Record<string,string>`
  - `function chapterToCategory(chapter: number): string | undefined`

- [ ] **Step 1: Write the failing test**

`src/utils/categorization/taxonomy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TAXONOMY, OTHER, chapterToCategory } from './taxonomy';

describe('taxonomy', () => {
  it('includes the catch-all bucket', () => {
    expect(TAXONOMY).toContain(OTHER);
  });

  it('maps every HSN chapter 1..99 to a defined taxonomy bucket', () => {
    for (let ch = 1; ch <= 99; ch++) {
      const cat = chapterToCategory(ch);
      expect(cat, `chapter ${ch}`).toBeDefined();
      expect(TAXONOMY, `chapter ${ch} -> ${cat}`).toContain(cat);
    }
  });

  it('maps known chapters correctly', () => {
    expect(chapterToCategory(52)).toBe('Fibres & Yarn');   // cotton
    expect(chapterToCategory(84)).toBe('Machinery & Spares');
    expect(chapterToCategory(85)).toBe('Electrical & Electronics');
    expect(chapterToCategory(27)).toBe('Fuel & Energy');
    expect(chapterToCategory(99)).toBe('Freight & Services');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/categorization/taxonomy.test.ts`
Expected: FAIL — cannot find module './taxonomy'.

- [ ] **Step 3: Write taxonomy.ts**

```ts
export const OTHER = 'Other / Review';

export const TAXONOMY = [
  'Food & Agri Products',
  'Agri & Biomass Fuel',
  'Building Materials',
  'Metals & Minerals',
  'Fuel & Energy',
  'Lubricants & Oils',
  'Chemicals & Dyes',
  'Pharma & Medical',
  'Agri Inputs',
  'Plastics & Rubber',
  'Leather & Wood',
  'Paper & Packaging',
  'Fibres & Yarn',
  'Fabrics & Made-ups',
  'Safety & PPE / Apparel',
  'Precious Metals',
  'Metals & Hardware',
  'Machinery & Spares',
  'Electrical & Electronics',
  'Vehicles & Transport',
  'Office & Furniture',
  'Freight & Services',
  OTHER,
] as const;

// [chapterLow, chapterHigh, category]
const CHAPTER_RANGES: Array<[number, number, string]> = [
  [1, 5, 'Food & Agri Products'],
  [6, 14, 'Agri & Biomass Fuel'],
  [15, 24, 'Food & Agri Products'],
  [25, 25, 'Building Materials'],
  [26, 26, 'Metals & Minerals'],
  [27, 27, 'Fuel & Energy'],
  [28, 29, 'Chemicals & Dyes'],
  [30, 30, 'Pharma & Medical'],
  [31, 31, 'Agri Inputs'],
  [32, 38, 'Chemicals & Dyes'],
  [39, 40, 'Plastics & Rubber'],
  [41, 46, 'Leather & Wood'],
  [47, 49, 'Paper & Packaging'],
  [50, 55, 'Fibres & Yarn'],
  [56, 60, 'Fabrics & Made-ups'],
  [61, 62, 'Safety & PPE / Apparel'],
  [63, 63, 'Fabrics & Made-ups'],
  [64, 65, 'Safety & PPE / Apparel'],
  [66, 67, OTHER],
  [68, 70, 'Building Materials'],
  [71, 71, 'Precious Metals'],
  [72, 83, 'Metals & Hardware'],
  [84, 84, 'Machinery & Spares'],
  [85, 85, 'Electrical & Electronics'],
  [86, 89, 'Vehicles & Transport'],
  [90, 90, 'Electrical & Electronics'],
  [91, 93, OTHER],
  [94, 94, 'Office & Furniture'],
  [95, 98, OTHER],
  [99, 99, 'Freight & Services'],
];

/** 4-digit HSN heading overrides where the chapter default is too coarse. */
export const HSN_HEADING_OVERRIDES: Record<string, string> = {
  '3403': 'Lubricants & Oils', // lubricating preparations
  '3004': 'Pharma & Medical',  // medicaments
};

export function chapterToCategory(chapter: number): string | undefined {
  const hit = CHAPTER_RANGES.find(([lo, hi]) => chapter >= lo && chapter <= hi);
  return hit?.[2];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/categorization/taxonomy.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/categorization/taxonomy.ts src/utils/categorization/taxonomy.test.ts
git commit -m "feat(categorization): all-HSN taxonomy + chapter map"
```

---

### Task 4: HSN resolver

**Files:**
- Create: `src/utils/categorization/hsnMap.ts`
- Test: `src/utils/categorization/hsnMap.test.ts`

**Interfaces:**
- Consumes: `chapterToCategory`, `HSN_HEADING_OVERRIDES` from `./taxonomy`.
- Produces: `function resolveByHsn(code: string): { category: string; ok: boolean }`

- [ ] **Step 1: Write the failing test**

`src/utils/categorization/hsnMap.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/categorization/hsnMap.test.ts`
Expected: FAIL — cannot find module './hsnMap'.

- [ ] **Step 3: Write hsnMap.ts**

```ts
import { chapterToCategory, HSN_HEADING_OVERRIDES } from './taxonomy';

export function resolveByHsn(code: string): { category: string; ok: boolean } {
  const digits = String(code ?? '').replace(/\D/g, '');
  if (digits.length < 2) return { category: '', ok: false };

  const heading = digits.slice(0, 4);
  if (heading.length === 4 && HSN_HEADING_OVERRIDES[heading]) {
    return { category: HSN_HEADING_OVERRIDES[heading], ok: true };
  }

  const chapter = parseInt(digits.slice(0, 2), 10);
  const cat = chapterToCategory(chapter);
  return cat ? { category: cat, ok: true } : { category: '', ok: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/categorization/hsnMap.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/categorization/hsnMap.ts src/utils/categorization/hsnMap.test.ts
git commit -m "feat(categorization): HSN code resolver"
```

---

### Task 5: Keyword resolver

**Files:**
- Create: `src/utils/categorization/keywordRules.ts`
- Test: `src/utils/categorization/keywordRules.test.ts`

**Interfaces:**
- Consumes: nothing (category strings must match `TAXONOMY` values).
- Produces: `function resolveByKeyword(desc: string): { category: string; ok: boolean }`

- [ ] **Step 1: Write the failing test**

`src/utils/categorization/keywordRules.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveByKeyword } from './keywordRules';
import { TAXONOMY } from './taxonomy';

describe('resolveByKeyword', () => {
  it('matches hardware terms', () => {
    expect(resolveByKeyword('HEX BOLT M12')).toEqual({ category: 'Metals & Hardware', ok: true });
  });

  it('matches electrical terms case-insensitively', () => {
    expect(resolveByKeyword('3-phase motor 5hp')).toEqual({ category: 'Electrical & Electronics', ok: true });
  });

  it('returns ok:false when nothing matches', () => {
    expect(resolveByKeyword('xyzzy widget')).toEqual({ category: '', ok: false });
  });

  it('only ever returns categories that exist in the taxonomy', () => {
    const samples = ['bolt', 'yarn', 'grease', 'motor', 'carton', 'coal', 'glove', 'freight'];
    for (const s of samples) {
      const r = resolveByKeyword(s);
      if (r.ok) expect(TAXONOMY).toContain(r.category);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/categorization/keywordRules.test.ts`
Expected: FAIL — cannot find module './keywordRules'.

- [ ] **Step 3: Write keywordRules.ts**

```ts
export interface KeywordRule {
  pattern: RegExp;
  category: string;
}

// First match wins. Categories MUST be valid TAXONOMY values.
export const KEYWORD_RULES: KeywordRule[] = [
  { pattern: /\b(bolt|nut|screw|washer|fastener|rivet|bearing|m\.?s\.?\s*plate)\b/i, category: 'Metals & Hardware' },
  { pattern: /\b(yarn|fibre|fiber|cotton|polyester|viscose|roving|sliver)\b/i, category: 'Fibres & Yarn' },
  { pattern: /\b(grease|lubricant|lube|coolant|hydraulic\s*oil|gear\s*oil)\b/i, category: 'Lubricants & Oils' },
  { pattern: /\b(motor|cable|wire|switch|relay|sensor|transformer|plc|contactor|mcb)\b/i, category: 'Electrical & Electronics' },
  { pattern: /\b(carton|corrugat|packing|label|tape|stretch\s*film|poly\s*bag|hdpe\s*bag)\b/i, category: 'Paper & Packaging' },
  { pattern: /\b(dye|chemical|acid|caustic|bleach|solvent|enzyme|softener)\b/i, category: 'Chemicals & Dyes' },
  { pattern: /\b(coal|lignite|furnace\s*oil|diesel|lpg|briquette|pet\s*coke)\b/i, category: 'Fuel & Energy' },
  { pattern: /\b(husk|biomass|agro|wood\s*chip|saw\s*dust)\b/i, category: 'Agri & Biomass Fuel' },
  { pattern: /\b(glove|helmet|mask|goggle|safety\s*shoe|ppe|ear\s*plug)\b/i, category: 'Safety & PPE / Apparel' },
  { pattern: /\b(spare|spares|spindle|roller|gear|coupling|pulley|cam)\b/i, category: 'Machinery & Spares' },
  { pattern: /\b(freight|transport|cartage|labour|job\s*work|service|amc|consultanc)\b/i, category: 'Freight & Services' },
];

export function resolveByKeyword(desc: string): { category: string; ok: boolean } {
  const text = String(desc ?? '');
  for (const r of KEYWORD_RULES) {
    if (r.pattern.test(text)) return { category: r.category, ok: true };
  }
  return { category: '', ok: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/categorization/keywordRules.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/categorization/keywordRules.ts src/utils/categorization/keywordRules.test.ts
git commit -m "feat(categorization): item-description keyword resolver"
```

---

### Task 6: The cascade

**Files:**
- Create: `src/utils/categorization/categorize.ts`
- Test: `src/utils/categorization/categorize.test.ts`

**Interfaces:**
- Consumes: `resolveByHsn`, `resolveByKeyword`, `OTHER`, `TAXONOMY`, `CategoryResult`, `ClassifyFn`.
- Produces:
  - `interface CategorizeKeys { hsnKey: string; descKey: string }`
  - `function categorize(rows, keys, classify?): Promise<CategoryResult[]>` (results aligned by row index)

- [ ] **Step 1: Write the failing test**

`src/utils/categorization/categorize.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { categorize } from './categorize';

const keys = { hsnKey: 'HSN', descKey: 'DESC' };

describe('categorize cascade', () => {
  it('pass 1: clean HSN wins', async () => {
    const rows = [{ HSN: '52010010', DESC: 'whatever' }];
    const r = await categorize(rows, keys);
    expect(r[0]).toEqual({ category: 'Fibres & Yarn', source: 'hsn', confidence: 'high' });
  });

  it('pass 2: keyword used when HSN missing', async () => {
    const rows = [{ HSN: '', DESC: 'HEX BOLT M12' }];
    const r = await categorize(rows, keys);
    expect(r[0]).toEqual({ category: 'Metals & Hardware', source: 'keyword', confidence: 'high' });
  });

  it('unmapped when neither resolves and no classifier', async () => {
    const rows = [{ HSN: '', DESC: 'xyzzy widget' }];
    const r = await categorize(rows, keys);
    expect(r[0]).toEqual({ category: 'Other / Review', source: 'unmapped', confidence: 'low' });
  });

  it('pass 3: classifier fills only unknowns, deduped by description', async () => {
    const rows = [
      { HSN: '52010010', DESC: 'cotton' },     // hsn
      { HSN: '', DESC: 'mystery item' },        // -> ai
      { HSN: '', DESC: 'mystery item' },        // same desc, reuse ai
    ];
    const classify = vi.fn(async (descs: string[]) => descs.map(() => 'Chemicals & Dyes'));
    const r = await categorize(rows, keys, classify);
    expect(classify).toHaveBeenCalledTimes(1);
    expect(classify.mock.calls[0][0]).toEqual(['mystery item']); // unique only
    expect(r[1]).toEqual({ category: 'Chemicals & Dyes', source: 'ai', confidence: 'medium' });
    expect(r[2]).toEqual({ category: 'Chemicals & Dyes', source: 'ai', confidence: 'medium' });
  });

  it('classifier failure leaves rows as unmapped', async () => {
    const rows = [{ HSN: '', DESC: 'mystery' }];
    const classify = vi.fn(async () => { throw new Error('llm down'); });
    const r = await categorize(rows, keys, classify);
    expect(r[0].source).toBe('unmapped');
  });

  it('ignores classifier labels not in the taxonomy', async () => {
    const rows = [{ HSN: '', DESC: 'mystery' }];
    const classify = vi.fn(async () => ['Not A Real Bucket']);
    const r = await categorize(rows, keys, classify);
    expect(r[0].source).toBe('unmapped');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/categorization/categorize.test.ts`
Expected: FAIL — cannot find module './categorize'.

- [ ] **Step 3: Write categorize.ts**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/categorization/categorize.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/categorization/categorize.ts src/utils/categorization/categorize.test.ts
git commit -m "feat(categorization): HSN->keyword->AI cascade"
```

---

### Task 7: Local-first LLM adapter

**Files:**
- Create: `src/utils/categorization/llm/ollama.ts`
- Create: `src/utils/categorization/llm/index.ts`
- Test: `src/utils/categorization/llm/ollama.test.ts`

**Interfaces:**
- Consumes: `ClassifyFn` from `../types`.
- Produces:
  - `const ollamaClassify: ClassifyFn`
  - `function getClassifier(): ClassifyFn | undefined` (reads `import.meta.env.VITE_CATEGORIZER_LLM`)

- [ ] **Step 1: Write the failing test (mock fetch)**

`src/utils/categorization/llm/ollama.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ollamaClassify } from './ollama';

afterEach(() => vi.restoreAllMocks());

describe('ollamaClassify', () => {
  it('posts a prompt and parses a JSON array response', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ response: JSON.stringify(['Metals & Hardware', 'Fibres & Yarn']) }),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const out = await ollamaClassify(['bolt', 'yarn'], ['Metals & Hardware', 'Fibres & Yarn']);
    expect(out).toEqual(['Metals & Hardware', 'Fibres & Yarn']);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('throws on non-ok response so the cascade can fall back', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch);
    await expect(ollamaClassify(['x'], ['Other / Review'])).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/categorization/llm/ollama.test.ts`
Expected: FAIL — cannot find module './ollama'.

- [ ] **Step 3: Write ollama.ts**

```ts
import type { ClassifyFn } from '../types';

const OLLAMA_URL =
  (import.meta as any).env?.VITE_OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL =
  (import.meta as any).env?.VITE_OLLAMA_MODEL || 'llama3.1';

export const ollamaClassify: ClassifyFn = async (descriptions, taxonomy) => {
  const prompt =
    `You are a procurement spend categorizer. Assign each item to exactly ONE ` +
    `category from this list:\n${taxonomy.join('\n')}\n\n` +
    `Return ONLY a JSON array of category strings, one per item, in the same order.\n` +
    `Items:\n${descriptions.map((d, i) => `${i + 1}. ${d}`).join('\n')}`;

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, format: 'json' }),
  });
  if (!res.ok) throw new Error(`Ollama ${ (res as any).status }`);

  const data = await res.json();
  const parsed = JSON.parse(data.response);
  return Array.isArray(parsed) ? parsed : (parsed.categories ?? []);
};
```

- [ ] **Step 4: Write index.ts (provider selector)**

```ts
import type { ClassifyFn } from '../types';
import { ollamaClassify } from './ollama';

export function getClassifier(): ClassifyFn | undefined {
  const provider = (import.meta as any).env?.VITE_CATEGORIZER_LLM || 'none';
  switch (provider) {
    case 'ollama':
      return ollamaClassify;
    // 'gemini' and 'webllm' adapters can be added later behind this switch.
    default:
      return undefined;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/utils/categorization/llm/ollama.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/utils/categorization/llm/
git commit -m "feat(categorization): local-first Ollama LLM adapter + selector"
```

---

### Task 8: Validate on the real Aarti file

**Files:**
- Create: `scripts/validate-categorization.mjs`

**Interfaces:**
- Consumes: `resolveByHsn`, `resolveByKeyword` (imported from source via a tiny inline port — see note).
- Produces: console report of coverage by source + reconciliation check.

**Note:** This script runs in Node against the 10MB `.xls`. To avoid Vite/`import.meta`
issues, it imports only the pure deterministic resolvers (no LLM). Run with the
file path as an argument.

- [ ] **Step 1: Write the validation script**

```js
// Usage: node scripts/validate-categorization.mjs "C:/Users/Harshad/Downloads/PURCHASE 2025-26.xls"
import XLSX from 'xlsx';
import { resolveByHsn } from '../src/utils/categorization/hsnMap.ts';
import { resolveByKeyword } from '../src/utils/categorization/keywordRules.ts';

const file = process.argv[2];
if (!file) { console.error('Pass the .xls path'); process.exit(1); }

const wb = XLSX.readFile(file, { cellDates: true });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
let h = 0;
for (let i = 0; i < 20; i++) if (rows[i].filter((c) => String(c).trim() !== '').length >= 5) { h = i; break; }
const headers = rows[h].map((x) => String(x).trim());
const idx = (re) => headers.findIndex((x) => re.test(x));
const hsnCol = idx(/hsn/i), descCol = idx(/item\s*desc|description/i), amtCol = idx(/basic\s*amount/i);

const counts = { hsn: 0, keyword: 0, unmapped: 0 };
const spend = { hsn: 0, keyword: 0, unmapped: 0 };
let total = 0;
for (let r = h + 1; r < rows.length; r++) {
  const row = rows[r];
  if (!row || row.every((c) => String(c).trim() === '')) continue;
  const amt = parseFloat(String(row[amtCol]).replace(/[^0-9.-]+/g, '')) || 0;
  total += amt;
  const byHsn = resolveByHsn(String(row[hsnCol]));
  if (byHsn.ok) { counts.hsn++; spend.hsn += amt; continue; }
  const byKw = resolveByKeyword(String(row[descCol]));
  if (byKw.ok) { counts.keyword++; spend.keyword += amt; continue; }
  counts.unmapped++; spend.unmapped += amt;
}
const n = counts.hsn + counts.keyword + counts.unmapped;
const pct = (x) => ((x / n) * 100).toFixed(1) + '%';
console.log('Rows:', n);
console.log('By HSN:    ', counts.hsn, pct(counts.hsn));
console.log('By keyword:', counts.keyword, pct(counts.keyword));
console.log('Unmapped:  ', counts.unmapped, pct(counts.unmapped));
console.log('Auto-covered (hsn+keyword):', pct(counts.hsn + counts.keyword));
const recon = spend.hsn + spend.keyword + spend.unmapped;
console.log('Total spend:', total.toLocaleString('en-IN'));
console.log('Reconciles:', Math.abs(recon - total) < 1 ? 'YES' : 'NO (diff ' + (recon - total) + ')');
```

- [ ] **Step 2: Run it against the Aarti file**

Run: `npx tsx scripts/validate-categorization.mjs "C:/Users/Harshad/Downloads/PURCHASE 2025-26.xls"`
(If `tsx` is unavailable: `npm install -D tsx` first.)
Expected: prints coverage; **"Reconciles: YES"**; auto-covered ≥ a usable share. Record the numbers in the commit message.

- [ ] **Step 3: Commit**

```bash
git add scripts/validate-categorization.mjs
git commit -m "test(categorization): real-data validation script + coverage check"
```

---

### Task 9: Wire "Auto-categorize" into CategoryMapper

**Files:**
- Modify: `src/features/etl/CategoryMapper.tsx`

**Interfaces:**
- Consumes: `categorize`, `CategorizeKeys` from `../../utils/categorization/categorize`; `getClassifier` from `../../utils/categorization/llm`.
- Produces: a button that fills the category column from the cascade, preserving manual edits.

**Context for the implementer:** `CategoryMapper` holds the working rows in
`localData` (a state array) and writes categories into the column named
`categoryCol` (computed near the top of the component, lines ~30–31). The mapped
HSN and description columns are `mappings['hsn_code']` and
`mappings['description'] || mappings['item']`. Manual edits already set the value
on `row[categoryCol]`.

- [ ] **Step 1: Add imports at the top of CategoryMapper.tsx**

```tsx
import { categorize } from '../../utils/categorization/categorize';
import { getClassifier } from '../../utils/categorization/llm';
```

- [ ] **Step 2: Add an auto-categorize handler inside the component**

Place near the other handlers (e.g. after `handleAssignCategory`):

```tsx
const [autoBusy, setAutoBusy] = React.useState(false);
const [autoSummary, setAutoSummary] = React.useState<string | null>(null);

const handleAutoCategorize = async () => {
  setAutoBusy(true);
  setAutoSummary(null);
  try {
    const hsnKey = mappings['hsn_code'] || 'HSN/SAC CODE';
    const descKey = mappings['description'] || mappings['item'] || 'ITEM DESC.';
    const results = await categorize(localData, { hsnKey, descKey }, getClassifier());

    const by: Record<string, number> = {};
    const next = localData.map((row, i) => {
      const existing = row[categoryCol];
      // Never overwrite a real manual value.
      if (existing && String(existing).trim() && existing !== 'Uncategorized') return row;
      const res = results[i];
      by[res.source] = (by[res.source] || 0) + 1;
      return { ...row, [categoryCol]: res.category };
    });
    setLocalData(next);
    setAutoSummary(
      `Auto-categorized — HSN ${by.hsn || 0}, keyword ${by.keyword || 0}, ` +
      `AI ${by.ai || 0}, review ${by.unmapped || 0}.`,
    );
  } finally {
    setAutoBusy(false);
  }
};
```

- [ ] **Step 3: Add the button to the JSX**

Place it near the Step 4 header (around line ~220, beside the existing controls):

```tsx
<button
  onClick={handleAutoCategorize}
  disabled={autoBusy}
  className="px-4 py-2 rounded-lg bg-primary text-white font-semibold disabled:opacity-50"
>
  {autoBusy ? 'Categorizing…' : 'Auto-categorize'}
</button>
{autoSummary && <p className="text-xs text-zinc-400 mt-2">{autoSummary}</p>}
```

- [ ] **Step 4: Verify the build compiles**

Run: `npm run build`
Expected: green (tsc + vite), no type errors.

- [ ] **Step 5: Manual smoke (record result)**

Run: `npm run dev`, upload `PURCHASE 2025-26.xls`, advance to Step 4, click **Auto-categorize**.
Expected: categories populate; summary line shows non-zero HSN coverage; "Uncategorized" count drops sharply.

- [ ] **Step 6: Commit**

```bash
git add src/features/etl/CategoryMapper.tsx
git commit -m "feat(categorization): Auto-categorize button in CategoryMapper"
```

---

## Self-Review

**Spec coverage:**
- Hybrid HSN→keyword→AI cascade → Tasks 4,5,6. ✅
- Full-HSN, config-driven taxonomy + catch-all → Task 3. ✅
- Pluggable local-first LLM (Ollama default, none fallback) → Task 7. ✅
- Never hard-depends on LLM; failure → Other/Review → Task 6 tests. ✅
- Provenance (source/confidence) + never overwrite manual → Tasks 2,6,9. ✅
- Validation on real file + reconciliation → Task 8. ✅
- Wire into CategoryMapper, manual override kept → Task 9. ✅
- Vitest added → Task 1. ✅
- Gemini cloud adapter + WebLLM: spec'd as options; left as extension points in Task 7 (out of scope per spec's "local-first / internal runs" priority). Noted, not a gap.

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✅

**Type consistency:** `CategoryResult`, `ClassifyFn`, `CategorizeKeys`, `resolveByHsn`/`resolveByKeyword` return `{category, ok}`, `categorize(rows, keys, classify?)`, `getClassifier()` — names/signatures consistent across Tasks 2–9. ✅
