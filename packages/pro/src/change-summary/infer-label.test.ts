import { inferSegmentLabel } from './infer-label';

describe('inferSegmentLabel', () => {
  it.each([
    ['amount', 'Amount'],
    ['lineItems', 'Line Items'],
    ['line_items', 'Line Items'],
    ['line-items', 'Line Items'],
    ['LINE_ITEMS', 'LINE ITEMS'],
    ['vatNumber', 'Vat Number'],
    ['vatID', 'Vat ID'],
    ['XMLParser', 'XML Parser'],
    ['address2', 'Address 2'],
    ['__private', 'Private'],
    ['città', 'Città'],
    ['2024', '2024'],
    ['', '(unnamed)'],
    ['_', '(unnamed)'],
    ['--__-', '(unnamed)'],
    // Leading, trailing and repeated separators collapse.
    ['_line__items_', 'Line Items'],
    ['line-_items', 'Line Items'],
    // Acronym followed by a word, acronym at the end, digits on both sides.
    ['parseHTMLDocument', 'Parse HTML Document'],
    ['userURL', 'User URL'],
    ['v2Api', 'V 2 Api'],
    ['iban2Check', 'Iban 2 Check'],
    // Non-ASCII camelCase boundary; the rest of each word is left unchanged.
    ['ragioneSocialeÈ', 'Ragione Sociale È'],
    ['éTAT', 'É TAT'],
    // Characters that are not separators are kept as they are.
    ['a.b', 'A.b'],
  ])('%j → %j', (segment, label) => {
    expect(inferSegmentLabel(segment)).toBe(label);
  });
});
