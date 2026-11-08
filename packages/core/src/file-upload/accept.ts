const MIME_TOKEN = /^[\w!#$&^.+-]+\/(?:\*|[\w!#$&^.+-]+)$/;

/**
 * Parses an `accept` string (same syntax as the native attribute) into lowercase tokens, dropping
 * blanks and anything that is neither an extension (`.pdf`) nor a MIME type / wildcard
 * (`application/pdf`, `image/*`), as the browsers do.
 */
export function parseAccept(accept: string | undefined): string[] {
  if (!accept) return [];
  return accept
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => (token.startsWith('.') ? token.length > 1 : MIME_TOKEN.test(token)));
}

/**
 * Whether `file` satisfies `accept`. Extensions match the end of the name, case-insensitively; a MIME
 * type matches exactly and `type/*` matches the whole family (MIME parameters such as `;charset` are
 * ignored). A file with an empty MIME type (unknown extension in some browsers) can only match by
 * extension. An empty `accept`, or one with no valid token, accepts everything. Unlike the native
 * picker filter, this also holds for dropped files.
 */
export function matchesAccept(file: Pick<File, 'name' | 'type'>, accept: string | undefined): boolean {
  const tokens = parseAccept(accept);
  if (tokens.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.split(';')[0]!.trim().toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith('.')) return name.endsWith(token);
    if (type === '') return false;
    if (token === '*/*') return true;
    if (token.endsWith('/*')) return type.startsWith(token.slice(0, -1));
    return type === token;
  });
}
