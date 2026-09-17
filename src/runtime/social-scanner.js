import { shouldProactivelyMessage } from './proactive.js';

function messageText(messages) {
  return messages.slice(-12).map((message) => `[${message.role || (message.isUser ? 'user' : 'assistant')}] ${message.content || ''}`).join('\n');
}
function presentCharacters(messages) {
  return [...new Set(messages.slice(-8).flatMap((message) => [message.characterId, ...(message.characterIds || [])].filter(Boolean).map(Number)))];
}

export async function runSocialBackground({ state, event = {}, threadService, roleDialogueService, force = false }) {
  if (!state || !threadService || !roleDialogueService) return { proactive: 0, roleDialogue: 0 };
  if (!force && state.wechat?.autoScanEnabled === false) return { proactive: 0, roleDialogue: 0 };
  const current = (state.identities || []).find((identity) => identity.id === state.activeIdentityId);
  if (!current) return { proactive: 0, roleDialogue: 0 };
  const contacts = (state.identities || []).filter((identity) => identity.kind === 'character' && identity.id !== current.id && identity.characterId);
  const eventAt = event.at || new Date().toISOString();
  const presentCharacterIds = event.presentCharacterIds || [];
  let proactive = 0;
  if (current.settings?.proactiveEnabled) {
    for (const contact of contacts) {
      const existingThread = Object.values(state.threads || {}).find((thread) => thread.identityId === current.id && thread.kind === 'user-character' && thread.participantIds.includes(contact.characterId));
      const decision = shouldProactivelyMessage({
        contact: { id: contact.characterId, lastContactAt: existingThread?.lastContactAt },
        event: { ...event, at: eventAt, presentCharacterIds },
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

export function createSocialScanner({ adapter, storage, threadService, roleDialogueService, now = () => new Date().toISOString() }) {
  return {
    async scan(chatId = null) {
      if (!adapter?.listMessages || !storage?.loadGlobal) return { proactive: 0, roleDialogue: 0 };
      const chat = chatId ?? (await adapter.currentChat?.());
      const resolvedChatId = typeof chat === 'object' ? chat?.id : chat;
      if (!resolvedChatId) return { proactive: 0, roleDialogue: 0 };
      const messages = await adapter.listMessages(resolvedChatId);
      const state = await storage.loadGlobal();
      return runSocialBackground({
        state,
        threadService,
        roleDialogueService,
        force: true,
        event: { chatId: resolvedChatId, text: messageText(messages), at: now(), presentCharacterIds: presentCharacters(messages) },
      });
    },
  };
}
