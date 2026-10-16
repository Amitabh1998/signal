import { createHash } from 'node:crypto';
import readXlsxFile from 'read-excel-file/node';

const textExtensions = new Set(['txt', 'md', 'markdown', 'json', 'jsonl', 'csv']);
const spreadsheetExtensions = new Set(['xlsx']);

function extension(name = '') {
  return String(name).split('.').at(-1)?.toLowerCase() || '';
}

function cleanCell(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).replaceAll('\r', ' ').replaceAll('\n', ' ').trim();
}

function rowsToCsv(rows) {
  return rows.map(row => row.map(value => {
    const text = cleanCell(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(',')).join('\n');
}

async function parseSpreadsheet(buffer) {
  const workbook = await readXlsxFile(buffer);
  const sheets = Array.isArray(workbook) && workbook.every(item => item && Array.isArray(item.data))
    ? workbook
    : [{ sheet: 'Sheet 1', data: workbook }];
  return sheets.map(item => `SHEET: ${item.sheet || 'Sheet'}\n${rowsToCsv(item.data || [])}`).join('\n\n');
}

function parseText(buffer, ext) {
  const text = buffer.toString('utf8').trim();
  if (ext !== 'json') return text;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export async function ingestEvidenceFiles(files = []) {
  const sources = [];
  for (const [index, file] of files.slice(0, 20).entries()) {
    const name = String(file?.name || `evidence-${index + 1}`).replace(/[\r\n]/g, ' ').slice(0, 180);
    const ext = extension(name);
    if (!textExtensions.has(ext) && !spreadsheetExtensions.has(ext)) {
      throw new Error(`${name} is not supported. Use TXT, Markdown, JSON, JSONL, CSV, or XLSX.`);
    }
    const buffer = Buffer.from(String(file?.dataBase64 || ''), 'base64');
    if (!buffer.length) throw new Error(`${name} is empty.`);
    if (buffer.length > 8_000_000) throw new Error(`${name} is larger than the 8 MB per-file limit.`);
    const content = spreadsheetExtensions.has(ext)
      ? await parseSpreadsheet(buffer)
      : parseText(buffer, ext);
    sources.push({
      id: `upload_${index + 1}`,
      name,
      kind: spreadsheetExtensions.has(ext) ? 'SHEET' : ext.toUpperCase(),
      mimeType: String(file?.mimeType || 'application/octet-stream'),
      size: buffer.length,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      content,
      contentStatus: 'full'
    });
  }
  return sources;
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
