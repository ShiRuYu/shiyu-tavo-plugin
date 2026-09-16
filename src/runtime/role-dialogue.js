function clip(value, max) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function createRoleDialogueService({ adapter, threadService }) {
  return {
    async generateExchange({ threadId, speakerId, speakerName, context, maxChars = 600 }) {
      const prompt = [
        `你正在生成角色“${speakerName}”在角色间聊天中的下一条消息。`,
        '只输出这一条消息，不要加旁白、标题或其他角色的台词。',
        `剧情/聊天上下文：${clip(context, 1800)}`,
      ].join('\n');
      const generated = await adapter.oneOffGenerate(prompt, {
        context: false,
        settings: { maxCompletionTokens: 180 },
      });
      const content = clip(generated, maxChars);
      if (!content) throw new Error('Role dialogue generation returned empty content');
      const draft = {
        authorId: speakerId,
        role: 'character',
        content,
        unread: true,
      };
      return (await threadService.appendMessage(threadId, draft)) || draft;
    },
  };
}
