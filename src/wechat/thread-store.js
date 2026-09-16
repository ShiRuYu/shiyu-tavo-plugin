function threadKey({ identityId, kind, participantIds }) {
  return `thread:${identityId}:${kind}:${[...(participantIds || [])].map(Number).sort((a, b) => a - b).join(',')}`;
}

function trimText(value, max) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

export function createThreadService({ storage, now = () => Date.now() }) {
  return {
    async getOrCreateThread({ identityId, kind, participantIds, title = '' }) {
      const state = await storage.loadGlobal();
      const id = threadKey({ identityId, kind, participantIds });
      const existing = state.threads?.[id];
      if (existing) return existing;
      const thread = {
        id,
        identityId,
        kind,
        participantIds: [...(participantIds || [])].map(Number).sort((a, b) => a - b),
        title,
        messages: [],
        digest: '',
        unread: 0,
        lastContactAt: null,
      };
      await storage.saveGlobal({ ...state, threads: { ...(state.threads || {}), [id]: thread } });
      return thread;
    },
    async getThread(threadId) {
      const state = await storage.loadGlobal();
      return state.threads?.[threadId] || null;
    },
    async listThreads(identityId) {
      const state = await storage.loadGlobal();
      return Object.values(state.threads || {}).filter((thread) => thread.identityId === identityId).sort((a, b) => String(b.lastContactAt || '').localeCompare(String(a.lastContactAt || '')));
    },
    async appendMessage(threadId, message) {
      const state = await storage.loadGlobal();
      const thread = state.threads?.[threadId];
      if (!thread) throw new Error(`Unknown thread: ${threadId}`);
      const nextMessage = {
        id: message.id || `${threadId}:message:${thread.messages.length + 1}`,
        authorId: message.authorId ?? null,
        role: message.role || 'user',
        content: String(message.content || ''),
        createdAt: message.createdAt || new Date(now()).toISOString(),
      };
      const nextThread = {
        ...thread,
        messages: [...thread.messages, nextMessage],
        lastContactAt: nextMessage.createdAt,
        unread: message.unread === false ? thread.unread : thread.unread + (nextMessage.role === 'character' ? 1 : 0),
      };
      await storage.saveGlobal({ ...state, threads: { ...state.threads, [threadId]: nextThread } });
      return nextMessage;
    },
    async markRead(threadId) {
      const state = await storage.loadGlobal();
      if (!state.threads?.[threadId]) return null;
      const nextThread = { ...state.threads[threadId], unread: 0 };
      await storage.saveGlobal({ ...state, threads: { ...state.threads, [threadId]: nextThread } });
      return nextThread;
    },
    async buildDigest(threadId, maxChars = 600) {
      const thread = await this.getThread(threadId);
      if (!thread) return '';
      const digest = thread.messages.slice(-8).map((message) => `${message.role}: ${message.content}`).join('\n');
      return trimText(digest, maxChars);
    },
  };
}
