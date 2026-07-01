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
  // --- Dairy & food (chapters 01-24) ---
  '0401': 'Milk Products', '0402': 'Milk Products', '0403': 'Milk Products',
  '0404': 'Milk Products', '0405': 'Milk Products', '0406': 'Milk Products',
  '0713': 'Pulses & Grains', '0714': 'Pulses & Grains', '1006': 'Pulses & Grains',
  '0904': 'Spices', '0908': 'Spices', '0909': 'Spices', '0910': 'Spices',
  '1507': 'Edible Oils', '1508': 'Edible Oils', '1509': 'Edible Oils', '1510': 'Edible Oils',
  '1511': 'Edible Oils', '1512': 'Edible Oils', '1513': 'Edible Oils', '1514': 'Edible Oils',
  '1515': 'Edible Oils', '1516': 'Edible Oils', '1517': 'Edible Oils', '1518': 'Edible Oils',
  '1704': 'Confectionery', '1806': 'Confectionery',
  '1905': 'Bakery & Snacks', '2005': 'Processed Food', '2106': 'Food Preparations',
  '2201': 'Beverages', '2202': 'Beverages',
  '1213': 'Biomass Fuel', '1214': 'Biomass Fuel', '4401': 'Biomass Fuel', '4402': 'Biomass Fuel',
  // --- Fuel & lubricants (chapter 27, 34) ---
  '2701': 'Coal & Solid Fuel', '2710': 'Petroleum Products', '2711': 'Gas Fuel',
  '3403': 'Lubricants',
  // --- Chemicals & dyes (chapters 28-38) ---
  '2815': 'Inorganic Chemicals', '2833': 'Inorganic Chemicals', '2836': 'Inorganic Chemicals',
  '2841': 'Inorganic Chemicals', '2847': 'Inorganic Chemicals',
  '3204': 'Dyes', '3205': 'Dyes', '3206': 'Pigments', '3202': 'Tanning & Dyeing',
  '3402': 'Surfactants', '3404': 'Waxes', '3506': 'Adhesives', '3507': 'Enzymes',
  '3802': 'Activated Carbon', '3809': 'Textile Auxiliaries', '3808': 'Biocides',
  '3810': 'Metal Treatment', '3824': 'Specialty Chemicals', '3906': 'Polymers',
  '3910': 'Silicones', '3907': 'Polymers', '3903': 'Polymers',
  // --- Plastics & rubber (chapters 39-40) ---
  '3917': 'Pipes & Fittings', '3919': 'Adhesive Tapes', '3920': 'Plastic Sheets',
  '3923': 'Plastic Packaging', '3924': 'Plastic Articles', '3926': 'Plastic Articles',
  '4009': 'Rubber Hoses', '4016': 'Rubber Articles',
  // --- Paper & packaging (chapters 47-49) ---
  '4802': 'Paper', '4810': 'Paper', '4811': 'Paper',
  '4819': 'Packaging', '4820': 'Stationery', '4821': 'Labels & Stickers',
  '4822': 'Packaging', '4823': 'Paper Products',
  // --- Textiles (chapters 50-60) ---
  '5205': 'Cotton Yarn', '5206': 'Cotton Yarn', '5207': 'Cotton Yarn',
  '5402': 'Synthetic Yarn', '5509': 'Synthetic Yarn', '5510': 'Synthetic Yarn',
  '5407': 'Fabric', '5512': 'Fabric', '5513': 'Fabric', '6006': 'Knitted Fabric',
  // --- Metals & hardware (chapters 72-83) ---
  '7208': 'Steel Sheet', '7209': 'Steel Sheet', '7210': 'Steel Sheet',
  '7304': 'Steel Pipe', '7306': 'Steel Pipe', '7307': 'Pipe Fittings',
  '7308': 'Structural Steel', '7318': 'Fasteners', '7326': 'Steel Articles',
  '8202': 'Tools', '8207': 'Tools', '8481': 'Valves',
  // --- Machinery & electrical (chapters 84-90) ---
  '8413': 'Pumps', '8414': 'Compressors & Fans', '8421': 'Filtration Equipment',
  '8448': 'Textile Machinery Parts', '8483': 'Transmission Parts', '8482': 'Bearings',
  '8501': 'Electric Motors', '8504': 'Transformers', '8536': 'Switchgear',
  '8537': 'Control Panels', '8544': 'Cables & Wires', '9026': 'Measuring Instruments',
  '9027': 'Lab Instruments', '9032': 'Automatic Controls', '9608': 'Stationery',
  // --- Services (chapter 99, SAC) ---
  '9965': 'Freight & Transport', '9967': 'Logistics Services', '9983': 'Professional Services',
  '9985': 'Support Services', '9987': 'Maintenance & Job Work', '9988': 'Job Work',
};

// 2-digit chapter -> default L2 (used when the heading isn't curated above).
export const CHAPTER_L2: Record<string, string> = {
  '04': 'Dairy Products', '07': 'Vegetables', '08': 'Fruit', '09': 'Spices', '10': 'Cereals',
  '11': 'Milling Products', '12': 'Oil Seeds', '15': 'Edible Oils', '17': 'Sugar',
  '19': 'Bakery & Snacks', '21': 'Food Preparations', '22': 'Beverages', '24': 'Tobacco',
  '25': 'Minerals & Cement', '27': 'Fuel & Petroleum',
  '28': 'Inorganic Chemicals', '29': 'Organic Chemicals', '31': 'Fertilisers',
  '32': 'Dyes & Pigments', '34': 'Cleaning & Lubricants', '35': 'Enzymes & Adhesives',
  '38': 'Specialty Chemicals', '39': 'Plastics', '40': 'Rubber',
  '48': 'Paper Products', '49': 'Printed Material',
  '50': 'Silk', '51': 'Wool', '52': 'Cotton', '53': 'Other Fibres',
  '54': 'Man-made Filaments', '55': 'Man-made Fibres', '56': 'Nonwovens',
  '58': 'Special Fabrics', '59': 'Coated Fabrics', '60': 'Knitted Fabrics',
  '68': 'Stone & Ceramic', '69': 'Ceramics', '70': 'Glass',
  '72': 'Iron & Steel', '73': 'Steel Articles', '74': 'Copper', '76': 'Aluminium',
  '82': 'Tools', '83': 'Hardware', '84': 'Machinery & Parts',
  '85': 'Electrical Components', '90': 'Instruments', '94': 'Furniture & Fittings',
  '99': 'Services',
};

// Item-description keyword -> L3. First match wins.
export const L3_RULES: Array<[RegExp, string]> = [
  // Dairy
  [/\bpaneer\b/i, 'Paneer'], [/\blassi\b/i, 'Lassi'], [/\b(curd|dahi)\b/i, 'Curd'],
  [/\bbutter\s*milk\b/i, 'Buttermilk'], [/\bghee\b/i, 'Ghee'], [/\bmilk\b/i, 'Milk'],
  // Food & spices
  [/\bvegetable\s*oil|veg\.?\s*oil\b/i, 'Vegetable Oil'], [/\bpalm\s*oil\b/i, 'Palm Oil'],
  [/\brice\s*bran\b/i, 'Rice Bran Oil'], [/\bsunflower\b/i, 'Sunflower Oil'],
  [/\bcardamom\b/i, 'Cardamom'], [/\b(chana|dall?|pulse|lentil)\b/i, 'Pulses'],
  [/\bpapad\b/i, 'Papad'], [/\bbhujia|namkeen|snack\b/i, 'Namkeen'], [/\bsugar\b/i, 'Sugar'],
  [/\btea\b/i, 'Tea'], [/\bcoffee\b/i, 'Coffee'],
  // Fuel & lubricants
  [/\bfurnace\s*oil\b/i, 'Furnace Oil'], [/\bdiesel\b/i, 'Diesel'], [/\bpet\s*coke\b/i, 'Pet Coke'],
  [/\bcoal\b/i, 'Coal'], [/\b(rice\s*)?husk\b/i, 'Rice Husk'], [/\bbriquette\b/i, 'Briquette'],
  [/\b(grease|lubricant|lube|gear\s*oil|hydraulic\s*oil)\b/i, 'Lubricant'], [/\blpg\b/i, 'LPG'],
  // Chemicals & dyes
  [/\bsoda\s*ash\b/i, 'Soda Ash'], [/\bcaustic\b/i, 'Caustic Soda'],
  [/\bsodium\s*sulphate\b/i, 'Sodium Sulphate'], [/\bhydrogen\s*peroxide|h2o2\b/i, 'Hydrogen Peroxide'],
  [/\bhydro(sulphite|s)\b/i, 'Hydros'], [/\bacetic\s*acid\b/i, 'Acetic Acid'],
  [/\bcommon\s*salt|\bsalt\b/i, 'Salt'], [/\benzyme|zyme\b/i, 'Enzyme'],
  [/\bpolyelectrolyte\b/i, 'Polyelectrolyte'], [/\bsoftener\b/i, 'Softener'],
  [/\bwetting\s*agent\b/i, 'Wetting Agent'], [/\bleveling|levelling\b/i, 'Levelling Agent'],
  [/\bdye|colou?r\b/i, 'Dye'], [/\bpigment\b/i, 'Pigment'], [/\bacid\b/i, 'Acid'],
  // Textiles
  [/\bcotton\s*yarn\b/i, 'Cotton Yarn'], [/\byarn\b/i, 'Yarn'], [/\b(fibre|fiber)\b/i, 'Fibre'],
  [/\bfabric|cloth\b/i, 'Fabric'], [/\bgrey\s*(cloth|fabric)\b/i, 'Grey Fabric'],
  // Paper & packaging
  [/\bpaper\s*tube\b/i, 'Paper Tube'], [/\b(bar\s*code|sticker)\b/i, 'Stickers'],
  [/\b(carton|corrugat)\b/i, 'Carton'], [/\blabel|lot\s*continuity\b/i, 'Label'],
  [/\btape\b/i, 'Tape'], [/\b(poly|hdpe|ld)\s*bag|sludge\s*bag\b/i, 'Poly Bag'],
  [/\bindex\s*file|register|note\s*book|file\b/i, 'Stationery'],
  // Plastics / pipes
  [/\bpipe\b/i, 'Pipe'], [/\bfitting\b/i, 'Fitting'], [/\bhose\b/i, 'Hose'],
  [/\bmouse\s*pad\b/i, 'Mouse Pad'],
  // Metals & hardware
  [/\b(bolt|nut|screw|washer|fastener|rivet|eye\s*screw)\b/i, 'Fasteners'],
  [/\bbearing\b/i, 'Bearing'], [/\bvalve\b/i, 'Valve'], [/\bbend|elbow|flange|coupling\b/i, 'Pipe Fitting'],
  [/\bm\.?s\.?\s*(plate|sheet|angle|pipe)|s\.?s\.?\s*(plate|sheet|pipe|bend)\b/i, 'Steel'],
  // Machinery / electrical
  [/\bpump\b/i, 'Pump'], [/\bmotor\b/i, 'Motor'], [/\b(cable|wire)\b/i, 'Cable'],
  [/\bgear\b/i, 'Gear'], [/\bspindle\b/i, 'Spindle'], [/\broller\b/i, 'Roller'],
  [/\bsensor\b/i, 'Sensor'], [/\btrolley\b/i, 'Trolley'], [/\bfilter\b/i, 'Filter'],
  [/\bswitch|mcb|contactor|relay\b/i, 'Switchgear'], [/\bmarker|pen\b/i, 'Marker'],
  // Services
  [/\bfreight|transport|cartage\b/i, 'Freight'], [/\bjob\s*work\b/i, 'Job Work'],
  [/\bamc|maintenance|repair|service\b/i, 'Maintenance'], [/\bconsultanc/i, 'Consultancy'],
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
