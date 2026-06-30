# ETL Report Redesign — Meaningful Procurement Spend Analysis Export

**Date:** 2026-06-30
**Status:** Design — pending implementation plan
**Affects:** `src/utils/ExcelGenerator.ts` (export consumed at `src/features/etl/AnalyticsDashboard.tsx:1370`)

## Problem

The current Excel export is not a meaningful analyst deliverable. Depending on the build, users either get an older report (ABC-style content, no savings) or the newly committed 7-sheet generator (savings, but no ABC analysis and no temporal/organizational/risk lenses). Neither is the complete, decision-driving report procurement teams expect.

## Dependency (build order)

This redesign assumes line items carry a real `Category_L1`. On validated client
data they do not — categories must be derived first. **Build
`2026-06-30-auto-categorization-design.md` BEFORE this**; otherwise every
category/savings/ABC sheet collapses to a single "Uncategorized" bucket.

## Goal

Produce a single, curated 11-sheet workbook that reads as a professional spend-analysis deliverable: **diagnose → trends → risk → savings → evidence**. Keep the existing public surface so the call site is unchanged.

## Non-goals (YAGNI)

- PO/Invoice/MRN 3-way match gap analysis (needs cleaner doc-number linkage; defer)
- Contract coverage / maverick (off-contract) spend (needs a preferred-supplier/contract reference dataset we don't have; defer)
- Tax & Freight and Data Quality sheets — **excluded for now** per user; can be added later without rework given the modular design.

## Public surface — UNCHANGED

```ts
new ExcelGenerator(data, mappings, currency).generate(): Promise<Blob>
```

`AnalyticsDashboard.tsx:1370-1371` continues to call `new ExcelGenerator(...).generate()` and download the returned Blob. No call-site changes.

## Final report structure (11 sheets)

| # | Sheet | Status | Purpose |
|---|-------|--------|---------|
| 00 | `00_README` | keep | Methodology + how to read the numbers |
| 01 | `01_Executive_Summary` | keep | Headline KPI tiles + savings headline |
| 02 | `02_ABC_Analysis` | **new** | Item & vendor A/B/C tiers (Pareto 80/15/5) |
| 03 | `03_Spend_by_Category` | keep | Category spend (live SUMIF off cleaned data) |
| 04 | `04_Spend_by_Vendor` | keep | Vendor ranking + Pareto cumulative % |
| 05 | `05_Spend_Trend` | **new** | Monthly/quarterly spend + seasonality |
| 06 | `06_Spend_by_Dept_Geo` | **new** | Spend by department + by state/geography |
| 07 | `07_Supplier_Concentration` | **new** | HHI, top-N concentration, single-source risk |
| 08 | `08_MultiVendor_Benchmark` | keep | Items from 2+ vendors, rate gap + saving |
| 09 | `09_Savings_Opportunities` | keep | Quantified + structural savings levers |
| 10 | `10_Cleaned_Data` | keep | Normalised 18-column transaction grid |

## New sheet specifications

### 02_ABC_Analysis
Two tables on one sheet — **by item** and **by vendor**.
- Sort entities by spend desc; compute cumulative % of total spend.
- Classify: **A** = entities up to 80% cumulative spend, **B** = 80–95%, **C** = 95–100%.
- Columns: Rank · Name (item code+desc / vendor) · Spend (Rs) · % of Total · Cumulative % · Class.
- Header summary line per table: count and spend share of each class (e.g. "A: 42 items = 80% of spend").
- Source: `stats.items` and `stats.vendors` (already aggregated in buildStats; extend items aggregation to carry spend for ABC).

### 05_Spend_Trend
- Bucket each transaction by month (`YYYY-MM`) using the resolved date key (MRN/invoice/PO date).
- Rows without a parseable date → an explicit **`Undated`** bucket (never silently dropped).
- Columns: Period · Spend (Rs) · Rs Cr · Line Items · MoM % change.
- Footer: peak month, trough month, and count of undated rows (data-honesty).
- Also a compact quarterly roll-up table beneath the monthly table.

### 06_Spend_by_Dept_Geo
Two tables — **by Department** (deptKey) and **by State** (stateKey).
- Columns each: Name · Spend (Rs) · % of Total · Line Items · Vendor Count.
- Sorted by spend desc; TOTAL row; "Unspecified" bucket for blanks.
- Source: new `byDept` and `byState` aggregations in buildStats.

### 07_Supplier_Concentration
Risk/dependency lens.
- **HHI** = Σ(vendor spend share %)² across all vendors, with interpretation band (e.g. <1500 competitive, 1500–2500 moderate, >2500 concentrated).
- **Top-3 / Top-10 concentration** = their combined % of spend.
- **Single-source high-spend items**: items bought from exactly one vendor with spend above a threshold (default: top quartile of single-source item spend). Columns: Item · Vendor · Spend · % of Total.
- Source: `stats.vendors`, `stats.items` (single-vendor flag from itemMap vendor count).

## Architecture — modularize the generator

The current single 686-line `ExcelGenerator.ts` will grow past 1,000 lines with 4 new sheets. Split into focused modules under `src/utils/excel/`:

```
src/utils/excel/
  ExcelGenerator.ts      orchestrator — public class, same constructor + generate()
  stats.ts               buildStats(): pure aggregation, all per-sheet inputs (one pass)
  style.ts               colour constants + styleTitle/styleHeaderRow/tile + fmtCr
  helpers.ts             parseAmount, parseDate, str, fmtDate, resolveKey
  types.ts               DataRow, Mappings, Stats
  sheets/
    readme.ts  executiveSummary.ts  abcAnalysis.ts  spendByCategory.ts
    spendByVendor.ts  spendTrend.ts  spendByDeptGeo.ts  supplierConcentration.ts
    multiVendorBenchmark.ts  savings.ts  cleanedData.ts
```

- `src/utils/ExcelGenerator.ts` becomes a thin re-export (`export { ExcelGenerator } from './excel/ExcelGenerator'`) so the existing import path `../../utils/ExcelGenerator` keeps working.
- Each sheet builder is a pure function: `createXxx(wb: ExcelJS.Workbook, stats: Stats): void`. One job, one file, independently testable.
- The orchestrator: resolve keys → `buildStats()` once → call each `createXxx` in order → `writeBuffer()` → Blob.

### Unit boundaries
- **stats.ts**: input = rows + resolved keys; output = `Stats` object. No ExcelJS dependency → trivially unit-testable. This is where correctness lives (ABC tiers, HHI, trend buckets).
- **sheets/***: input = workbook + stats; output = a worksheet. No business logic beyond presentation.
- **style.ts / helpers.ts**: leaf utilities, no cross-deps.

## Data flow

```
rows + mappings
  → resolveKeys (helpers.resolveKey, existing fallback pattern)
  → buildStats(rows, keys)  → Stats { totals, categories, vendors, items,
                                       byDept, byState, byMonth, benchmark, ... }
  → for each sheet: createXxx(wb, stats)
  → wb.xlsx.writeBuffer() → Blob
```

`buildStats` does a **single pass** over rows building all maps (category, vendor, item, dept, state, month), then derives sorted arrays + benchmark + concentration metrics. New aggregations added: `byDept`, `byState`, `byMonth`; `items` extended to expose per-item spend + vendor count for ABC and single-source detection.

## Cross-sheet dependency (must not break)

`03_Spend_by_Category` uses live `SUMIF('<cleaned-data-sheet>'!K…, …, '…'!O…)`. The cleaned-data sheet is renamed `06_Cleaned_Data` → `10_Cleaned_Data`, and its column layout (K=Category, O=Basic Amount) must stay fixed. **Action:** centralize the cleaned-data sheet name and the K/O column indices as shared constants in `style.ts`/`types.ts` so the SUMIF reference and the grid layout can never drift apart.

## Error handling

- Missing columns → `resolveKey` fallbacks to common ERP header names (existing pattern).
- Unparseable dates → `Undated` bucket; blanks in dept/state → `Unspecified`; never silently dropped.
- Division-by-zero guards on all share/percentage/HHI computations (existing pattern).
- Empty dataset → every sheet renders headers with zero data rows; `generate()` still returns a valid Blob.

## Testing

The project currently has **no test runner**. Add **Vitest** (dev dependency) and a `test` script.

- **stats.test.ts** (primary): feed a small handcrafted dataset and assert
  - ABC classification boundaries (A/B/C cutoffs at 80%/95%),
  - HHI value and top-N concentration,
  - month-bucketing incl. the `Undated` bucket,
  - dept/state aggregation totals reconcile to grand total.
- **generate.test.ts** (smoke): run `generate()` in-memory, load the buffer back with ExcelJS, assert all **11 worksheets exist by name** and a couple of known cells (e.g. Executive Summary total, ABC class column present).
- Follow `superpowers:test-driven-development` for the stats logic (tests first).

## Verification

- `npm run build` (tsc + vite) green.
- New unit/smoke tests pass.
- Manual: run the app, export a report from the dashboard, confirm 11 tabs in the correct order with populated data.

## Rollout

Single feature branch. Commit modularization + new sheets together (they're coupled), with the spec referenced. No data migration; export-only change.
