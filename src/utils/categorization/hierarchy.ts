/**
 * 3-level hierarchical categorisation.
 *
 *   L1 — broad bucket, from the HSN chapter (see taxonomy.ts / hsnMap.ts)
 *   L2 — mid-level group, from the HSN 4-digit heading (or a chapter default)
 *   L3 — most granular, from item-description keywords (or a cleaned description)
 *
 * Everything here is data-driven — extend HSN_L2 / CHAPTER_L2 / L3_RULES freely.
 */
import { normalizeHsn } from './hsnMap';

// 4-digit HSN heading -> L2 name. Most specific; wins over the chapter default.
export const HSN_L2: Record<string, string> = {
  // Dairy (chapter 04)
  '0401': 'Milk Products', '0402': 'Milk Products', '0403': 'Milk Products',
  '0404': 'Milk Products', '0405': 'Milk Products', '0406': 'Milk Products',
  // Edible oils (chapter 15)
  '1507': 'Edible Oils', '1508': 'Edible Oils', '1509': 'Edible Oils', '1510': 'Edible Oils',
  '1511': 'Edible Oils', '1512': 'Edible Oils', '1513': 'Edible Oils', '1514': 'Edible Oils',
  '1515': 'Edible Oils', '1516': 'Edible Oils', '1517': 'Edible Oils', '1518': 'Edible Oils',
  // Paper & packaging (chapters 48/49, plus plastic/steel/textile packaging)
  '4819': 'Packaging', '4821': 'Packaging', '4822': 'Packaging', '4823': 'Packaging',
  '4811': 'Paper', '4810': 'Paper', '4802': 'Paper', '3923': 'Packaging', '6305': 'Packaging',
  // Dyes & chemicals
  '3204': 'Dyes', '3205': 'Dyes', '3206': 'Pigments', '3202': 'Tanning & Dyeing',
  '2836': 'Inorganic Chemicals', '2833': 'Inorganic Chemicals', '2815': 'Inorganic Chemicals',
  '3402': 'Surfactants', '3403': 'Lubricants',
  // Fuel (chapter 27)
  '2701': 'Solid Fuel', '2710': 'Petroleum Products', '2711': 'Gas Fuel',
  // Fasteners / steel articles
  '7318': 'Fasteners', '7326': 'Steel Articles', '7308': 'Structural Steel',
};

// 2-digit chapter -> default L2 (used when the heading isn't curated above).
export const CHAPTER_L2: Record<string, string> = {
  '04': 'Dairy Products', '15': 'Edible Oils',
  '48': 'Paper Products', '49': 'Printed Material',
  '50': 'Silk', '51': 'Wool', '52': 'Cotton', '53': 'Other Fibres',
  '54': 'Man-made Filaments', '55': 'Man-made Fibres',
  '56': 'Nonwovens', '58': 'Special Fabrics', '59': 'Coated Fabrics', '60': 'Knitted Fabrics',
  '28': 'Inorganic Chemicals', '29': 'Organic Chemicals', '32': 'Dyes & Pigments',
  '34': 'Cleaning & Lubricants', '38': 'Specialty Chemicals',
  '39': 'Plastics', '40': 'Rubber',
  '72': 'Iron & Steel', '73': 'Steel Articles', '74': 'Copper', '76': 'Aluminium',
  '82': 'Tools', '83': 'Hardware',
  '84': 'Machinery & Parts', '85': 'Electrical Components', '90': 'Instruments',
  '27': 'Fuel & Petroleum', '25': 'Cement & Minerals', '69': 'Ceramics', '70': 'Glass',
};

// Item-description keyword -> L3. First match wins.
export const L3_RULES: Array<[RegExp, string]> = [
  // Dairy
  [/\bpaneer\b/i, 'Paneer'], [/\blassi\b/i, 'Lassi'], [/\b(curd|dahi)\b/i, 'Curd'],
  [/\bbutter\s*milk\b/i, 'Buttermilk'], [/\bghee\b/i, 'Ghee'], [/\bmilk\b/i, 'Milk'],
  // Oils
  [/\bvegetable\s*oil|veg\.?\s*oil\b/i, 'Vegetable Oil'], [/\bpalm\s*oil\b/i, 'Palm Oil'],
  [/\brice\s*bran\b/i, 'Rice Bran Oil'], [/\bsunflower\b/i, 'Sunflower Oil'],
  // Paper & packaging
  [/\bpaper\s*tube\b/i, 'Paper Tube'], [/\b(bar\s*code|sticker)\b/i, 'Stickers'],
  [/\bcarton\b/i, 'Carton'], [/\blabel\b/i, 'Label'], [/\btape\b/i, 'Tape'],
  [/\b(poly\s*bag|hdpe\s*bag)\b/i, 'Poly Bag'], [/\bcorrugat/i, 'Corrugated Box'],
  // Chemicals & dyes
  [/\bsoda\s*ash\b/i, 'Soda Ash'], [/\bcaustic\b/i, 'Caustic Soda'],
  [/\bsodium\s*sulphate\b/i, 'Sodium Sulphate'], [/\bhydrogen\s*peroxide\b/i, 'Hydrogen Peroxide'],
  [/\bdye\b/i, 'Dye'], [/\bpigment\b/i, 'Pigment'], [/\bacid\b/i, 'Acid'], [/\bsoftener\b/i, 'Softener'],
  // Textiles
  [/\bcotton\s*yarn\b/i, 'Cotton Yarn'], [/\byarn\b/i, 'Yarn'], [/\b(fibre|fiber)\b/i, 'Fibre'],
  [/\bfabric\b/i, 'Fabric'],
  // Metals & hardware
  [/\b(bolt|nut|screw|washer|fastener|rivet)\b/i, 'Fasteners'], [/\bbearing\b/i, 'Bearing'],
  [/\bm\.?s\.?\s*(plate|sheet|angle)\b/i, 'MS Steel'],
  // Machinery / electrical
  [/\bmotor\b/i, 'Motor'], [/\bcable|wire\b/i, 'Cable'], [/\bgear\b/i, 'Gear'],
  [/\bspindle\b/i, 'Spindle'], [/\broller\b/i, 'Roller'], [/\bsensor\b/i, 'Sensor'],
  // Fuel & lubricants
  [/\bfurnace\s*oil\b/i, 'Furnace Oil'], [/\bdiesel\b/i, 'Diesel'], [/\bcoal\b/i, 'Coal'],
  [/\b(rice\s*)?husk\b/i, 'Rice Husk'], [/\b(grease|lubricant|lube)\b/i, 'Lubricant'],
  [/\blpg\b/i, 'LPG'],
];

/** Title-case the first few words of a description as a last-resort L3. */
function cleanDesc(desc: string): string {
  const s = String(desc ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return '';
  return s
    .split(' ')
    .slice(0, 3)
    .join(' ')
    .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/**
 * Given an already-resolved L1 (from the cascade), derive L2 and L3.
 * L2: HSN heading -> chapter default -> L1. L3: description keyword -> cleaned desc -> L2.
 */
export function resolveSubLevels(l1: string, hsn: string, desc: string): { l2: string; l3: string } {
  const digits = normalizeHsn(hsn);
  const heading = digits.slice(0, 4);
  const chapter = digits.slice(0, 2);
  const l2 = HSN_L2[heading] || CHAPTER_L2[chapter] || l1;

  let l3 = '';
  const text = String(desc ?? '');
  for (const [re, name] of L3_RULES) {
    if (re.test(text)) { l3 = name; break; }
  }
  if (!l3) l3 = cleanDesc(desc) || l2;

  return { l2, l3 };
}
