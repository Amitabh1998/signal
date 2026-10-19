import { createHash } from 'node:crypto';

// Uploads are validated and fingerprinted here, never parsed: RocketRide's
// parse node (pipelines/evidence-parse.pipe) reads every file, including
// binary spreadsheets, and its output is what the specialist roles cite.
const mimeTypes = {
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  json: 'application/json',
  jsonl: 'application/x-ndjson',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

function extension(name = '') {
  return String(name).split('.').at(-1)?.toLowerCase() || '';
}

export function acceptUploads(files = []) {
  return files.slice(0, 20).map((file, index) => {
    const name = String(file?.name || `evidence-${index + 1}`).replace(/[\r\n/\\]/g, ' ').slice(0, 180);
    const ext = extension(name);
    if (!mimeTypes[ext]) throw new Error(`${name} is not supported. Use TXT, Markdown, JSON, JSONL, CSV, or XLSX.`);
    const buffer = Buffer.from(String(file?.dataBase64 || ''), 'base64');
    if (!buffer.length) throw new Error(`${name} is empty.`);
    if (buffer.length > 8_000_000) throw new Error(`${name} is larger than the 8 MB per-file limit.`);
    return {
      id: `upload_${index + 1}`,
      name,
      kind: ext === 'xlsx' ? 'SHEET' : ext.toUpperCase(),
      mimeType: mimeTypes[ext],
      size: buffer.length,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      buffer
    };
  });
}

export function buildEvidenceBundle({ brief = '', evidence = '', sources = [] } = {}) {
  const sections = sources.length
    ? sources.map(source => `SOURCE: ${source.name}\n${source.content}`)
    : String(evidence || '').trim()
      ? [String(evidence).trim()]
      : [];
  const mission = String(brief || '').trim();
  if (mission) sections.push(`TASK\n${mission}`);
  return sections.join('\n\n');
}
