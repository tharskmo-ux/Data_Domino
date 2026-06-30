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
