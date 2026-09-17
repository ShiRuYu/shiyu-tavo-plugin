import { countCompletedRounds, recentRoundMessages } from '../detection/round-counter.js';
import { detectNewRoles as defaultDetectNewRoles } from '../detection/role-detector.js';
import { prepareMainChatText } from './main-chat-link.js';
import { runSocialBackground } from './social-scanner.js';

export const RUNTIME_EVENTS = [
  'chat:opened',
  'chat:updated',
  'message:added',
  'generation:prepare',
  'generation:success',
];

export function createRuntimeCoordinator({ tavo, adapter, storage, detectionService, threadService, roleDialogueService }) {
  let activeChatId = null;
  const pending = new Map();
  const errors = [];
  const handlers = {
    'chat:opened': async (event = {}) => {
      activeChatId = event.chatId ?? activeChatId ?? (await adapter?.currentChat?.())?.id ?? null;
      if (activeChatId) await storage?.loadChatLink?.(activeChatId);
    },
    'chat:updated': async () => undefined,
    'message:added': async (event = {}) => {
      if (event.role === 'assistant' || event.isUser === false) {
        enqueueBackgroundWork(`detect:${event.chatId ?? activeChatId}`, () => runDetection(event.chatId ?? activeChatId));
      }
    },
    'generation:prepare': async (event) => {
      if (!event || typeof event.text !== 'string') return;
      const chatId = event.chatId ?? activeChatId;
      const link = chatId ? await storage?.loadChatLink?.(chatId) : null;
      event.text = prepareMainChatText(event.text, link?.digest ? [link.digest] : []);
    },
    'generation:success': async (event = {}) => {
      enqueueBackgroundWork(`detect:${event.chatId ?? activeChatId}`, () => runDetection(event.chatId ?? activeChatId));
      enqueueBackgroundWork(`social:${event.chatId ?? activeChatId}`, () => runBackground(event));
    },
  };

  async function runDetection(chatId) {
    if (!chatId || !storage?.loadGlobal || !adapter?.listMessages) return [];
    const state = await storage.loadGlobal();
    if (state.detection?.enabled === false) return [];
    const link = await storage.loadChatLink(chatId);
    const messages = await adapter.listMessages(chatId);
    const completedRounds = countCompletedRounds(messages);
    if (completedRounds <= Number(link.completedRounds || 0)) return [];
    await storage.saveChatLink(chatId, { completedRounds });
    const threshold = Math.max(1, Number(state.detection?.roundThreshold || 5));
    if (completedRounds % threshold !== 0) return [];
    const knownCharacters = adapter.findCharacters ? await adapter.findCharacters({}) : [];
    const recent = recentRoundMessages(messages, Number(state.detection?.recentWindowRounds || 5));
    const found = await (detectionService?.detectNewRoles || defaultDetectNewRoles)({
      messages: recent,
      knownCharacters: knownCharacters || [],
      existingCandidates: state.candidates || [],
      oneOffGenerate: adapter.oneOffGenerate,
    });
    if (!found.length) return [];
    const stamped = found.map((candidate, index) => ({
      ...candidate,
      id: `candidate:${chatId}:${completedRounds}:${index}`,
      chatId,
      detectedAt: new Date().toISOString(),
    }));
    await storage.saveGlobal({ ...state, candidates: [...(state.candidates || []), ...stamped] });
    return stamped;
  }

  async function runBackground(event = {}) {
    if (!storage?.loadGlobal || !threadService || !roleDialogueService) return { proactive: 0, roleDialogue: 0 };
    const state = await storage.loadGlobal();
    return runSocialBackground({ state, event, threadService, roleDialogueService });
  }

  function enqueueBackgroundWork(key, task) {
    if (!key || typeof task !== 'function') return Promise.resolve();
    if (pending.has(key)) return pending.get(key);
    const work = Promise.resolve().then(task).catch((error) => {
      errors.push({ key, error });
      return [];
    }).finally(() => pending.delete(key));
    pending.set(key, work);
    return work;
  }

  return {
    register() {
      for (const type of RUNTIME_EVENTS) tavo?.plugin?.on?.(type, handlers[type]);
      return this;
    },
    handlers,
    flush: () => Promise.all([...pending.values()]),
    runDetection,
    runBackground,
    errors,
    adapter,
    storage,
  };
}
