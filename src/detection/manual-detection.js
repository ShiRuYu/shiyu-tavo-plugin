import { recentRoundMessages } from './round-counter.js';
import { detectNewRoles } from './role-detector.js';

export function createManualDetectionService({ adapter, storage, detectionService = detectNewRoles, now = () => Date.now() }) {
  return {
    async detect(chatId = null) {
      if (!adapter?.listMessages || !storage?.loadGlobal) return [];
      const currentChat = chatId ?? (await adapter.currentChat?.())?.id ?? null;
      if (!currentChat) return [];
      const state = await storage.loadGlobal();
      const messages = await adapter.listMessages(currentChat);
      const window = recentRoundMessages(messages, Number(state.detection?.recentWindowRounds || 5));
      const knownCharacters = adapter.findCharacters ? await adapter.findCharacters({}) : [];
      const found = await detectionService({
        messages: window.length ? window : messages.slice(-100),
        knownCharacters: knownCharacters || [],
        existingCandidates: state.candidates || [],
        oneOffGenerate: adapter.oneOffGenerate,
      });
      if (!found.length) return [];
      const stamped = found.map((candidate, index) => ({
        ...candidate,
        id: candidate.id || `candidate:manual:${currentChat}:${now()}:${index}`,
        chatId: currentChat,
        detectedAt: candidate.detectedAt || new Date(now()).toISOString(),
        status: candidate.status || 'pending',
      }));
      await storage.saveGlobal({ ...state, candidates: [...(state.candidates || []), ...stamped] });
      return stamped;
    },
  };
}

