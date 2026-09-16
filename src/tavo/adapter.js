function getText(result) {
  if (typeof result === 'string') return result;
  if (result && typeof result.text === 'string') return result.text;
  if (result && typeof result.content === 'string') return result.content;
  return result ?? '';
}

function optionsWithRequestId(requestId) {
  return requestId ? { clientRequestId: requestId } : undefined;
}

export function createTavoAdapter(tavo) {
  return {
    async currentChat() {
      return tavo?.chat?.current?.() ?? null;
    },
    async listMessages(chatId, query = {}) {
      if (tavo?.message?.find) return tavo.message.find(query.range || [-100, -1], query.filter || {});
      return [];
    },
    async oneOffGenerate(prompt, options = {}) {
      if (!tavo?.generate) throw new Error('Tavo generation API is unavailable');
      return getText(await tavo.generate(prompt, options));
    },
    async findCharacters(query = {}) {
      return tavo?.character?.search ? tavo.character.search(query) : [];
    },
    async createCharacter(character, requestId) {
      if (!tavo?.character?.create) throw new Error('Tavo character API is unavailable');
      return tavo.character.create(character, optionsWithRequestId(requestId));
    },
    async createPersona(persona, requestId) {
      if (!tavo?.persona?.create) throw new Error('Tavo persona API is unavailable');
      return tavo.persona.create(persona, optionsWithRequestId(requestId));
    },
    async createLorebook(lorebook, requestId) {
      if (!tavo?.lorebook?.create) throw new Error('Tavo lorebook API is unavailable');
      return tavo.lorebook.create(lorebook, optionsWithRequestId(requestId));
    },
    async createPreset(preset, requestId) {
      if (!tavo?.preset?.create) throw new Error('Tavo preset API is unavailable');
      return tavo.preset.create(preset, optionsWithRequestId(requestId));
    },
    async appendMessage(chatId, message, requestId) {
      if (!tavo?.message?.append) throw new Error('Tavo message API is unavailable');
      return tavo.message.append({ ...message, chatId }, optionsWithRequestId(requestId));
    },
    async generateChat(chatId, prompt, options = {}) {
      return this.oneOffGenerate(prompt, { ...options, context: options.context ?? false, chatId });
    },
  };
}
