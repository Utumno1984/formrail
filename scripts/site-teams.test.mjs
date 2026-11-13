import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assembleSite, renderPrice, renderPrivacyEmail } from './assemble-site.mjs';
import { assertConfigPublishable, findConfigProblems } from './check-site-config.mjs';
import { EARLY_ACCESS_URL, EXPECTED_PRICE_TEXT, PRIVACY_EMAIL } from './site-config.mjs';

// Pro page for teams, privacy page and the placeholder guard (ticket #490).

const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function storybook() {
  const tmp = mkdtempSync(path.join(tmpdir(), 'assemble-teams-'));
  dirs.push(tmp);
  const storybookDir = path.join(tmp, 'storybook-static');
  mkdirSync(storybookDir);
  writeFileSync(path.join(storybookDir, 'index.html'), '<!-- manager -->');
  return { storybookDir, outDir: path.join(tmp, 'site') };
}

function build(options) {
  const { storybookDir, outDir } = storybook();
  assembleSite({ storybookDir, outDir, ...options });
  const read = (file) => readFileSync(path.join(outDir, file), 'utf8');
  return {
    teams: read('teams/index.html'),
    privacy: read('privacy/index.html'),
    home: read('index.html'),
    notFound: read('404.html'),
  };
}

const FINAL = {
  earlyAccessUrl: 'https://tally.so/r/abc123',
  privacyEmail: 'privacy@formrail.dev',
};

describe('assembled pages', () => {
  it('the committed price constant is the decided sentence, written in exactly once', () => {
    expect(EXPECTED_PRICE_TEXT).toBe('Expected price: from €199 per developer/year');
    const { teams } = build();
    expect(teams.split(EXPECTED_PRICE_TEXT).length - 1).toBe(1);
    expect(teams).toContain('The price is indicative and not final.');
    expect(teams).not.toContain('{{');
    expect(teams).not.toMatch(/PRICE_(START|END)/);
  });

  it('with an empty price no figure and no currency stay anywhere on the site', () => {
    const { teams, privacy, home, notFound } = build({ priceText: '' });
    for (const html of [teams, privacy, home, notFound]) {
      expect(html).not.toMatch(/[€$£]\s?\d|\d\s?(EUR|USD)|Expected price|indicative/);
      expect(html).not.toContain('PRICE_');
    }
    expect(teams).toContain('Annual license per developer, 12 months of updates included, terms published before sales.');
  });

  it('a price is HTML-escaped; a page without the block is a build error', () => {
    expect(renderPrice('<!--PRICE_START--><p>{{EXPECTED_PRICE_TEXT}}</p><!--PRICE_END-->', 'a <b> & c')).toBe('<p>a &lt;b&gt; &amp; c</p>');
    expect(() => renderPrice('<p>no block</p>', 'x')).toThrow(/PRICE/);
  });

  it('the privacy page carries the email as text and as mailto; an empty email is a build error', () => {
    const { privacy } = build({ privacyEmail: 'privacy@formrail.dev' });
    expect(privacy).toContain('<a href="mailto:privacy@formrail.dev">privacy@formrail.dev</a>');
    expect(privacy).not.toContain('{{');
    expect(() => renderPrivacyEmail('{{PRIVACY_EMAIL}}', '')).toThrow(/PRIVACY_EMAIL/);
    expect(() => build({ privacyEmail: '' })).toThrow(/PRIVACY_EMAIL/);
  });

  it('with an empty form URL the teams page has neither CTA, waitlist section nor hero button', () => {
    const { teams } = build({ earlyAccessUrl: '' });
    expect(teams).not.toMatch(/early access|waitlist|href="#waitlist"|EARLY_ACCESS|\{\{/i);
    expect(teams).not.toMatch(/href="#?"/);
    expect(teams).toContain('id="license"');
  });

  it('with a URL the hero button and the section are kept; the link is rel=noopener to exactly that URL', () => {
    const { teams } = build({
      earlyAccessUrl: 'https://tally.so/r/abc123?a=1&b=2',
    });
    expect(teams).toContain('href="https://tally.so/r/abc123?a=1&amp;b=2"');
    expect(teams).toContain('rel="noopener"');
    expect(teams).toContain('href="#waitlist"');
    expect(teams).toContain('id="waitlist"');
    expect(teams).not.toContain('EARLY_ACCESS');
  });

  it('every page of the site links the privacy page in its footer and no longer says "terms to be defined"', () => {
    const { teams, privacy, home, notFound } = build({
      siteBase: '/some-repo/',
    });
    expect(home).toMatch(/<footer[\s\S]*href="privacy\/"[\s\S]*<\/footer>/);
    expect(teams).toMatch(/<footer[\s\S]*href="\.\.\/privacy\/"[\s\S]*<\/footer>/);
    expect(privacy).toMatch(/<footer[\s\S]*Privacy[\s\S]*<\/footer>/);
    expect(notFound).toContain('href="/some-repo/privacy/"');
    for (const html of [home, teams, privacy]) expect(html).not.toContain('terms to be defined');
  });

  it('the new pages carry no script at all', () => {
    const { teams, privacy } = build();
    for (const html of [teams, privacy]) expect(html).not.toContain('<script');
  });
});

describe('placeholder guard', () => {
  it('the PR build works with the placeholders, the strict (deploy) build refuses them', () => {
    expect(() => build()).not.toThrow();
    expect(() => build({ strict: true })).toThrow(/not ready to publish/);
    expect(() => build({ strict: true, privacyEmail: FINAL.privacyEmail })).toThrow(/EARLY_ACCESS_URL is still a placeholder/);
    expect(() => build({ strict: true, earlyAccessUrl: FINAL.earlyAccessUrl })).toThrow(/PRIVACY_EMAIL is still a placeholder/);
    expect(() => build({ strict: true, ...FINAL })).not.toThrow();
  });

  it('the strict guard fails before the previous output is touched', () => {
    const { storybookDir, outDir } = storybook();
    mkdirSync(outDir);
    writeFileSync(path.join(outDir, 'previous.txt'), 'published');
    expect(() => assembleSite({ storybookDir, outDir, strict: true })).toThrow();
    expect(readFileSync(path.join(outDir, 'previous.txt'), 'utf8')).toBe('published');
  });

  it('the committed config is still placeholder, so the deploy fails until Daniele fills it in', () => {
    const config = {
      earlyAccessUrl: EARLY_ACCESS_URL,
      privacyEmail: PRIVACY_EMAIL,
    };
    const problems = findConfigProblems(config).join('\n');
    expect(problems).toMatch(/EARLY_ACCESS_URL is still a placeholder/);
    expect(problems).toMatch(/PRIVACY_EMAIL is still a placeholder/);
    expect(() => assertConfigPublishable(config)).toThrow(/not ready to publish/);
  });

  const ok = {
    earlyAccessUrl: 'https://tally.so/r/wX9aBc',
    privacyEmail: 'privacy@formrail.dev',
  };

  it('final values pass', () => {
    expect(findConfigProblems(ok)).toEqual([]);
  });

  it.each([
    ['empty URL', { earlyAccessUrl: '' }, /EARLY_ACCESS_URL is empty/],
    ['not a URL', { earlyAccessUrl: 'tally.so/r/x' }, /not an absolute URL/],
    ['http URL', { earlyAccessUrl: 'http://tally.so/r/x' }, /https/],
    ['placeholder URL, any case', { earlyAccessUrl: 'https://tally.so/r/placeholder' }, /still a placeholder/],
    ['example.com URL', { earlyAccessUrl: 'https://example.com/form' }, /still a placeholder/],
    ['empty email', { privacyEmail: '' }, /PRIVACY_EMAIL is empty/],
    ['not an email', { privacyEmail: 'privacy' }, /not an email/],
    ['placeholder email', { privacyEmail: 'PLACEHOLDER@formrail.dev' }, /still a placeholder/],
    ['.invalid email', { privacyEmail: 'me@x.invalid' }, /still a placeholder/],
    ['example.com email', { privacyEmail: 'me@example.com' }, /still a placeholder/],
  ])('rejects %s', (_name, patch, message) => {
    expect(findConfigProblems({ ...ok, ...patch }).join('\n')).toMatch(message);
  });
});

describe('workflow wiring of the guard', () => {
  const workflow = readFileSync(fileURLToPath(new URL('../.github/workflows/ci.yml', import.meta.url)), 'utf8');
  const job = (name) => {
    const start = workflow.indexOf(`\n  ${name}:\n`);
    expect(start, `job ${name}`).toBeGreaterThan(-1);
    const next = workflow.slice(start + 1).search(/\n {2}[a-z-]+:\n/);
    return workflow.slice(start, next === -1 ? undefined : start + 1 + next);
  };

  it('the deploy job runs the placeholder check and assembles with --strict', () => {
    const deploy = job('deploy-pages');
    expect(deploy).toContain('node scripts/check-site-config.mjs');
    expect(deploy).toContain('node scripts/assemble-site.mjs --strict');
  });

  it('the PR site smoke assembles with the placeholders (no strict) and runs the site suite', () => {
    const site = job('site');
    expect(site).toContain("github.event_name == 'pull_request'");
    expect(site).toContain('node scripts/assemble-site.mjs\n');
    expect(site).not.toContain('--strict');
    expect(site).not.toContain('check-site-config');
    expect(site).toContain('npm run test:site');
  });
});
