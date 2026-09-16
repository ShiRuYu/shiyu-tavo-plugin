export function prepareMainChatText(text, digests, maxChars = 1800) {
  const clean = (Array.isArray(digests) ? digests : []).filter(Boolean).join('\n');
  if (!clean) return String(text || '');
  const bounded = clean.length > maxChars ? `${clean.slice(0, maxChars - 1)}…` : clean;
  return `${String(text || '')}\n\n<shiyu-phone-context>\n${bounded}\n</shiyu-phone-context>`;
}
