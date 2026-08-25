export function tokenMatch(query: string, ...fields: Array<string | undefined>) {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const haystack = fields.filter(Boolean).join(' ').toLowerCase().replaceAll('_', ' ');
  return tokens.every((token) => haystack.includes(token));
}
