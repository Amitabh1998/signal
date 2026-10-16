function sourceForProof(report, proof) {
  return report.sources?.find(source => source.id === proof.sourceId)
    || report.sources?.find(source => source.name === proof.sourceName);
}

function normalized(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function evidenceTokens(value) {
  const stopWords = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'were', 'with']);
  return new Set(normalized(value).toLowerCase().match(/[a-z0-9]+/g)?.filter(token => token.length > 2 && !stopWords.has(token)) || []);
}

function isGroundedParaphrase(quote, content) {
  if (!/^(paraphrase|summary)\s*:/i.test(quote)) return false;
  const claimTokens = evidenceTokens(quote.replace(/^(paraphrase|summary)\s*:/i, ''));
  const sourceTokens = evidenceTokens(content);
  if (claimTokens.size < 2) return false;
  const overlap = [...claimTokens].filter(token => sourceTokens.has(token)).length;
  return overlap / claimTokens.size >= 0.65;
}

export function verifyProofs(report) {
  return (report.proofs || []).map(proof => {
    const source = sourceForProof(report, proof);
    const quote = normalized(proof.quote);
    const content = normalized(source?.content);
    let status = 'not-found';
    if (!source?.content) status = 'source-unavailable';
    else if (quote && content.includes(quote)) status = 'verbatim';
    else if (isGroundedParaphrase(quote, content)) status = 'paraphrase';
    return {
      ...proof,
      verification: {
        status,
        sourceId: source?.id || proof.sourceId || '',
        checkedAt: new Date().toISOString()
      }
    };
  });
}

export function verifyReportProofs(report) {
  return { ...report, proofs: verifyProofs(report) };
}
