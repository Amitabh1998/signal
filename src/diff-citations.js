// Prefixes every patch line with its new-file `path:line` (removed lines get
// `path:-`) so reviewers can cite exact lines without counting hunks, and
// returns the set of `path:line` locations present in the patch.
export function numberDiff(patch = '') {
  const lines = new Set();
  const numbered = [];
  let file = '';
  let line = 0;
  for (const row of String(patch).split('\n')) {
    const fileMatch = row.match(/^\+\+\+ b\/(.+)$/);
    if (fileMatch) {
      file = fileMatch[1];
      numbered.push(row);
      continue;
    }
    const hunk = row.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      line = Number(hunk[1]);
      numbered.push(row);
      continue;
    }
    if (!file || !line || row.startsWith('\\') || row.startsWith('--- ') || row.startsWith('diff --git') || row.startsWith('index ')) {
      numbered.push(row);
      continue;
    }
    if (row.startsWith('-')) {
      numbered.push(`${file}:- ${row}`);
      continue;
    }
    const location = `${file}:${line}`;
    lines.add(location);
    numbered.push(`${location} ${row}`);
    line += 1;
  }
  return { numbered: numbered.join('\n'), lines };
}

// Accepts `path:41`, `path:L41`, `path#L41`, `path, line 41`, and `path (line 41)`;
// ranges cite their first line. Verified means every citation is a line shown in the patch.
const citationPattern = /([A-Za-z0-9_.\/-]+\.[A-Za-z0-9]+)(?::L?|#L|,?\s+\(?lines?\s+)(\d+)/g;

export function verifyCitations(evidence, diffLines) {
  const citations = [...new Set([...String(evidence || '').matchAll(citationPattern)].map(match => `${match[1]}:${match[2]}`))];
  return { citations, citationVerified: citations.length > 0 && citations.every(citation => diffLines.has(citation)) };
}
