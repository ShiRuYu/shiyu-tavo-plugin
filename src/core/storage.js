export const STATE_KEY = 'shiyuPhone.state';
export const CHAT_LINK_PREFIX = 'shiyuPhone.chat.';

export const DEFAULT_PHONE_STATE = {
  schemaVersion: 1,
  activeIdentityId: 'user:default',
  identities: [{
    id: 'user:default',
    kind: 'user',
    name: '用户',
    profile: { bio: '' },
    settings: { proactiveEnabled: false, roleDialogueEnabled: false },
  }],
  candidates: [],
  threads: {},
  moments: [],
  github: { owner: '', repo: '', branch: 'main', rootPath: '', token: '' },
  detection: { enabled: true, roundThreshold: 5, recentWindowRounds: 5 },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeDefaults(value) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    ...clone(DEFAULT_PHONE_STATE),
    ...input,
    identities: Array.isArray(input.identities) && input.identities.length
      ? input.identities
      : clone(DEFAULT_PHONE_STATE.identities),
    threads: input.threads && typeof input.threads === 'object' ? input.threads : {},
    moments: Array.isArray(input.moments) ? input.moments : [],
    github: { ...clone(DEFAULT_PHONE_STATE.github), ...(input.github || {}) },
    detection: { ...clone(DEFAULT_PHONE_STATE.detection), ...(input.detection || {}) },
  };
}

async function variableGet(variable, scope, name, chatId) {
  if (!variable?.get) return null;
  const options = scope === 'chat' ? { scope, chatId } : { scope };
  try {
    return await variable.get(name, options);
  } catch {
    try {
      return await variable.get(scope, name, chatId);
    } catch {
      return null;
    }
  }
}

async function variableSet(variable, scope, name, value, chatId) {
  if (!variable?.set) throw new Error('Tavo variable API is unavailable');
  const options = scope === 'chat' ? { scope, chatId } : { scope };
  try {
    return await variable.set(name, value, options);
  } catch {
    return variable.set(scope, name, value, chatId);
  }
}

export function createStorage(tavo) {
  const variable = tavo?.variable;
  return {
    async loadGlobal() {
      return mergeDefaults(await variableGet(variable, 'global', STATE_KEY));
    },
    async saveGlobal(state) {
      await variableSet(variable, 'global', STATE_KEY, mergeDefaults(state));
    },
    async loadChatLink(chatId) {
      const value = await variableGet(variable, 'chat', `${CHAT_LINK_PREFIX}${chatId}`, chatId);
      return value && typeof value === 'object' ? value : {
        chatId,
        completedRounds: 0,
        lastAnalyzedMessageId: null,
        digest: '',
      };
    },
    async saveChatLink(chatId, patch) {
      const current = await this.loadChatLink(chatId);
      await variableSet(variable, 'chat', `${CHAT_LINK_PREFIX}${chatId}`, { ...current, ...patch }, chatId);
    },
  };
}
