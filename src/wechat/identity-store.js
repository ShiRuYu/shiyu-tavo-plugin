export function createIdentityService({ storage, adapter }) {
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
        error.code = 'identity_not_found';
        throw error;
      }
      await storage.saveGlobal({ ...state, activeIdentityId: identityId });
      return identity;
    },
    async ensureShadowPersona(identity) {
      if (identity?.personaId) return identity.personaId;
      if (!identity?.name) throw new Error('Identity name is required');
      const persona = await adapter.createPersona({
        name: `手机身份 · ${identity.name}`,
        description: identity.profile?.bio || `由小手机为 ${identity.name} 创建的身份。`,
        active: false,
      }, `identity:${identity.id}`);
      const state = await storage.loadGlobal();
      const identities = (state.identities || []).map((item) => item.id === identity.id ? { ...item, personaId: persona.id } : item);
      await storage.saveGlobal({ ...state, identities });
      return persona.id;
    },
  };
}
