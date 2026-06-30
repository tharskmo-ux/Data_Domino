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
