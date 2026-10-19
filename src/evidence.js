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

// A file name's readable stem: "05-enterprise-pipeline.xlsx" → "enterprise pipeline".
const stemOf = value => normalizeName(value).replace(/\.[a-z0-9]+$/, '').replace(/^\d+[\s_-]*/, '').replace(/[_-]+/g, ' ').trim();

// Report sources are named by the model, so they may not repeat the file names
// (a ticket id instead of the JSONL it came from). Match by exact name or id,
// then by file-name stem, then by an id that appears in exactly one file.
// Never by position: a wrong match would verify quotes against the wrong text.
function matchParsedSource(source, parsed) {
  const keys = [source?.id, source?.name].filter(Boolean).map(normalizeName);
  let index = parsed.findIndex(item => keys.includes(normalizeName(item.name)));
  if (index >= 0) return index;
  index = parsed.findIndex(item => {
    const stem = stemOf(item.name);
    return stem && keys.some(key => key === stem || key.includes(stem) || stemOf(key) === stem);
  });
  if (index >= 0) return index;
  const id = String(source?.id || '').trim();
  if (id.length >= 3) {
    const holders = parsed.map((item, itemIndex) => (item.content.includes(id) ? itemIndex : -1)).filter(itemIndex => itemIndex >= 0);
    if (holders.length === 1) return holders[0];
  }
  return -1;
}

export function attachEvidenceContent(reportSources, evidenceText) {
  const parsed = parseEvidenceBundle(evidenceText);
  return reportSources.map(source => {
    const match = parsed[matchParsedSource(source, parsed)];
    if (!match) return { ...source, content: '', contentStatus: 'metadata' };
    return { ...source, content: match.content, contentStatus: match.contentStatus };
  });
}
