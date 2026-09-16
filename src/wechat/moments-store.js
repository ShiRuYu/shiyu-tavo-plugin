export function createMomentsService({ storage, now = () => Date.now() }) {
  return {
    async createMoment(identityId, post) {
      const state = await storage.loadGlobal();
      const moment = {
        id: `moment:${now()}:${(state.moments || []).length + 1}`,
        identityId,
        text: String(post?.text || '').trim(),
        createdAt: new Date(now()).toISOString(),
        source: post?.source || (identityId.startsWith('character:') ? 'role' : 'user'),
        relatedChatId: post?.relatedChatId ?? null,
      };
      if (!moment.text) throw new Error('Moment text is required');
      await storage.saveGlobal({ ...state, moments: [...(state.moments || []), moment] });
      return moment;
    },
    async listFeed() {
      const state = await storage.loadGlobal();
      return [...(state.moments || [])].sort((a, b) => {
        const byDate = String(b.createdAt).localeCompare(String(a.createdAt));
        return byDate || String(b.id).localeCompare(String(a.id));
      });
    },
  };
}
