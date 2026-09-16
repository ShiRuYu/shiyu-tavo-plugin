import { classifyResource } from './classifier.js';

export function createImportService({ client, adapter }) {
  return {
    async importFile({ config, path, conflict = 'new' }) {
      if (conflict === 'skip') return { path, skipped: true, reason: 'conflict_policy' };
      const file = await client.readFile(config, path);
      const classification = classifyResource(file);
      if (classification.kind === 'unknown' || !classification.parsed) {
        const error = new Error(classification.warnings.join('；') || 'Unsupported resource');
        error.code = 'unsupported_format';
        throw error;
      }
      const requestId = `github:${path}:${conflict}`;
      let resource;
      if (classification.kind === 'character') resource = await adapter.createCharacter(classification.parsed, requestId);
      else if (classification.kind === 'lorebook') resource = await adapter.createLorebook(classification.parsed, requestId);
      else resource = await adapter.createPreset(classification.parsed, requestId);
      return { path, kind: classification.kind, resource, conflict };
    },
  };
}
