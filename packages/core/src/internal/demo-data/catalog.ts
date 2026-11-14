// The product catalogue of the demo company: generic industrial supplies described by their
// specification (no brand names). Each template is a mixed-radix space of variants; together they
// form the slot space the product generator walks through with a pseudo-random bijection.

export type DemoProductCategory =
  | 'fasteners'
  | 'bearings'
  | 'power-transmission'
  | 'hydraulics'
  | 'pneumatics'
  | 'electrical'
  | 'hand-tools'
  | 'power-tools'
  | 'abrasives'
  | 'safety'
  | 'lubricants'
  | 'adhesives'
  | 'material-handling';

export const PRODUCT_CATEGORY_LABEL: Readonly<Record<DemoProductCategory, string>> = Object.freeze({
  fasteners: 'Fasteners',
  bearings: 'Bearings',
  'power-transmission': 'Power transmission',
  hydraulics: 'Hydraulics',
  pneumatics: 'Pneumatics',
  electrical: 'Electrical',
  'hand-tools': 'Hand tools',
  'power-tools': 'Power tools',
  abrasives: 'Abrasives',
  safety: 'Safety & PPE',
  lubricants: 'Lubricants',
  adhesives: 'Adhesives & sealants',
  'material-handling': 'Material handling',
});

/** Three-letter prefix of the SKUs of each category. */
export const PRODUCT_CATEGORY_CODE: Readonly<Record<DemoProductCategory, string>> = Object.freeze({
  fasteners: 'FAS',
  bearings: 'BRG',
  'power-transmission': 'PTR',
  hydraulics: 'HYD',
  pneumatics: 'PNE',
  electrical: 'ELE',
  'hand-tools': 'HTL',
  'power-tools': 'PTL',
  abrasives: 'ABR',
  safety: 'PPE',
  lubricants: 'LUB',
  adhesives: 'ADH',
  'material-handling': 'MHD',
});

/** The unit a product is sold in (its price is per unit). */
export type DemoProductUnit = 'each' | 'box' | 'pack' | 'pair' | 'roll' | 'set' | 'can' | 'pail' | 'drum';

interface Template {
  readonly category: DemoProductCategory;
  readonly unit: DemoProductUnit;
  /** Variant dimensions; the first one drives the price (smallest to largest). */
  readonly dims: readonly (readonly string[])[];
  readonly name: (v: readonly string[]) => string;
  /** List price range in EUR cents, from the first to the last value of the first dimension. */
  readonly price: readonly [number, number];
}

const METRIC = ['M4', 'M5', 'M6', 'M8', 'M10', 'M12', 'M16', 'M20'];
const LENGTHS = ['12', '16', '20', '25', '30', '40', '50', '60', '80', '100'];
const FINISHES = ['zinc-plated', 'stainless A2', 'stainless A4', 'hot-dip galvanized'];
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

const TEMPLATES: readonly Template[] = [
  { category: 'fasteners', unit: 'box', dims: [METRIC, LENGTHS, FINISHES], name: ([m, l, f]) => `Hex bolt ${m} × ${l} mm, ${f}, box of 100`, price: [690, 8900] },
  { category: 'fasteners', unit: 'box', dims: [METRIC, LENGTHS, ['8.8', '10.9', '12.9', 'A2-70']], name: ([m, l, g]) => `Socket head cap screw ${m} × ${l} mm, grade ${g}, box of 100`, price: [790, 9900] },
  { category: 'fasteners', unit: 'box', dims: [METRIC, FINISHES], name: ([m, f]) => `Hex nut ${m}, ${f}, box of 200`, price: [390, 4900] },
  { category: 'fasteners', unit: 'box', dims: [METRIC, FINISHES], name: ([m, f]) => `Flat washer ${m}, ${f}, box of 500`, price: [350, 3900] },
  {
    category: 'bearings',
    unit: 'each',
    dims: [['00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'], ['60', '62', '63'], ['2RS', 'ZZ', 'open']],
    name: ([size, series, seal]) => `Deep-groove ball bearing ${series}${size}${seal === 'open' ? ', open' : `-${seal}`}`,
    price: [290, 6400],
  },
  { category: 'bearings', unit: 'each', dims: [['03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20']], name: ([n]) => `Tapered roller bearing 302${n}`, price: [1490, 18900] },
  { category: 'bearings', unit: 'each', dims: [['04', '05', '06', '07', '08', '09', '10', '11', '12']], name: ([n]) => `Pillow block bearing UCP2${n}`, price: [1890, 9900] },
  {
    category: 'power-transmission',
    unit: 'each',
    dims: [['800', '900', '1000', '1120', '1250', '1400', '1600', '1800', '2000', '2240', '2500', '2800', '3150'], ['SPZ', 'SPA', 'SPB', 'SPC']],
    name: ([len, profile]) => `V-belt ${profile} ${len} mm`,
    price: [790, 7900],
  },
  { category: 'power-transmission', unit: 'roll', dims: [['06B', '08B', '10B', '12B', '16B', '20B'], ['5', '10']], name: ([p, l]) => `Roller chain ${p}-1, ${l} m`, price: [3900, 39900] },
  {
    category: 'hydraulics',
    unit: 'each',
    dims: [['DN6', 'DN8', 'DN10', 'DN12', 'DN16', 'DN20', 'DN25'], ['210', '280', '350'], ['1', '2', '5']],
    name: ([dn, bar, m]) => `Hydraulic hose ${dn}, ${bar} bar, ${m} m`,
    price: [1890, 21900],
  },
  { category: 'hydraulics', unit: 'each', dims: [['1/4"', '3/8"', '1/2"', '3/4"', '1"'], ['straight', 'elbow 90°', 'tee']], name: ([t, s]) => `Hydraulic fitting BSP ${t}, ${s}`, price: [390, 4900] },
  {
    category: 'pneumatics',
    unit: 'each',
    dims: [['16', '20', '25', '32', '40', '50', '63', '80'], ['25', '50', '100', '160', '200', '320']],
    name: ([bore, stroke]) => `Pneumatic cylinder ⌀${bore} × ${stroke} mm`,
    price: [3900, 38900],
  },
  { category: 'pneumatics', unit: 'pack', dims: [['4', '6', '8', '10', '12'], ['straight', 'elbow', 'tee', 'Y']], name: ([od, s]) => `Push-in fitting ${od} mm, ${s}, pack of 10`, price: [690, 3900] },
  { category: 'pneumatics', unit: 'roll', dims: [['4', '6', '8', '10', '12'], ['blue', 'black', 'clear', 'red']], name: ([od, c]) => `Polyurethane tubing ${od} mm, ${c}, 50 m`, price: [2490, 8900] },
  {
    category: 'electrical',
    unit: 'roll',
    dims: [['0.75', '1.5', '2.5', '4', '6'], ['2', '3', '4', '5'], ['H05VV-F', 'H07RN-F', 'NYM-J']],
    name: ([mm2, cores, type]) => `Cable ${cores} × ${mm2} mm², ${type}, 100 m`,
    price: [3900, 64900],
  },
  {
    category: 'electrical',
    unit: 'each',
    dims: [['6', '10', '13', '16', '20', '25', '32', '40'], ['B', 'C', 'D'], ['1', '3']],
    name: ([a, curve, poles]) => `Circuit breaker ${curve}${a} A, ${poles}-pole`,
    price: [590, 6900],
  },
  { category: 'electrical', unit: 'each', dims: [['100', '150', '200', '240'], ['4000', '5000']], name: ([w, k]) => `LED high bay ${w} W, ${k} K`, price: [8900, 21900] },
  {
    category: 'hand-tools',
    unit: 'each',
    dims: [['6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '21', '22', '24', '27', '30', '32']],
    name: ([mm]) => `Combination wrench ${mm} mm`,
    price: [490, 4900],
  },
  { category: 'hand-tools', unit: 'each', dims: [['5–25', '20–100', '40–200', '60–340'], ['1/4"', '3/8"', '1/2"']], name: ([r, d]) => `Torque wrench ${r} Nm, ${d} drive`, price: [8900, 34900] },
  { category: 'hand-tools', unit: 'set', dims: [['9', '10', '13'], ['chrome-vanadium', 'ball-end chrome-vanadium']], name: ([n, m]) => `Hex key set, ${n} pieces, ${m}`, price: [1490, 4900] },
  {
    category: 'power-tools',
    unit: 'each',
    dims: [['12', '18', '36'], ['2.0', '4.0', '5.0'], ['with 2 batteries and charger', 'body only']],
    name: ([v, ah, kit]) => `Cordless drill driver ${v} V, ${ah} Ah, ${kit}`,
    price: [8900, 54900],
  },
  { category: 'power-tools', unit: 'each', dims: [['115', '125', '150', '230'], ['900', '1200', '1500', '2200']], name: ([d, w]) => `Angle grinder ${d} mm, ${w} W`, price: [5900, 27900] },
  { category: 'power-tools', unit: 'each', dims: [['12', '18', '36'], ['1/4"', '3/8"', '1/2"']], name: ([v, d]) => `Cordless impact wrench ${v} V, ${d} drive, body only`, price: [9900, 39900] },
  {
    category: 'abrasives',
    unit: 'box',
    dims: [['115', '125', '230'], ['1.0', '1.6', '3.0'], ['steel', 'stainless steel', 'stone']],
    name: ([d, t, m]) => `Cutting disc ${d} × ${t} mm for ${m}, box of 25`,
    price: [1990, 7900],
  },
  { category: 'abrasives', unit: 'box', dims: [['125', '150'], ['40', '60', '80', '120', '180', '240', '320']], name: ([d, g]) => `Sanding disc ⌀${d} mm, P${g}, box of 50`, price: [1490, 2990] },
  { category: 'abrasives', unit: 'box', dims: [['115', '125'], ['40', '60', '80', '120']], name: ([d, g]) => `Flap disc ${d} mm, K${g}, box of 10`, price: [2490, 3990] },
  { category: 'safety', unit: 'box', dims: [SIZES, ['blue', 'black']], name: ([s, c]) => `Nitrile gloves, ${c}, size ${s}, box of 100`, price: [790, 990] },
  {
    category: 'safety',
    unit: 'pair',
    dims: [['36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48'], ['S1P', 'S3']],
    name: ([eu, c]) => `Safety boots ${c}, EU size ${eu}`,
    price: [5900, 6900],
  },
  { category: 'safety', unit: 'each', dims: [['clear', 'tinted', 'amber', 'mirrored']], name: ([l]) => `Safety glasses, ${l} lens`, price: [490, 1290] },
  { category: 'safety', unit: 'each', dims: [['white', 'yellow', 'blue', 'red', 'green', 'orange']], name: ([c]) => `Hard hat EN 397, ${c}`, price: [1290, 1290] },
  { category: 'safety', unit: 'each', dims: [['S', 'M', 'L', 'XL', 'XXL', 'XXXL'], ['yellow', 'orange']], name: ([s, c]) => `High-visibility vest, ${c}, size ${s}`, price: [490, 690] },
  { category: 'safety', unit: 'box', dims: [['FFP2', 'FFP3'], ['with valve', 'without valve']], name: ([f, v]) => `${f} respirator ${v}, box of 20`, price: [1990, 4490] },
  { category: 'lubricants', unit: 'each', dims: [['1', '2', '3'], ['400 g cartridge', '5 kg pail', '18 kg pail']], name: ([n, p]) => `Multipurpose grease NLGI ${n}, ${p}`, price: [690, 12900] },
  { category: 'lubricants', unit: 'drum', dims: [['5', '20', '208'], ['32', '46', '68']], name: ([l, vg]) => `Hydraulic oil HLP ${vg}, ${l} l`, price: [2990, 69900] },
  { category: 'lubricants', unit: 'can', dims: [['5', '20']], name: ([l]) => `Water-miscible cutting fluid, ${l} l`, price: [3490, 11900] },
  { category: 'adhesives', unit: 'each', dims: [['10', '50', '250'], ['low-strength', 'medium-strength', 'high-strength']], name: ([ml, s]) => `Threadlocker, ${s}, ${ml} ml`, price: [890, 9900] },
  { category: 'adhesives', unit: 'each', dims: [['25', '50', '400']], name: ([ml]) => `Two-component epoxy adhesive, ${ml} ml`, price: [1290, 5900] },
  { category: 'adhesives', unit: 'pack', dims: [['white', 'grey', 'black', 'brown']], name: ([c]) => `Polyurethane sealant, ${c}, 310 ml, pack of 12`, price: [8900, 8900] },
  { category: 'adhesives', unit: 'roll', dims: [['48', '50', '75'], ['silver', 'black']], name: ([w, c]) => `Duct tape ${w} mm × 50 m, ${c}`, price: [690, 1190] },
  { category: 'material-handling', unit: 'each', dims: [['2000', '2500', '3000'], ['1150', '1220']], name: ([kg, len]) => `Pallet truck ${kg} kg, forks ${len} mm`, price: [32900, 54900] },
  {
    category: 'material-handling',
    unit: 'each',
    dims: [['120', '170', '220', '270', '320', '420'], ['600 × 400', '400 × 300']],
    name: ([h, base]) => `Stacking container ${base} × ${h} mm`,
    price: [690, 2490],
  },
  { category: 'material-handling', unit: 'each', dims: [['25', '35', '50'], ['5', '8', '10']], name: ([w, l]) => `Ratchet strap ${w} mm × ${l} m`, price: [890, 2990] },
  {
    category: 'material-handling',
    unit: 'each',
    dims: [['1800', '2000'], ['900', '1200'], ['4', '5']],
    name: ([h, w, levels]) => `Shelving unit ${h} × ${w} mm, ${levels} levels`,
    price: [12900, 18900],
  },
];

/** One catalogue item: a template plus one value per dimension. */
export interface CatalogItem {
  readonly category: DemoProductCategory;
  readonly unit: DemoProductUnit;
  readonly name: string;
  /** Base list price in EUR cents (before the per-product jitter). */
  readonly basePriceEurMinor: number;
}

const templateSizes = TEMPLATES.map((t) => t.dims.reduce((size, dim) => size * dim.length, 1));
const templateOffsets: number[] = [];
let catalogSize = 0;
for (const size of templateSizes) {
  templateOffsets.push(catalogSize);
  catalogSize += size;
}

/** Number of distinct catalogue items (product names). */
export const CATALOG_SIZE = catalogSize;

/** Catalogue item `slot` (`0 <= slot < CATALOG_SIZE`). */
export function catalogItem(slot: number): CatalogItem {
  return (ITEM_CACHE[slot] ??= buildCatalogItem(slot));
}

/** Items are built once per slot and shared (frozen) by every product row that uses them. */
const ITEM_CACHE: CatalogItem[] = [];

function buildCatalogItem(slot: number): CatalogItem {
  let t = TEMPLATES.length - 1;
  while (templateOffsets[t]! > slot) t--;
  const template = TEMPLATES[t]!;
  let rest = slot - templateOffsets[t]!;
  const values: string[] = [];
  let firstIndex = 0;
  for (let d = template.dims.length - 1; d >= 0; d--) {
    const dim = template.dims[d]!;
    const index = rest % dim.length;
    rest = Math.floor(rest / dim.length);
    values[d] = dim[index]!;
    if (d === 0) firstIndex = index;
  }
  const first = template.dims[0]!;
  const position = first.length > 1 ? firstIndex / (first.length - 1) : 0;
  const [low, high] = template.price;
  return Object.freeze({
    category: template.category,
    unit: template.unit,
    name: template.name(values),
    basePriceEurMinor: Math.round(low + (high - low) * position),
  });
}

/** Every category that has at least one template. */
export const PRODUCT_CATEGORIES: readonly DemoProductCategory[] = Object.freeze(
  Object.keys(PRODUCT_CATEGORY_LABEL) as DemoProductCategory[],
);
