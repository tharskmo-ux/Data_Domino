# Auto-Categorization Engine — Hybrid HSN + Keyword + AI

**Date:** 2026-06-30
**Status:** Design — pending implementation plan
**Sequence:** Build this FIRST. The report redesign
(`2026-06-30-etl-report-redesign-design.md`) depends on real categories existing.
**Affects:** new `src/utils/categorization/`, `functions/index.js`,
`src/features/etl/CategoryMapper.tsx`

## Problem

Validated against a real client file (`PURCHASE 2025-26.xls`, 18,331 rows,
₹107.6 Cr, exported as `DataDomino_Aarti_2026-06-30.xlsx`):

- The source data has **no category column** — only `ITEM DESC.` and `HSN/SAC CODE`.
- `CategoryMapper.tsx` is **manual-only**: it groups uncategorized items and waits
  for the user to hand-assign each. No automatic categorization exists anywhere.
- Result: all 18,331 rows stay **"Uncategorized" (100% of spend)**, so every
  downstream analysis (category spend, savings, ABC, concentration) is meaningless.
- The `HSN/SAC CODE` — the ideal categorization signal — is collected but unused.

## Goal

An **industry-agnostic** auto-categorizer that assigns a standard `Category_L1`
to every line using a 3-pass cascade, with provenance and manual override.
Target: ≥90% of rows auto-categorized from HSN alone on typical GST data.

## Why this generalizes to ANY spend register

HSN/SAC codes are a **universal GST/customs standard** — the same codes across
every industry and vendor. The engine therefore works for any register (textile,
food, pharma, engineering, services). Industry differences only change *which*
buckets fill up, not the engine. Three design choices guarantee generality:

1. **Full HSN coverage** — the map covers all chapters 01–99, not just
   textile-relevant ones.
2. **Config-driven taxonomy** — categories live in a data table
   (`taxonomy.ts`), not hardcoded logic. Renaming/adding a bucket is a data edit.
   Future: per-project taxonomy override stored in project settings (out of scope now).
3. **Guaranteed catch-all** — unmapped items fall to `Other / Review`, never
   silently lost; they flow to the AI pass, then manual review.

## The taxonomy (default, all-HSN)

`Category_L1` buckets, each mapped from HSN chapter(s). Textile-relevant ones are
a subset; the rest cover other industries so any register categorizes.

| Category | HSN chapters |
|----------|--------------|
| Food & Agri Products | 01–05, 15–24 |
| Agri & Biomass Fuel | 06–14 |
| Building Materials | 25, 68–70 |
| Metals & Minerals (raw/ore) | 26 |
| Fuel & Energy | 27 |
| Lubricants & Oils | 27 (271x), 34 |
| Chemicals & Dyes | 28, 29, 32, 33, 35–38 |
| Pharma & Medical | 30, 90 (medical) |
| Agri Inputs (fertiliser) | 31 |
| Plastics & Rubber | 39–40 |
| Leather & Wood | 41–46 |
| Paper & Packaging | 47–49 |
| Fibres & Yarn | 50–55 |
| Fabrics & Made-ups | 56–63 |
| Safety & PPE / Apparel | 64–67 |
| Precious Metals | 71 |
| Metals & Hardware | 72–83 |
| Machinery & Spares | 84 |
| Electrical & Electronics | 85, 90 (instruments) |
| Vehicles & Transport | 86–89 |
| Office & Furniture | 94 |
| Freight & Services | 99 (SAC) |
| Other / Review | anything unmapped |

Mapping granularity: primarily by **2-digit HSN chapter**, with a few **4-digit
heading** overrides (e.g. 2710 → Lubricants/Fuel split, 3004 → Pharma) held in the
same table.

## The 3-pass cascade

For each row, stop at the first pass that assigns a category:

1. **HSN pass (deterministic).** Take `HSN/SAC CODE`, read its chapter (first 2
   digits) and any 4-digit override → category. Records `source = 'hsn'`.
2. **Keyword pass.** For rows with missing/unmapped HSN, regex-match `ITEM DESC.`
   against a keyword→category rule list (e.g. `bolt|nut|screw|washer` → Metals &
   Hardware; `yarn|fibre|cotton` → Fibres & Yarn; `grease|lubricant|oil` →
   Lubricants & Oils). Records `source = 'keyword'`.
3. **AI pass (pluggable LLM — local-first).** Collect the still-unknown **unique**
   descriptions, batch them to an LLM constrained to the taxonomy list, cache results
   by description. Records `source = 'ai'`. Any leftover → `Other / Review`,
   `source = 'unmapped'`.

   The LLM is a **swappable adapter** behind one interface
   `classify(descriptions: string[], taxonomy: string[]): Promise<string[]>`:
   - **Local (Ollama)** — default for internal runs; free, private, offline. Calls
     `http://localhost:11434` with a small instruct model (e.g. `llama3.1`/`qwen2.5`).
   - **In-browser (WebLLM/transformers.js)** — for browser clients with no backend.
   - **Cloud (Gemini)** — the `categorizeItems` Cloud Function, for hosted multi-client.
   - **None** — skip pass 3; leftovers go straight to `Other / Review`.

   The cascade NEVER hard-depends on an LLM: passes 1–2 are fully deterministic and
   offline, and pass 3 is optional. Provider is chosen by config
   (`VITE_CATEGORIZER_LLM = ollama | webllm | gemini | none`).

Each row gains `category_l1`, `category_source` (`hsn|keyword|ai|manual|unmapped`),
and a coarse `confidence` (hsn/keyword = high, ai = medium). Manual edits in the UI
set `source = 'manual'`, `confidence = high`, and are never overwritten by re-runs.

## Architecture

```
src/utils/categorization/
  taxonomy.ts      category list + HSN-chapter/heading → category table (config)
  hsnMap.ts        resolveByHsn(code): { category, ok } — chapter+override lookup
  keywordRules.ts  rule list + resolveByKeyword(desc): { category, ok }
  categorize.ts    categorize(rows, {hsnKey, descKey}, classify?): pure cascade
  types.ts         CategoryResult, Provenance, ClassifyFn
  llm/
    index.ts       getClassifier(): picks adapter from VITE_CATEGORIZER_LLM
    ollama.ts      local Ollama adapter (default)
    webllm.ts      in-browser adapter
    gemini.ts      cloud adapter → categorizeItems callable
functions/
  index.js         + categorizeItems callable (Gemini, taxonomy-constrained, auth-guarded)
                   — only needed for the cloud adapter
src/features/etl/
  CategoryMapper.tsx        + "Auto-categorize" button → runs cascade, fills column,
                            shows coverage by source; existing manual override kept
```

### Unit boundaries
- `taxonomy.ts` / `hsnMap.ts` / `keywordRules.ts`: pure data + pure lookups, no deps.
- `categorize.ts`: pure cascade; passes 1–2 run offline; pass 3 takes an injected
  `aiFn` (so tests run without network; production injects the cloud-function client).
- `CategoryMapper.tsx`: UI only — calls `categorize()`, writes results to the
  category column, renders coverage; no categorization logic inline.

## Data flow

```
rows + resolved {hsnKey, descKey}
  → categorize():
      pass1 HSN  → pass2 keyword  → pass3 AI(unique, cached)  → Other/Review
  → each row: category_l1 + category_source + confidence
  → CategoryMapper writes category_l1 into the data
  → rest of ETL + report consume real categories
```

## Error handling

- Missing/blank HSN → keyword pass; missing/blank desc too → `Other / Review`.
- Malformed HSN (non-numeric, <2 digits) → treated as unmapped, not a crash.
- AI pass failure/timeout/undeployed function → leave those rows `Other / Review`
  (`source = 'unmapped'`); never block the pipeline. Log count surfaced in UI.
- Re-running auto-categorize never overwrites `source = 'manual'` rows.

## Validation (on the real Aarti file)

- Run the cascade on `PURCHASE 2025-26.xls`; report **coverage by source**
  (hsn / keyword / ai / unmapped %). Acceptance: ≥90% via hsn+keyword.
- **Reconciliation:** sum of spend across all assigned categories must equal the
  grand total **₹107.6 Cr** (no rows dropped; `Other / Review` is a real bucket).
- Spot-check: sample 20 rows per top category; HSN→category must be defensible.
- Confirm `3_Dim_Category` is no longer a single "Uncategorized" row.

## Testing

Add **Vitest** (shared with the report-redesign spec).
- `categorize.test.ts`: handcrafted rows exercising each pass — clean HSN → hsn;
  missing HSN + keyword desc → keyword; neither → AI (mock `aiFn`); garbage → Other.
- `hsnMap.test.ts`: chapter boundaries + 4-digit overrides; every chapter 01–99
  resolves to a defined category (full-coverage assertion).
- `reconciliation.test.ts`: assigned-category spend sums to dataset total.
- TDD per `superpowers:test-driven-development` for the pure cascade.

## Verification

- `npm run build` green; tests pass.
- Manual: load the Aarti file in the app, click Auto-categorize, see real
  categories + coverage; export report shows populated category spend.

## Out of scope (YAGNI)

- Per-project custom taxonomies / taxonomy editor UI (default taxonomy only now).
- L2/L3 sub-category auto-assignment (L1 only this pass; manual for deeper levels).
- Re-training/learning from manual corrections.
