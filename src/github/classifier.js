function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function unwrapCharacter(value) {
  if (!isObject(value)) return null;
  if (isObject(value.character)) return unwrapCharacter(value.character);
  if (value.spec && /^chara_card_v[23]$/i.test(String(value.spec)) && isObject(value.data)) return value;
  if (isObject(value.data) && typeof value.data.name === 'string' && (typeof value.data.first_mes === 'string' || typeof value.data.firstMes === 'string')) return { spec: 'chara_card_v3', data: value.data };
  if (typeof value.name === 'string' && (typeof value.first_mes === 'string' || typeof value.firstMes === 'string')) return { spec: 'chara_card_v3', data: value };
  return null;
}

function unwrapLorebook(value) {
  if (!isObject(value)) return null;
  if (value.spec && /lorebook_v3/i.test(String(value.spec)) && isObject(value.data)) return value;
  if (isObject(value.data) && Array.isArray(value.data.entries)) return { spec: 'lorebook_v3', data: value.data };
  if (Array.isArray(value.entries) || (isObject(value.entries) && Object.keys(value.entries).length >= 0)) {
    if (typeof value.name === 'string' || value.scan_depth !== undefined || value.token_budget !== undefined || value.recursive_scanning !== undefined) return value;
  }
  return null;
}

function unwrapPreset(value) {
  if (!isObject(value)) return null;
  if (Array.isArray(value.prompts) || Array.isArray(value.prompt_order)) return value;
  if (isObject(value.basicPrompts) && Array.isArray(value.entries)) return value;
  if (value.temperature !== undefined || value.top_p !== undefined || value.topP !== undefined || value.parameters) return value;
  return null;
}

function unwrapRegex(value) {
  if (!isObject(value)) return null;
  const isRule = (candidate) => isObject(candidate) && typeof candidate.findRegex === 'string';
  if (isRule(value)) return { name: String(value.scriptName || value.name || '').trim(), entries: [value] };
  if (Array.isArray(value.entries) && value.entries.some(isRule)) return { name: String(value.name || '').trim(), entries: value.entries };
  return null;
}

function withFilenameName(type, normalized, filename) {
  const name = String(filename || '').trim();
  if (!normalized || !name) return normalized;
  if (type === 'character' && normalized.data && isObject(normalized.data)) return { ...normalized, data: { ...normalized.data, name } };
  return { ...normalized, name };
}

function jsonFromFile(file) {
  if (typeof file?.text !== 'string') return null;
  try { return JSON.parse(file.text); } catch { return null; }
}

function decodePngCharacter(file) {
  if (!file?.bytesBase64) return null;
  let bytes;
  try {
    if (typeof atob === 'function') bytes = Uint8Array.from(atob(file.bytesBase64.replace(/\s/g, '')), (char) => char.charCodeAt(0));
    else bytes = Uint8Array.from(Buffer.from(file.bytesBase64, 'base64'));
  } catch { return null; }
  if (bytes.length < 8 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) return null;
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
    if (offset + 12 + length > bytes.length) break;
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    const data = bytes.slice(offset + 8, offset + 8 + length);
    if (type === 'tEXt') {
      const zero = data.indexOf(0);
      if (zero >= 0) {
        const key = new TextDecoder('latin1').decode(data.slice(0, zero));
        if (key.toLowerCase() === 'chara') {
          try {
            const encoded = new TextDecoder('latin1').decode(data.slice(zero + 1));
            const binary = typeof atob === 'function' ? atob(encoded) : Buffer.from(encoded, 'base64').toString('binary');
            const jsonText = typeof atob === 'function'
              ? new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
              : Buffer.from(binary, 'binary').toString('utf8');
            return JSON.parse(jsonText);
          } catch { return null; }
        }
      }
    }
    offset += 12 + length;
  }
  return null;
}

export function classifyResource(file) {
  const path = String(file?.path || '').toLowerCase();
  const extension = path.split('.').pop();
  const parsed = extension === 'json' ? jsonFromFile(file) : extension === 'png' ? decodePngCharacter(file) : null;
  const character = parsed && unwrapCharacter(parsed);
  if (character) return { kind: 'character', parsed, normalized: withFilenameName('character', character, file.name || file.path?.split('/').pop()), warnings: [] };
  const regex = parsed && unwrapRegex(parsed);
  if (regex) return { kind: 'regex', parsed, normalized: withFilenameName('regex', regex, file.name || file.path?.split('/').pop()), warnings: [] };
  const lorebook = parsed && unwrapLorebook(parsed);
  if (lorebook) return { kind: 'lorebook', parsed, normalized: withFilenameName('lorebook', lorebook, file.name || file.path?.split('/').pop()), warnings: [] };
  const preset = parsed && unwrapPreset(parsed);
  if (preset) return { kind: 'preset', parsed, normalized: withFilenameName('preset', preset, file.name || file.path?.split('/').pop()), warnings: [] };
  if (extension === 'json') return { kind: 'unknown', parsed: null, normalized: null, warnings: ['无法根据 JSON 结构识别资源类型'] };
  if (extension === 'png') return { kind: 'unknown', parsed: null, normalized: null, warnings: ['PNG 中没有可识别的 chara 角色卡数据'] };
  return { kind: 'unknown', parsed: null, normalized: null, warnings: ['不支持的文件格式'] };
}

export { isObject, unwrapCharacter, unwrapLorebook, unwrapPreset, unwrapRegex, withFilenameName };
