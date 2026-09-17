(() => {
  // src/tavo/adapter.js
  function getText(result) {
    if (typeof result === "string") return result;
    if (result && typeof result.text === "string") return result.text;
    if (result && typeof result.content === "string") return result.content;
    return result ?? "";
  }
  function optionsWithRequestId(requestId) {
    return requestId ? { clientRequestId: requestId } : void 0;
  }
  function createTavoAdapter(tavo2) {
    return {
      async currentChat() {
        return tavo2?.chat?.current?.() ?? null;
      },
      async listMessages(chatId, query = {}) {
        if (tavo2?.message?.find) return tavo2.message.find(query.range || [-100, -1], query.filter || {});
        return [];
      },
      async oneOffGenerate(prompt, options = {}) {
        if (!tavo2?.generate) throw new Error("Tavo generation API is unavailable");
        return getText(await tavo2.generate(prompt, options));
      },
      async findCharacters(query = {}) {
        return tavo2?.character?.search ? tavo2.character.search(query) : [];
      },
      async createCharacter(character, requestId) {
        if (!tavo2?.character?.create) throw new Error("Tavo character API is unavailable");
        return tavo2.character.create(character, optionsWithRequestId(requestId));
      },
      async createPersona(persona, requestId) {
        if (!tavo2?.persona?.create) throw new Error("Tavo persona API is unavailable");
        return tavo2.persona.create(persona, optionsWithRequestId(requestId));
      },
      async createLorebook(lorebook, requestId) {
        if (!tavo2?.lorebook?.create) throw new Error("Tavo lorebook API is unavailable");
        return tavo2.lorebook.create(lorebook, optionsWithRequestId(requestId));
      },
      async createPreset(preset, requestId) {
        if (!tavo2?.preset?.create) throw new Error("Tavo preset API is unavailable");
        return tavo2.preset.create(preset, optionsWithRequestId(requestId));
      },
      async appendMessage(chatId, message, requestId) {
        if (!tavo2?.message?.append) throw new Error("Tavo message API is unavailable");
        return tavo2.message.append({ ...message, chatId }, optionsWithRequestId(requestId));
      },
      async generateChat(chatId, prompt, options = {}) {
        return this.oneOffGenerate(prompt, { ...options, context: options.context ?? false, chatId });
      }
    };
  }

  // src/core/storage.js
  var STATE_KEY = "shiyuPhone.state";
  var CHAT_LINK_PREFIX = "shiyuPhone.chat.";
  var DEFAULT_PHONE_STATE = {
    schemaVersion: 1,
    activeIdentityId: "user:default",
    identities: [{
      id: "user:default",
      kind: "user",
      name: "\u7528\u6237",
      profile: { bio: "" },
      settings: { proactiveEnabled: false, roleDialogueEnabled: false }
    }],
    candidates: [],
    threads: {},
    moments: [],
    github: { repository: "", branch: "main", token: "" },
    detection: { enabled: true, roundThreshold: 5, recentWindowRounds: 5 }
  };
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
  function mergeDefaults(value) {
    const input = value && typeof value === "object" ? value : {};
    return {
      ...clone(DEFAULT_PHONE_STATE),
      ...input,
      identities: Array.isArray(input.identities) && input.identities.length ? input.identities : clone(DEFAULT_PHONE_STATE.identities),
      threads: input.threads && typeof input.threads === "object" ? input.threads : {},
      moments: Array.isArray(input.moments) ? input.moments : [],
      github: {
        ...clone(DEFAULT_PHONE_STATE.github),
        ...input.github || {},
        repository: input.github?.repository || [input.github?.owner, input.github?.repo].filter(Boolean).join("/")
      },
      detection: { ...clone(DEFAULT_PHONE_STATE.detection), ...input.detection || {} }
    };
  }
  async function variableGet(variable, scope, name, chatId) {
    if (!variable?.get) return null;
    const options = scope === "chat" ? { scope, chatId } : { scope };
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
    if (!variable?.set) throw new Error("Tavo variable API is unavailable");
    const options = scope === "chat" ? { scope, chatId } : { scope };
    try {
      return await variable.set(name, value, options);
    } catch {
      return variable.set(scope, name, value, chatId);
    }
  }
  function createStorage(tavo2) {
    const variable = tavo2?.variable;
    return {
      async loadGlobal() {
        return mergeDefaults(await variableGet(variable, "global", STATE_KEY));
      },
      async saveGlobal(state) {
        await variableSet(variable, "global", STATE_KEY, mergeDefaults(state));
      },
      async loadChatLink(chatId) {
        const value = await variableGet(variable, "chat", `${CHAT_LINK_PREFIX}${chatId}`, chatId);
        return value && typeof value === "object" ? value : {
          chatId,
          completedRounds: 0,
          lastAnalyzedMessageId: null,
          digest: ""
        };
      },
      async saveChatLink(chatId, patch) {
        const current = await this.loadChatLink(chatId);
        await variableSet(variable, "chat", `${CHAT_LINK_PREFIX}${chatId}`, { ...current, ...patch }, chatId);
      }
    };
  }

  // src/detection/round-counter.js
  function roleOf(message) {
    if (message?.role) return message.role;
    return message?.isUser ? "user" : "assistant";
  }
  function stableMessages(messages) {
    return [...Array.isArray(messages) ? messages : []].filter((message) => message && !message.hidden && !message.temporary).sort((a, b) => Number(a.id ?? a.index ?? 0) - Number(b.id ?? b.index ?? 0));
  }
  function countCompletedRounds(messages) {
    let waitingForReply = false;
    let rounds = 0;
    for (const message of stableMessages(messages)) {
      const role = roleOf(message);
      if (role === "user") waitingForReply = true;
      else if (role === "assistant" && waitingForReply) {
        rounds += 1;
        waitingForReply = false;
      }
    }
    return rounds;
  }
  function recentRoundMessages(messages, roundCount) {
    const stable = stableMessages(messages);
    if (!Number.isFinite(roundCount) || roundCount <= 0) return [];
    const target = Math.floor(roundCount);
    let completed = 0;
    let waitingForReply = false;
    let start = stable.length;
    for (let index = stable.length - 1; index >= 0; index -= 1) {
      const role = roleOf(stable[index]);
      if (role === "assistant") {
        completed += 1;
        waitingForReply = true;
      } else if (role === "user" && waitingForReply) {
        waitingForReply = false;
        if (completed >= target) {
          start = index;
          break;
        }
      }
    }
    return stable.slice(start);
  }

  // src/detection/role-detector.js
  function asText(value) {
    return typeof value === "string" ? value.trim() : "";
  }
  function asStringList(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
  }
  function normalizeCandidate(raw) {
    if (!raw || typeof raw !== "object" || !asText(raw.name)) return null;
    return {
      name: asText(raw.name),
      aliases: asStringList(raw.aliases),
      description: asText(raw.description),
      personality: asText(raw.personality),
      scenario: asText(raw.scenario),
      first_mes: asText(raw.first_mes || raw.firstMessage),
      tags: asStringList(raw.tags),
      evidence: asText(raw.evidence),
      confidence: Number.isFinite(Number(raw.confidence)) ? Number(raw.confidence) : 0.5,
      status: "pending"
    };
  }
  function parseDetectorResponse(text) {
    const source = asText(text).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    if (!source) return [];
    try {
      const parsed = JSON.parse(source);
      const list = Array.isArray(parsed) ? parsed : parsed?.candidates;
      return Array.isArray(list) ? list.map(normalizeCandidate).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  function promptFor({ messages, knownNames }) {
    const transcript = messages.map((message) => {
      const role = message.role || (message.isUser ? "user" : "assistant");
      return `[${role}] ${message.content || ""}`;
    }).join("\n");
    return [
      "\u8BC6\u522B\u8FD9\u6BB5\u5267\u60C5\u4E2D\u9996\u6B21\u51FA\u73B0\u3001\u4E14\u4E0D\u5728\u5DF2\u77E5\u89D2\u8272\u540D\u5355\u4E2D\u7684\u91CD\u8981\u89D2\u8272\u3002\u53EA\u8F93\u51FA JSON\uFF0C\u4E0D\u8981\u89E3\u91CA\u3002",
      'JSON \u683C\u5F0F\uFF1A{"candidates":[{"name":"","aliases":[],"description":"","personality":"","scenario":"","first_mes":"","tags":[],"evidence":"","confidence":0.0}]}',
      `\u5DF2\u77E5\u89D2\u8272\uFF1A${knownNames.join("\u3001") || "\u65E0"}`,
      `\u5267\u60C5\uFF1A
${transcript}`
    ].join("\n\n");
  }
  async function detectNewRoles({ messages = [], knownCharacters = [], existingCandidates = [], oneOffGenerate }) {
    if (typeof oneOffGenerate !== "function" || !messages.length) return [];
    const knownNames = knownCharacters.flatMap((character) => [character.name, ...character.aliases || []]).filter(Boolean);
    const existingNames = existingCandidates.flatMap((candidate) => [candidate.name, ...candidate.aliases || []]).filter(Boolean);
    const blocked = new Set([...knownNames, ...existingNames].map((name) => String(name).trim().toLocaleLowerCase()));
    const raw = await oneOffGenerate(promptFor({ messages, knownNames }), { context: false });
    const seen = /* @__PURE__ */ new Set();
    return parseDetectorResponse(raw).filter((candidate) => {
      const key = candidate.name.toLocaleLowerCase();
      if (blocked.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // src/runtime/main-chat-link.js
  function prepareMainChatText(text, digests, maxChars = 1800) {
    const clean = (Array.isArray(digests) ? digests : []).filter(Boolean).join("\n");
    if (!clean) return String(text || "");
    const bounded = clean.length > maxChars ? `${clean.slice(0, maxChars - 1)}\u2026` : clean;
    return `${String(text || "")}

<shiyu-phone-context>
${bounded}
</shiyu-phone-context>`;
  }

  // src/runtime/proactive.js
  function shouldProactivelyMessage({ contact, event, settings = {}, random = Math.random }) {
    if (!settings.enabled) return { allowed: false, reason: "disabled" };
    const present = new Set(event?.presentCharacterIds || []);
    if (present.has(contact?.id)) return { allowed: false, reason: "same_scene" };
    const at = Date.parse(event?.at || (/* @__PURE__ */ new Date()).toISOString());
    const last = contact?.lastContactAt ? Date.parse(contact.lastContactAt) : 0;
    const elapsedMinutes = last ? Math.max(0, at - last) / 6e4 : Infinity;
    if (elapsedMinutes < Number(settings.cooldownMinutes ?? 30)) return { allowed: false, reason: "cooldown" };
    const elapsedHours = elapsedMinutes / 60;
    if (Number.isFinite(elapsedHours) && elapsedHours < Number(settings.absentAfterHours ?? 24)) {
      return { allowed: false, reason: "recently_contacted" };
    }
    if (random() > Number(settings.probability ?? 0.2)) return { allowed: false, reason: "probability" };
    return { allowed: true, reason: "eligible" };
  }

  // src/runtime/coordinator.js
  var RUNTIME_EVENTS = [
    "chat:opened",
    "chat:updated",
    "message:added",
    "generation:prepare",
    "generation:success"
  ];
  function createRuntimeCoordinator({ tavo: tavo2, adapter, storage, detectionService, threadService, roleDialogueService }) {
    let activeChatId = null;
    const pending = /* @__PURE__ */ new Map();
    const errors = [];
    const handlers = {
      "chat:opened": async (event = {}) => {
        activeChatId = event.chatId ?? activeChatId ?? (await adapter?.currentChat?.())?.id ?? null;
        if (activeChatId) await storage?.loadChatLink?.(activeChatId);
      },
      "chat:updated": async () => void 0,
      "message:added": async (event = {}) => {
        if (event.role === "assistant" || event.isUser === false) {
          enqueueBackgroundWork(`detect:${event.chatId ?? activeChatId}`, () => runDetection(event.chatId ?? activeChatId));
        }
      },
      "generation:prepare": async (event) => {
        if (!event || typeof event.text !== "string") return;
        const chatId = event.chatId ?? activeChatId;
        const link = chatId ? await storage?.loadChatLink?.(chatId) : null;
        event.text = prepareMainChatText(event.text, link?.digest ? [link.digest] : []);
      },
      "generation:success": async (event = {}) => {
        enqueueBackgroundWork(`detect:${event.chatId ?? activeChatId}`, () => runDetection(event.chatId ?? activeChatId));
        enqueueBackgroundWork(`social:${event.chatId ?? activeChatId}`, () => runBackground(event));
      }
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
      const found = await (detectionService?.detectNewRoles || detectNewRoles)({
        messages: recent,
        knownCharacters: knownCharacters || [],
        existingCandidates: state.candidates || [],
        oneOffGenerate: adapter.oneOffGenerate
      });
      if (!found.length) return [];
      const stamped = found.map((candidate, index) => ({
        ...candidate,
        id: `candidate:${chatId}:${completedRounds}:${index}`,
        chatId,
        detectedAt: (/* @__PURE__ */ new Date()).toISOString()
      }));
      await storage.saveGlobal({ ...state, candidates: [...state.candidates || [], ...stamped] });
      return stamped;
    }
    async function runBackground(event = {}) {
      if (!storage?.loadGlobal || !threadService || !roleDialogueService) return { proactive: 0, roleDialogue: 0 };
      const state = await storage.loadGlobal();
      const current = (state.identities || []).find((identity) => identity.id === state.activeIdentityId);
      if (!current) return { proactive: 0, roleDialogue: 0 };
      const contacts = (state.identities || []).filter((identity) => identity.kind === "character" && identity.id !== current.id && identity.characterId);
      const eventAt = event.at || (/* @__PURE__ */ new Date()).toISOString();
      let proactive = 0;
      if (current.settings?.proactiveEnabled) {
        for (const contact of contacts) {
          const existingThread = Object.values(state.threads || {}).find((thread2) => thread2.identityId === current.id && thread2.kind === "user-character" && thread2.participantIds.includes(contact.characterId));
          const decision = shouldProactivelyMessage({
            contact: { id: contact.characterId, lastContactAt: existingThread?.lastContactAt },
            event: { ...event, at: eventAt, presentCharacterIds: event.presentCharacterIds || [] },
            settings: { enabled: contact.settings?.proactiveEnabled !== false, probability: current.settings.proactiveProbability ?? 1, cooldownMinutes: current.settings.proactiveCooldownMinutes ?? 30, absentAfterHours: current.settings.proactiveAbsentAfterHours ?? 24 }
          });
          if (!decision.allowed) continue;
          const thread = await threadService.getOrCreateThread({ identityId: current.id, kind: "user-character", participantIds: [contact.characterId], title: contact.name });
          await roleDialogueService.generateExchange({ threadId: thread.id, speakerId: contact.characterId, speakerName: contact.name, context: event.text || "" });
          proactive += 1;
          break;
        }
      }
      let roleDialogue = 0;
      if (current.settings?.roleDialogueEnabled && contacts.length >= 2) {
        const [first, second] = contacts;
        const thread = await threadService.getOrCreateThread({ identityId: current.id, kind: "character-character", participantIds: [first.characterId, second.characterId], title: `${first.name} \u4E0E ${second.name}` });
        await roleDialogueService.generateExchange({ threadId: thread.id, speakerId: first.characterId, speakerName: first.name, context: event.text || "" });
        roleDialogue = 1;
      }
      return { proactive, roleDialogue };
    }
    function enqueueBackgroundWork(key, task) {
      if (!key || typeof task !== "function") return Promise.resolve();
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
        for (const type of RUNTIME_EVENTS) tavo2?.plugin?.on?.(type, handlers[type]);
        return this;
      },
      handlers,
      flush: () => Promise.all([...pending.values()]),
      runDetection,
      runBackground,
      errors,
      adapter,
      storage
    };
  }

  // src/wechat/identity-store.js
  function createIdentityService({ storage, adapter }) {
    return {
      async listIdentities() {
        const state = await storage.loadGlobal();
        return state.identities || [];
      },
      async switchIdentity(identityId) {
        const state = await storage.loadGlobal();
        const identity = (state.identities || []).find((item) => item.id === identityId);
        if (!identity) {
          const error = new Error(`Unknown phone identity: ${identityId}`);
          error.code = "identity_not_found";
          throw error;
        }
        await storage.saveGlobal({ ...state, activeIdentityId: identityId });
        return identity;
      },
      async ensureShadowPersona(identity) {
        if (identity?.personaId) return identity.personaId;
        if (!identity?.name) throw new Error("Identity name is required");
        const persona = await adapter.createPersona({
          name: `\u624B\u673A\u8EAB\u4EFD \xB7 ${identity.name}`,
          description: identity.profile?.bio || `\u7531\u5C0F\u624B\u673A\u4E3A ${identity.name} \u521B\u5EFA\u7684\u8EAB\u4EFD\u3002`,
          active: false
        }, `identity:${identity.id}`);
        const state = await storage.loadGlobal();
        const identities = (state.identities || []).map((item) => item.id === identity.id ? { ...item, personaId: persona.id } : item);
        await storage.saveGlobal({ ...state, identities });
        return persona.id;
      }
    };
  }

  // src/wechat/thread-store.js
  function threadKey({ identityId, kind, participantIds }) {
    return `thread:${identityId}:${kind}:${[...participantIds || []].map(Number).sort((a, b) => a - b).join(",")}`;
  }
  function trimText(value, max) {
    const text = String(value || "");
    return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}\u2026` : text;
  }
  function createThreadService({ storage, now = () => Date.now() }) {
    return {
      async getOrCreateThread({ identityId, kind, participantIds, title = "" }) {
        const state = await storage.loadGlobal();
        const id = threadKey({ identityId, kind, participantIds });
        const existing = state.threads?.[id];
        if (existing) return existing;
        const thread = {
          id,
          identityId,
          kind,
          participantIds: [...participantIds || []].map(Number).sort((a, b) => a - b),
          title,
          messages: [],
          digest: "",
          unread: 0,
          lastContactAt: null
        };
        await storage.saveGlobal({ ...state, threads: { ...state.threads || {}, [id]: thread } });
        return thread;
      },
      async getThread(threadId) {
        const state = await storage.loadGlobal();
        return state.threads?.[threadId] || null;
      },
      async listThreads(identityId) {
        const state = await storage.loadGlobal();
        return Object.values(state.threads || {}).filter((thread) => thread.identityId === identityId).sort((a, b) => String(b.lastContactAt || "").localeCompare(String(a.lastContactAt || "")));
      },
      async appendMessage(threadId, message) {
        const state = await storage.loadGlobal();
        const thread = state.threads?.[threadId];
        if (!thread) throw new Error(`Unknown thread: ${threadId}`);
        const nextMessage = {
          id: message.id || `${threadId}:message:${thread.messages.length + 1}`,
          authorId: message.authorId ?? null,
          role: message.role || "user",
          content: String(message.content || ""),
          createdAt: message.createdAt || new Date(now()).toISOString()
        };
        const nextThread = {
          ...thread,
          messages: [...thread.messages, nextMessage],
          lastContactAt: nextMessage.createdAt,
          unread: message.unread === false ? thread.unread : thread.unread + (nextMessage.role === "character" ? 1 : 0)
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
        if (!thread) return "";
        const digest = thread.messages.slice(-8).map((message) => `${message.role}: ${message.content}`).join("\n");
        return trimText(digest, maxChars);
      }
    };
  }

  // src/runtime/role-dialogue.js
  function clip(value, max) {
    const text = String(value || "").trim();
    return text.length > max ? `${text.slice(0, max - 1)}\u2026` : text;
  }
  function createRoleDialogueService({ adapter, threadService }) {
    return {
      async generateExchange({ threadId, speakerId, speakerName, context, maxChars = 600 }) {
        const prompt = [
          `\u4F60\u6B63\u5728\u751F\u6210\u89D2\u8272\u201C${speakerName}\u201D\u5728\u89D2\u8272\u95F4\u804A\u5929\u4E2D\u7684\u4E0B\u4E00\u6761\u6D88\u606F\u3002`,
          "\u53EA\u8F93\u51FA\u8FD9\u4E00\u6761\u6D88\u606F\uFF0C\u4E0D\u8981\u52A0\u65C1\u767D\u3001\u6807\u9898\u6216\u5176\u4ED6\u89D2\u8272\u7684\u53F0\u8BCD\u3002",
          `\u5267\u60C5/\u804A\u5929\u4E0A\u4E0B\u6587\uFF1A${clip(context, 1800)}`
        ].join("\n");
        const generated = await adapter.oneOffGenerate(prompt, {
          context: false,
          settings: { maxCompletionTokens: 180 }
        });
        const content = clip(generated, maxChars);
        if (!content) throw new Error("Role dialogue generation returned empty content");
        const draft = {
          authorId: speakerId,
          role: "character",
          content,
          unread: true
        };
        return await threadService.appendMessage(threadId, draft) || draft;
      }
    };
  }

  // src/runtime/entry-main.js
  function startShiyuPhone(tavoFacade = typeof tavo !== "undefined" ? tavo : null) {
    if (typeof tavo !== "undefined" && tavo.plugin?.i18n?.t) tavo.plugin.i18n.t("plugin.name");
    const adapter = createTavoAdapter(tavoFacade);
    const storage = createStorage(tavoFacade);
    const identityService = createIdentityService({ storage, adapter });
    const threadService = createThreadService({ storage });
    const roleDialogueService = createRoleDialogueService({ adapter, threadService });
    const coordinator = createRuntimeCoordinator({ adapter, storage, tavo: tavoFacade, identityService, threadService, roleDialogueService });
    coordinator.register();
    return coordinator;
  }
  startShiyuPhone();
})();
