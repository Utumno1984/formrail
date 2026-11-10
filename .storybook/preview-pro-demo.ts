// Loaded by Storybook only in the Pro demo build (STORYBOOK_EDITION=pro, see story-globs.mjs).
// Adds the "Pro preview" banner to the preview document, outside `#storybook-root`.
//
// A single DOM node per document, created on load: a React decorator would render once per story
// (repeated on an autodocs page that embeds several) and never on MDX pages. The banner is in the
// document flow above the story, not `position: fixed`. Stories sized to the viewport read
// `--rop-demo-viewport-height` (fallback `100dvh`, so the Free/complete builds are unchanged); the
// banner publishes the viewport height minus its own height in that variable, so the story plus the
// banner fit the viewport and no second scroller appears.
import './preview-pro-demo.css';

const BANNER_CLASS = 'rop-pro-banner';
const LANDING_PRO_URL = '/react-object-page/#pro';

function createBanner(doc: Document): HTMLElement {
  const banner = doc.createElement('div');
  banner.className = BANNER_CLASS;
  banner.setAttribute('role', 'note');
  banner.setAttribute('aria-label', 'Pro preview');

  const label = doc.createElement('strong');
  label.textContent = 'Pro preview';
  const link = doc.createElement('a');
  link.href = LANDING_PRO_URL;
  link.target = '_top';
  link.textContent = 'Learn more';

  banner.append(
    label,
    ' — the Pro components are under a commercial license that is not available yet. Free to explore here; not for production use. ',
    link,
  );
  return banner;
}

function reserveSpace(doc: Document, banner: HTMLElement): void {
  const style = doc.defaultView?.getComputedStyle(banner);
  const occupied = banner.getBoundingClientRect().bottom + (style ? parseFloat(style.marginBottom) || 0 : 0);
  doc.documentElement.style.setProperty('--rop-demo-viewport-height', `calc(100dvh - ${Math.max(0, occupied)}px)`);
}

function installBanner(doc: Document): void {
  if (doc.querySelector(`.${BANNER_CLASS}`)) return;
  const banner = createBanner(doc);
  doc.body.prepend(banner);
  const update = () => reserveSpace(doc, banner);
  update();
  new ResizeObserver(update).observe(banner);
}

if (typeof document !== 'undefined') {
  if (document.body) installBanner(document);
  else document.addEventListener('DOMContentLoaded', () => installBanner(document), { once: true });
}
