function jsonFromFile(file) {
  if (typeof file.text !== 'string') return null;
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
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    const data = bytes.slice(offset + 8, offset + 8 + length);
    if (type === 'tEXt') {
      const zero = data.indexOf(0);
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
    offset += 12 + length;
  }
  return null;
}

function isCharacter(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.spec && value.data?.name) return String(value.spec).startsWith('chara_card');
  if (value.character?.name || value.character?.data?.name) return true;
  return Boolean(value.name && value.description && (value.first_mes || value.firstMessage));
}

function isLorebook(value) {
  return Boolean(value && typeof value === 'object' && value.name && value.entries && !isCharacter(value));
}

function isPreset(value) {
  if (!value || typeof value !== 'object' || isCharacter(value) || isLorebook(value)) return false;
  return Boolean(value.temperature !== undefined || value.top_p !== undefined || value.topP !== undefined || value.prompts || value.parameters || /preset/i.test(String(value.name || '')));
}

export function classifyResource(file) {
  const path = String(file?.path || '').toLowerCase();
  const extension = path.split('.').pop();
  const parsed = extension === 'json' ? jsonFromFile(file) : extension === 'png' ? decodePngCharacter(file) : null;
  if (parsed && isCharacter(parsed)) return { kind: 'character', parsed, warnings: [] };
  if (parsed && isLorebook(parsed)) return { kind: 'lorebook', parsed, warnings: [] };
  if (parsed && isPreset(parsed)) return { kind: 'preset', parsed, warnings: [] };
  if (extension === 'json') return { kind: 'unknown', parsed: null, warnings: ['无法根据 JSON 结构识别资源类型'] };
  if (extension === 'png') return { kind: 'unknown', parsed: null, warnings: ['PNG 中没有可识别的 chara 角色卡数据'] };
  return { kind: 'unknown', parsed: null, warnings: ['不支持的文件格式'] };
}
