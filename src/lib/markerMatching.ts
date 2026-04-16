const TOKEN_REPLACEMENTS: Array<[RegExp, string]> = [
  [/haemoglobin|hemoglobin|heamoglobin|hemoblobin/gi, "hemoglobin"],
  [/leucocyte|leukocyte|leucoycte|leukocvte/gi, "leukocyte"],
  [/lymphocyte|lymphocvte/gi, "lymphocyte"],
  [/neutrophil|neutrophi\b/gi, "neutrophil"],
  [/eosinophil|eosinophi\b/gi, "eosinophil"],
  [/basophil|basophi\b/gi, "basophil"],
  [/thyroid\s*stimulating\s*hormone|tsh/gi, "tsh"],
  [/hb\s*a1c|hba1c/gi, "hba1c"],
  [/rbc\s*count|red\s*blood\s*cell\s*count/gi, "rbc count"],
  [/wbc\s*count|white\s*blood\s*cell\s*count/gi, "wbc count"],
];

const collapseSpaces = (value: string) => value.replace(/\s+/g, " ").trim();

const tokenize = (value: string) =>
  value
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1);

const levenshteinDistance = (a: string, b: string) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
};

const tokenJaccard = (a: string, b: string) => {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }

  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
};

const stringSimilarity = (a: string, b: string) => {
  const maxLen = Math.max(a.length, b.length) || 1;
  const dist = levenshteinDistance(a, b);
  return 1 - dist / maxLen;
};

export const normalizeMarkerForMatch = (value: string) => {
  let normalized = value.toLowerCase();

  for (const [pattern, replacement] of TOKEN_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  normalized = normalized
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\bcount\b/g, " count ")
    .replace(/\blevel\b/g, " ")
    .replace(/\s+/g, " ");

  return collapseSpaces(normalized);
};

export const findClosestMarkerKey = (targetKey: string, existingKeys: string[]) => {
  let bestKey: string | null = null;
  let bestScore = 0;

  for (const candidate of existingKeys) {
    const lexical = stringSimilarity(targetKey, candidate);
    const semantic = tokenJaccard(targetKey, candidate);
    const score = Math.max(lexical, semantic);

    if (score > bestScore) {
      bestScore = score;
      bestKey = candidate;
    }
  }

  // High threshold to avoid mismatching different markers.
  return bestScore >= 0.86 ? bestKey : null;
};
