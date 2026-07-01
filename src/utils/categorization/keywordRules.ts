export interface KeywordRule {
  pattern: RegExp;
  category: string;
}

/**
 * Description-keyword fallback (runs only when HSN can't classify a row).
 *
 * ORDER MATTERS — first match wins. Rules are ordered specific → generic so that,
 * e.g., "furnace oil" is caught as Fuel before a generic lube term, "PVC pipe" is
 * Plastics before a metal "pipe", and "rice husk" is Biomass before food "rice".
 *
 * Matching: each group is wrapped `\b(...)s?\b` so plurals match ("bolt" → "bolts",
 * "glove" → "gloves"). Word stems use `\w*` ("corrugat\w*" → "corrugated"). The outer
 * boundaries keep matches whole-word ("bar" won't hit "rebar", "cam" won't hit
 * "camera", "table" won't hit "vegetable").
 *
 * Categories MUST be exact TAXONOMY values. To extend: find the recurring word in
 * your uncategorized ("Other / Review") items and add it to the right bucket.
 */
export const KEYWORD_RULES: KeywordRule[] = [
  // ── Fuels (before any generic 'oil') ─────────────────────────────────────
  { pattern: /\b(rice\s*husk|husk|biomass|bagasse|wood\s*chip|saw\s*dust|ground\s*nut\s*shell|agro\s*fuel|fuel\s*pellet)s?\b/i, category: 'Agri & Biomass Fuel' },
  { pattern: /\b(coal|lignite|furnace\s*oil|diesel|hsd|petrol|lpg|cng|png|natural\s*gas|briquette|pet\s*coke|petcoke)s?\b/i, category: 'Fuel & Energy' },
  { pattern: /\b(grease|lubricant|lube|coolant|hydraulic\s*oil|gear\s*oil|cutting\s*oil|spindle\s*oil|engine\s*oil|transformer\s*oil|lube\s*oil)s?\b/i, category: 'Lubricants & Oils' },

  // ── Chemicals, pharma, agri inputs ───────────────────────────────────────
  { pattern: /\b(dye|dyestuff|pigment|colou?rant|acid|caustic|soda\s*ash|bleach|peroxide|h2o2|solvent|enzyme|softener|surfactant|wetting\s*agent|levell?ing\s*agent|sodium|sulph?ate|sulfate|chloride|hydros|chemical)s?\b/i, category: 'Chemicals & Dyes' },
  { pattern: /\b(medicine|tablet|capsule|syrup|ointment|bandage|syringe|first\s*aid|medical|pharma|antiseptic|saniti[sz]\w*)s?\b/i, category: 'Pharma & Medical' },
  { pattern: /\b(fertili[sz]er|urea|dap|npk|pesticide|insecticide|herbicide|manure|compost|seed)s?\b/i, category: 'Agri Inputs' },

  // ── Textiles, safety, leather/wood ───────────────────────────────────────
  { pattern: /\b(yarn|fibre|fiber|cotton|polyester|viscose|roving|sliver|tow|filament)s?\b/i, category: 'Fibres & Yarn' },
  { pattern: /\b(fabric|cloth|greige|grey\s*cloth|knitted|woven|denim|towel|bed\s*sheet|made[-\s]?up|textile)s?\b/i, category: 'Fabrics & Made-ups' },
  { pattern: /\b(glove|helmet|mask|goggle|face\s*shield|safety\s*shoe|safety\s*belt|ppe|ear\s*plug|apron|respirator|boiler\s*suit|uniform)s?\b/i, category: 'Safety & PPE / Apparel' },
  { pattern: /\b(leather|hide|wood|timber|plank|veneer|plywood)s?\b/i, category: 'Leather & Wood' },

  // ── Packaging (bar code/paper before generic) then plastics (PVC pipe here) ──
  { pattern: /\b(carton|corrugat\w*|packing|label|sticker|bar\s*code|tape|stretch\s*film|shrink\s*film|poly\s*bag|hdpe\s*bag|paper\s*tube|paper\s*cone|kraft|bopp|stationer\w*|register|note\s*book|a4|printer\s*paper|photo\s*copy|envelope)s?\b/i, category: 'Paper & Packaging' },
  { pattern: /\b(pvc|hdpe|ldpe|polypropylene|acrylic|rubber|o[-\s]?ring|gasket|hose|polymer|nylon|teflon|ptfe|plastic|thermocol)s?\b/i, category: 'Plastics & Rubber' },

  // ── Building, precious, minerals ─────────────────────────────────────────
  { pattern: /\b(cement|sand|brick|concrete|rmc|tile|marble|granite|aggregate|tmt|plaster|putty|paint|primer|glass)s?\b/i, category: 'Building Materials' },
  { pattern: /\b(gold|silver|platinum|bullion)s?\b/i, category: 'Precious Metals' },
  { pattern: /\b(iron\s*ore|ore|mineral|ingot|billet|metal\s*scrap|scrap)s?\b/i, category: 'Metals & Minerals' },

  // ── Hardware (metal pipe/fittings AFTER pvc) ─────────────────────────────
  { pattern: /\b(bolt|nut|screw|washer|fastener|rivet|nail|flange|elbow|bend|nipple|pipe|plate|sheet|angle|channel|rod|bar|mesh|hinge|clamp|bracket|chain|hardware|spanner|drill|tool)s?\b/i, category: 'Metals & Hardware' },

  // ── Machinery / spares ───────────────────────────────────────────────────
  { pattern: /\b(bearing|spindle|roller|gear|pulley|cam|spare|valve|pump|compressor|filter|seal|v[-\s]?belt|belt|sprocket|nozzle|impeller|actuator|coupling|conveyor)s?\b/i, category: 'Machinery & Spares' },

  // ── Electrical / electronics ─────────────────────────────────────────────
  { pattern: /\b(motor|cable|wire|switch|relay|sensor|transformer|plc|contactor|mcb|mccb|led|lamp|bulb|tube\s*light|starter|panel|meter|battery|ups|computer|laptop|printer|fan|electrical|electronic)s?\b/i, category: 'Electrical & Electronics' },

  // ── Vehicles, office ─────────────────────────────────────────────────────
  { pattern: /\b(tyre|tire|fork\s*lift|forklift|truck|tractor|vehicle|automobile|lorry|trailer)s?\b/i, category: 'Vehicles & Transport' },
  { pattern: /\b(chair|table|desk|cabinet|furniture|sofa|cupboard|almirah|mouse\s*pad|rack)s?\b/i, category: 'Office & Furniture' },

  // ── Food & agri (late; food terms rarely collide with industrial ones) ───
  { pattern: /\b(milk|paneer|curd|dahi|lassi|butter\s*milk|ghee|butter|cheese|sugar|tea|coffee|rice|wheat|flour|atta|dall?|pulse|chana|cardamom|chill?i|turmeric|cumin|jeera|masala|vegetable\s*oil|palm\s*oil|refined\s*oil|mustard\s*oil|sunflower\s*oil|edible\s*oil|soya|papad|bhujia|namkeen|biscuit)s?\b/i, category: 'Food & Agri Products' },

  // ── Services (last; broad terms) ─────────────────────────────────────────
  { pattern: /\b(freight|transport|cartage|labour|labor|job\s*work|service|amc|consultanc\w*|rent|commission|testing|calibrat\w*|courier|insurance|repair|maintenance|installation)s?\b/i, category: 'Freight & Services' },
];

export function resolveByKeyword(desc: string): { category: string; ok: boolean } {
  const text = String(desc ?? '');
  for (const r of KEYWORD_RULES) {
    if (r.pattern.test(text)) return { category: r.category, ok: true };
  }
  return { category: '', ok: false };
}
