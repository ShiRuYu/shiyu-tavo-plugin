function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : [];
}

function normalizeCandidate(raw) {
  if (!raw || typeof raw !== 'object' || !asText(raw.name)) return null;
  return {
    name: asText(raw.name),
    aliases: asStringList(raw.aliases),
    description: asText(raw.description),
    personality: asText(raw.personality),
    scenario: asText(raw.scenario),
    first_mes: asText(raw.first_mes || raw.firstMessage),
    tags: asStringList(raw.tags),
    evidence: asText(raw.evidence),
    confidence: Number.isFinite(Number(raw.confidence)) ? Number(raw.confidence) : 0.5,
    status: 'pending',
  };
}

export function parseDetectorResponse(text) {
  const source = asText(text).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!source) return [];
  try {
    const parsed = JSON.parse(source);
    const list = Array.isArray(parsed) ? parsed : parsed?.candidates;
    return Array.isArray(list) ? list.map(normalizeCandidate).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function promptFor({ messages, knownNames }) {
  const transcript = messages.map((message) => {
    const role = message.role || (message.isUser ? 'user' : 'assistant');
    return `[${role}] ${message.content || ''}`;
  }).join('\n');
  return [
    '识别这段剧情中首次出现、且不在已知角色名单中的重要角色。只输出 JSON，不要解释。',
    'JSON 格式：{"candidates":[{"name":"","aliases":[],"description":"","personality":"","scenario":"","first_mes":"","tags":[],"evidence":"","confidence":0.0}]}',
    `已知角色：${knownNames.join('、') || '无'}`,
    `剧情：\n${transcript}`,
  ].join('\n\n');
}

export async function detectNewRoles({ messages = [], knownCharacters = [], existingCandidates = [], oneOffGenerate }) {
  if (typeof oneOffGenerate !== 'function' || !messages.length) return [];
  const knownNames = knownCharacters.flatMap((character) => [character.name, ...(character.aliases || [])]).filter(Boolean);
  const existingNames = existingCandidates.flatMap((candidate) => [candidate.name, ...(candidate.aliases || [])]).filter(Boolean);
  const blocked = new Set([...knownNames, ...existingNames].map((name) => String(name).trim().toLocaleLowerCase()));
  const raw = await oneOffGenerate(promptFor({ messages, knownNames }), { context: false });
  const seen = new Set();
  return parseDetectorResponse(raw).filter((candidate) => {
    const key = candidate.name.toLocaleLowerCase();
    if (blocked.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
