const normalizeName = value => String(value || '')
  .toLowerCase()
  .replace(/[—–]/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

export function parseEvidenceBundle(text) {
  const sources = [];
  let current;

  const flush = () => {
    if (!current) return;
    sources.push({
      name: current.name,
      content: current.lines.join('\n').trim(),
      contentStatus: 'full'
    });
    current = undefined;
  };

  for (const line of String(text || '').split(/\r?\n/)) {
    const sourceMatch = line.match(/^\s*SOURCE:\s*(.+?)\s*$/i);
    if (sourceMatch) {
      flush();
      current = { name: sourceMatch[1], lines: [] };
      continue;
    }
    if (/^\s*TASK\s*$/i.test(line)) {
      flush();
      break;
    }
    if (current) current.lines.push(line);
  }
  flush();
  return sources;
}

export function attachEvidenceContent(reportSources, evidenceText) {
  const parsed = parseEvidenceBundle(evidenceText);
  const remaining = new Set(parsed.map((_, index) => index));

  return reportSources.map((source, sourceIndex) => {
    const wanted = normalizeName(source?.name);
    let matchIndex = parsed.findIndex((item, index) => remaining.has(index) && normalizeName(item.name) === wanted);
    if (matchIndex < 0 && remaining.has(sourceIndex)) matchIndex = sourceIndex;
    const match = parsed[matchIndex];
    if (!match) return { ...source, content: '', contentStatus: 'metadata' };
    remaining.delete(matchIndex);
    return { ...source, content: match.content, contentStatus: match.contentStatus };
  });
}
