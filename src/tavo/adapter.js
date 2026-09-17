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
  const resourceApi = (kind) => ({ character: tavo?.character, lorebook: tavo?.lorebook, preset: tavo?.preset, regex: tavo?.regex }[kind]);
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
    async createRegex(regex, requestId) {
      if (!tavo?.regex?.create) throw new Error('Tavo regex API is unavailable');
      return tavo.regex.create(regex, optionsWithRequestId(requestId));
    },
    async importResource(kind, resource, requestId) {
      const api = resourceApi(kind);
      if (!api) throw new Error(`Tavo ${kind} API is unavailable`);
      if (typeof api.import === 'function') return api.import(resource, optionsWithRequestId(requestId));
      const method = { character: 'createCharacter', lorebook: 'createLorebook', preset: 'createPreset', regex: 'createRegex' }[kind];
      if (method && typeof this[method] === 'function') return this[method](resource, requestId);
      throw new Error(`Tavo ${kind} import API is unavailable`);
    },
    async findResource(kind, name) {
      const api = resourceApi(kind);
      if (!api) return [];
      if (typeof api.find === 'function') return api.find(name, { match: 'exact' });
      if (kind === 'character' && typeof api.search === 'function') return api.search({ name, match: 'exact' });
      return [];
    },
    async getResource(kind, id) {
      const api = resourceApi(kind);
      return typeof api?.get === 'function' ? api.get(id) : null;
    },
    async updateResource(kind, resource) {
      const api = resourceApi(kind);
      if (typeof api?.update !== 'function') throw new Error(`Tavo ${kind} update API is unavailable`);
      return api.update(resource);
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
