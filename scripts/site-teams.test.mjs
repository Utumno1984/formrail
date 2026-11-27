import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assembleSite, isStrictRun, renderDesignPartners, renderPrice, renderPrivacyEmail } from './assemble-site.mjs';
import { assertConfigPublishable, findConfigProblems } from './check-site-config.mjs';
import {
  DESIGN_PARTNER_SEATS,
  DESIGN_PARTNER_URL,
  EARLY_ACCESS_URL,
  EXPECTED_PRICE_TEXT,
  PRIVACY_EMAIL,
  PURCHASE_RETENTION_YEARS,
} from './site-config.mjs';

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
    expect(EXPECTED_PRICE_TEXT).toBe('Expected price: from €199 per developer, 12 months of updates included');
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
    expect(teams).toContain(
      'One-time license per developer, 12 months of updates included.',
    );
  });

  it('a price is HTML-escaped; a page without the block is a build error', () => {
    expect(renderPrice('<!--PRICE_START--><p>{{EXPECTED_PRICE_TEXT}}</p><!--PRICE_END-->', 'a <b> & c')).toBe(
      '<p>a &lt;b&gt; &amp; c</p>',
    );
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
    // The design partner section is switched off too: it legitimately says "early access" (ticket #697).
    const { teams } = build({ earlyAccessUrl: '', designPartnerUrl: '' });
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

  it('no page of the site says the answers are used "only" to contact people (the notice names two purposes)', () => {
    const { teams, privacy, home, notFound } = build();
    for (const html of [teams, privacy, home, notFound]) {
      expect(html.replace(/\s+/g, ' ')).not.toMatch(/only to contact|only use your answers/i);
    }
    for (const html of [teams, home]) {
      expect(html.replace(/\s+/g, ' ')).toContain('your answers to plan the product');
    }
  });

  it('the footer license sentence is the decided one, letter for letter, on every page', () => {
    const { teams, privacy, home } = build();
    for (const html of [teams, privacy, home]) {
      expect(html).toContain(
        'Formrail Pro: One-time license per developer, 12 months of updates included.',
      );
    }
  });

  it('the new pages carry no script at all', () => {
    const { teams, privacy } = build();
    for (const html of [teams, privacy]) expect(html).not.toContain('<script');
  });
});

describe('design partner section (#697)', () => {
  const FORM = 'https://tally.so/r/xVYjMo';
  const flat = (html) => html.replace(/\s+/g, ' ');

  it('the committed values are the decided ones', () => {
    expect(DESIGN_PARTNER_URL).toBe(FORM);
    expect(DESIGN_PARTNER_SEATS).toBe(3);
  });

  it('with an empty URL no page of the site says "design partner" and no marker is left', () => {
    const { teams, privacy, home, notFound } = build({ designPartnerUrl: '' });
    for (const html of [teams, privacy, home, notFound]) {
      expect(html).not.toMatch(/design[- ]partner/i);
      expect(html).not.toMatch(/DESIGN_PARTNER|DP_(OPEN|FULL)|\{\{/);
    }
    expect(teams).toContain('id="waitlist"');
    expect(privacy).toContain('id="rights-title"');
  });

  it('with the URL set the section has the title, the offer, the requests, the seats and an external link to the form', () => {
    const { teams } = build();
    const text = flat(teams);
    expect(teams).toContain('<h2 id="design-partners-title">Design partners</h2>');
    expect(teams).toContain('id="design-partners"');
    for (const item of [
      'What you get',
      'Early access to Formrail Pro',
      'Influence on the roadmap',
      'A direct channel with the maintainer',
      '50% off the early access license, when early access opens',
      'What we ask',
      'Two short feedback calls',
      'A written use case',
      'A public quote, which is optional',
      'Up to 3 teams.',
    ]) {
      expect(text, item).toContain(item);
    }
    expect(teams).toContain(
      `<a class="btn btn-primary" href="${FORM}" target="_blank" rel="noopener">Apply as a design partner</a>`,
    );
    expect(text).toContain(
      'Opens an external form (Tally, servers in the EU) in a new tab; nothing is embedded in this page.',
    );
    expect(text).toContain('It is a different form from the waitlist one.');
    expect(teams).toMatch(/design-partners-title[\s\S]*href="\.\.\/privacy\/"/);
    expect(teams).not.toMatch(/DESIGN_PARTNER|DP_(OPEN|FULL)|\{\{/);
    expect(teams).not.toContain('All design partner seats are taken');
    expect(teams).not.toContain('<script');
  });

  it('the discount is a percentage, and no sentence promises a date, an amount or an obligation to buy', () => {
    const { teams } = build();
    const section = flat(teams.slice(teams.indexOf('id="design-partners"'), teams.indexOf('id="waitlist"')));
    expect(section).toContain('50% off');
    expect(section).not.toMatch(/[€$£]\s?\d|\d\s?(EUR|USD)/);
    expect(section).not.toMatch(
      /\b(20\d\d|january|february|march|april|june|july|august|september|october|november|december|q[1-4])\b/i,
    );
    expect(section).toContain('does not oblige you to buy anything');
  });

  it.each([
    [1, 'Up to 1 team.'],
    [3, 'Up to 3 teams.'],
    [5, 'Up to 5 teams.'],
  ])('%i seat(s): "%s" and the form link', (seats, text) => {
    const { teams } = build({ designPartnerSeats: seats });
    expect(flat(teams)).toContain(text);
    expect(teams).toContain(`href="${FORM}"`);
  });

  it('0 seats: seats exhausted, the link goes to the waitlist and the form is not linked anywhere', () => {
    const { teams, privacy } = build({ designPartnerSeats: 0 });
    expect(teams).toContain('All design partner seats are taken for now.');
    expect(teams).toContain('<a class="btn btn-primary" href="#waitlist">Go to the waitlist form</a>');
    expect(teams).not.toContain(FORM);
    expect(teams).not.toContain('Apply as a design partner');
    expect(teams).not.toMatch(/Up to \d+ teams?/);
    expect(privacy).not.toContain(FORM);
  });

  it('0 seats and no waitlist: no link to a missing #waitlist', () => {
    const { teams } = build({ designPartnerSeats: 0, earlyAccessUrl: '' });
    expect(teams).toContain('All design partner seats are taken for now.');
    expect(teams).not.toContain('href="#waitlist"');
    expect(teams).not.toContain('id="waitlist"');
  });

  it('with the waitlist off and design partners on, the page keeps only the design partner form link', () => {
    const { teams } = build({ earlyAccessUrl: '' });
    expect(teams).toContain(`href="${FORM}"`);
    expect(teams).not.toContain('href="#waitlist"');
    expect(teams).not.toContain('id="waitlist"');
  });

  it('the URL is HTML-escaped; bad URLs and bad seat counts are build errors', () => {
    const html =
      '<!--DESIGN_PARTNERS_START--><a href="{{DESIGN_PARTNER_URL}}">{{DESIGN_PARTNER_SEATS_TEXT}}</a><!--DESIGN_PARTNERS_END-->';
    expect(renderDesignPartners(html, 'https://tally.so/r/x?a=1&b=2', 2)).toBe(
      '<a href="https://tally.so/r/x?a=1&amp;b=2">Up to 2 teams</a>',
    );
    expect(() => renderDesignPartners(html, 'tally.so/r/x', 3)).toThrow(/DESIGN_PARTNER_URL/);
    expect(() => renderDesignPartners(html, 'http://tally.so/r/x', 3)).toThrow(/https/);
    expect(() => renderDesignPartners(html, FORM, -1)).toThrow(/DESIGN_PARTNER_SEATS/);
    expect(() => renderDesignPartners(html, FORM, 2.5)).toThrow(/DESIGN_PARTNER_SEATS/);
    expect(() => renderDesignPartners('<p>no block</p>', FORM, 3)).toThrow(/DESIGN_PARTNERS/);
    expect(renderDesignPartners(html, '', 3)).toBe('');
  });

  it('the privacy notice has a separate section with every field of the form, one by one; the waitlist section is untouched', () => {
    const { privacy } = build();
    expect(privacy).toContain('<h2 id="design-partners-title">Design partner applications</h2>');
    const section = flat(
      privacy.slice(privacy.indexOf('id="design-partners-title"'), privacy.indexOf('id="purchases-title"')),
    );
    const fields = privacy.slice(privacy.indexOf('id="dp-data-title"'), privacy.indexOf('id="dp-purpose-title"'));
    const items = [...fields.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => flat(m[1]).replace(/&ndash;/g, '-'));
    expect(items).toEqual([
      'Work email;',
      'Your role;',
      'What are you building? (a description of the type of application and the industry);',
      'Team size (one of 1-3, 4-10, 11-50 or 50+);',
      'Form library in use (you can pick several from a fixed list, which includes Custom, None and Other);',
      'When would you need it? (one of Now, 1-3 months, 3-6 months or Later);',
      'Are you available for two short feedback calls? (Yes or No);',
      'May we mention your company publicly as a design partner? (Yes or No);',
      'Consent, a box you check yourself that refers to this notice.',
    ]);
    for (const phrase of [
      'all required',
      'evaluate the application of your team',
      'contact your team',
      'art. 6(1)(a) GDPR',
      'not checked by default',
      'no later than 24 months after your application',
      'servers in the European Union',
      'processor',
      'transfers outside the EEA described above',
      'It is a different form from the waitlist one',
    ]) {
      expect(section, phrase).toContain(phrase);
    }
    // Tally's email copy is disclosed in the design partner section only (the waitlist wording stays as is).
    for (const phrase of ['formrail.dev@gmail.com', 'under its own terms and privacy policy', 'EU-US Data Privacy Framework', 'both on Tally and from the mailbox'])
      expect(section, phrase).toContain(phrase);
    expect(section).not.toContain('not copied to email');
    expect(section).not.toMatch(/Google[^.]*as our processor/);
    // The waitlist notice is unchanged and never mentions the other form.
    const waitlist = flat(
      privacy.slice(privacy.indexOf('id="data-title"'), privacy.indexOf('id="design-partners-title"')),
    );
    expect(waitlist).toContain('The waitlist form asks for these fields:');
    expect(waitlist).toContain('no later than 24 months after sign-up');
    expect(waitlist).not.toMatch(/design[- ]partner/i);
  });

  it('the privacy section adds no external link: the form is not linked from the notice', () => {
    const { privacy } = build();
    expect(privacy).not.toContain(FORM);
    // Up to the Purchases section (#692), which is a different notice and does link Paddle and GitHub.
    const section = privacy.slice(privacy.indexOf('id="design-partners-title"'), privacy.indexOf('id="purchases-title"'));
    expect(section).not.toMatch(/https?:\/\//);
  });
});

describe('placeholder guard', () => {
  it('the CLI reads --strict from the command line (and only from the arguments)', () => {
    expect(isStrictRun(['node', 'assemble-site.mjs', '--strict'])).toBe(true);
    expect(isStrictRun(['node', 'assemble-site.mjs'])).toBe(false);
    expect(isStrictRun(['node', '--strict'])).toBe(false);
  });

  // The guard tests use their own fake values, never the committed configuration.
  const FAKE_PLACEHOLDERS = {
    earlyAccessUrl: 'https://tally.so/r/PLACEHOLDER-waitlist-form',
    privacyEmail: 'PLACEHOLDER-privacy-contact@example.invalid',
  };

  it('the PR build works with placeholders, the strict (deploy) build refuses them', () => {
    expect(() => build(FAKE_PLACEHOLDERS)).not.toThrow();
    expect(() => build({ strict: true, ...FAKE_PLACEHOLDERS })).toThrow(/not ready to publish/);
    expect(() =>
      build({
        strict: true,
        ...FAKE_PLACEHOLDERS,
        privacyEmail: FINAL.privacyEmail,
      }),
    ).toThrow(/EARLY_ACCESS_URL is still a placeholder/);
    expect(() =>
      build({
        strict: true,
        ...FAKE_PLACEHOLDERS,
        earlyAccessUrl: FINAL.earlyAccessUrl,
      }),
    ).toThrow(/PRIVACY_EMAIL is still a placeholder/);
    expect(() => build({ strict: true, ...FINAL })).not.toThrow();
  });

  it('the strict guard fails before the previous output is touched', () => {
    const { storybookDir, outDir } = storybook();
    mkdirSync(outDir);
    writeFileSync(path.join(outDir, 'previous.txt'), 'published');
    expect(() =>
      assembleSite({
        storybookDir,
        outDir,
        strict: true,
        ...FAKE_PLACEHOLDERS,
      }),
    ).toThrow();
    expect(readFileSync(path.join(outDir, 'previous.txt'), 'utf8')).toBe('published');
  });

  it('the committed configuration is final: the deploy guard lets it through', () => {
    const config = {
      earlyAccessUrl: EARLY_ACCESS_URL,
      privacyEmail: PRIVACY_EMAIL,
      designPartnerUrl: DESIGN_PARTNER_URL,
      purchaseRetentionYears: PURCHASE_RETENTION_YEARS,
    };
    expect(findConfigProblems(config)).toEqual([]);
    expect(() => assertConfigPublishable(config)).not.toThrow();
    expect(() => build({ strict: true })).not.toThrow();
  });

  it.each([
    ['empty (section off)', '', null],
    ['a Tally URL', 'https://tally.so/r/xVYjMo', null],
    ['not a URL', 'tally.so/r/x', /DESIGN_PARTNER_URL is not an absolute URL/],
    ['an http URL', 'http://tally.so/r/x', /DESIGN_PARTNER_URL must be an https/],
    ['a placeholder', 'https://tally.so/r/PLACEHOLDER-design-partner', /DESIGN_PARTNER_URL is still a placeholder/],
    ['an example.com URL', 'https://example.com/form', /DESIGN_PARTNER_URL is still a placeholder/],
    ['the waitlist URL', 'https://tally.so/r/wX9aBc', /same as EARLY_ACCESS_URL/],
  ])('design partner URL: %s', (_name, designPartnerUrl, message) => {
    const problems = findConfigProblems({
      earlyAccessUrl: 'https://tally.so/r/wX9aBc',
      privacyEmail: 'privacy@formrail.dev',
      designPartnerUrl,
    }).join('\n');
    if (message) expect(problems).toMatch(message);
    else expect(problems).toBe('');
  });

  it('the strict build refuses a bad design partner URL and accepts an empty one', () => {
    expect(() =>
      build({
        strict: true,
        ...FINAL,
        designPartnerUrl: 'https://tally.so/r/PLACEHOLDER',
      }),
    ).toThrow(/DESIGN_PARTNER_URL is still a placeholder/);
    expect(() => build({ strict: true, ...FINAL, designPartnerUrl: FINAL.earlyAccessUrl })).toThrow(
      /same as EARLY_ACCESS_URL/,
    );
    expect(() => build({ strict: true, ...FINAL, designPartnerUrl: '' })).not.toThrow();
  });

  it('fake placeholder values are reported, with both problems listed', () => {
    const problems = findConfigProblems(FAKE_PLACEHOLDERS).join('\n');
    expect(problems).toMatch(/EARLY_ACCESS_URL is still a placeholder/);
    expect(problems).toMatch(/PRIVACY_EMAIL is still a placeholder/);
    expect(() => assertConfigPublishable(FAKE_PLACEHOLDERS)).toThrow(/not ready to publish/);
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
    ['email without a top-level domain', { privacyEmail: 'a@b' }, /not an email/],
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
