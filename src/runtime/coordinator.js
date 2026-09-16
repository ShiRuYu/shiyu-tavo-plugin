import { countCompletedRounds, recentRoundMessages } from '../detection/round-counter.js';
import { detectNewRoles as defaultDetectNewRoles } from '../detection/role-detector.js';
import { prepareMainChatText } from './main-chat-link.js';
import { shouldProactivelyMessage } from './proactive.js';

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
    const current = (state.identities || []).find((identity) => identity.id === state.activeIdentityId);
    if (!current) return { proactive: 0, roleDialogue: 0 };
    const contacts = (state.identities || []).filter((identity) => identity.kind === 'character' && identity.id !== current.id && identity.characterId);
    const eventAt = event.at || new Date().toISOString();
    let proactive = 0;
    if (current.settings?.proactiveEnabled) {
      for (const contact of contacts) {
        const existingThread = Object.values(state.threads || {}).find((thread) => thread.identityId === current.id && thread.kind === 'user-character' && thread.participantIds.includes(contact.characterId));
        const decision = shouldProactivelyMessage({
          contact: { id: contact.characterId, lastContactAt: existingThread?.lastContactAt },
          event: { ...event, at: eventAt, presentCharacterIds: event.presentCharacterIds || [] },
          settings: { enabled: contact.settings?.proactiveEnabled !== false, probability: current.settings.proactiveProbability ?? 1, cooldownMinutes: current.settings.proactiveCooldownMinutes ?? 30, absentAfterHours: current.settings.proactiveAbsentAfterHours ?? 24 },
        });
        if (!decision.allowed) continue;
        const thread = await threadService.getOrCreateThread({ identityId: current.id, kind: 'user-character', participantIds: [contact.characterId], title: contact.name });
        await roleDialogueService.generateExchange({ threadId: thread.id, speakerId: contact.characterId, speakerName: contact.name, context: event.text || '' });
        proactive += 1;
        break;
      }
    }
    let roleDialogue = 0;
    if (current.settings?.roleDialogueEnabled && contacts.length >= 2) {
      const [first, second] = contacts;
      const thread = await threadService.getOrCreateThread({ identityId: current.id, kind: 'character-character', participantIds: [first.characterId, second.characterId], title: `${first.name} 与 ${second.name}` });
      await roleDialogueService.generateExchange({ threadId: thread.id, speakerId: first.characterId, speakerName: first.name, context: event.text || '' });
      roleDialogue = 1;
    }
    return { proactive, roleDialogue };
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
