import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeSiteBase } from './site-config.mjs';

// Ticket #667: the site base is `/` (formrail.dev), independent of the repository name.
const load = async () => {
  vi.resetModules();
  return import('./site-config.mjs');
};

afterEach(() => vi.unstubAllEnvs());

describe('SITE_BASE', () => {
  it.each(['Utumno1984/formrail', 'someone/other-fork', ''])('is "/" with GITHUB_REPOSITORY=%j', async (repo) => {
    vi.stubEnv('GITHUB_REPOSITORY', repo);
    expect((await load()).SITE_BASE).toBe('/');
  });

  it('a fork can set an explicit prefix through SITE_BASE', async () => {
    vi.stubEnv('SITE_BASE', '/my-fork/');
    expect((await load()).SITE_BASE).toBe('/my-fork/');
  });

  it('an invalid SITE_BASE from the environment fails loudly at import', async () => {
    vi.stubEnv('SITE_BASE', 'my-fork');
    await expect(load()).rejects.toThrow(/SITE_BASE/);
  });

  it('the domain is formrail.dev', async () => {
    const config = await load();
    expect(config.SITE_DOMAIN).toBe('formrail.dev');
    expect(config.SITE_ORIGIN).toBe('https://formrail.dev');
  });
});

describe('normalizeSiteBase', () => {
  it.each(['/', '/a/', '/a/b-c/', '/repo.name/'])('accepts %s', (v) => expect(normalizeSiteBase(v)).toBe(v));
  it.each(['', 'a', '/a', 'a/', '//', '/a//', '/../', '/a/./', '/a b/', '/a?x/', '/a#/'])('rejects %j', (v) =>
    expect(() => normalizeSiteBase(v)).toThrow(/SITE_BASE/),
  );
});
