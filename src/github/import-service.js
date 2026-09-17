import { parseRepositorySource, normalizePath, isSafePath } from './client.js';
import { classifyResource } from './classifier.js';

export const IMPORT_LIMITS = {
  maxFileBytes: 10 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
  maxBatch: 50,
};

const CREATE_METHODS = {
  character: 'createCharacter',
  lorebook: 'createLorebook',
  preset: 'createPreset',
  regex: 'createRegex',
};

function fileName(path) {
  return normalizePath(path).split('/').pop() || '';
}

function supportedPath(path) {
  return /\.(json|png)$/i.test(String(path || ''));
}

function sourceKey(config, path) {
  const source = parseRepositorySource(config?.repository || [config?.owner, config?.repo].filter(Boolean).join('/'), config?.branch || 'main');
  const branch = config?.branch || source.branch;
  const basePath = source.path && !config?.rootPath ? `${source.path}/${normalizePath(path)}` : normalizePath(path);
  return `${source.owner}/${source.repo}@${branch}:${normalizePath(basePath)}`;
}

function candidatePayload(candidate, name = '') {
  const normalized = candidate.normalized || candidate.parsed;
  if (!name || name === candidate.name || !normalized) return normalized;
  if (candidate.kind === 'character' && normalized.data && typeof normalized.data === 'object') return { ...normalized, data: { ...normalized.data, name } };
  return { ...normalized, name };
}

function resultId(result) {
  if (result && typeof result === 'object') return result.characterId || result.lorebookId || result.presetId || result.regexId || result.id;
  return result;
}

async function readState(storage) {
  return storage?.loadGlobal ? ((await storage.loadGlobal()) || {}) : {};
}

async function writeHistory(storage, state, history) {
  if (!storage?.saveGlobal) return;
  await storage.saveGlobal({ ...state, github: { ...(state.github || {}), importHistory: history } });
}

export function createImportService({ client, adapter, storage, limits = IMPORT_LIMITS }) {
  async function readCandidate(config, entryOrPath) {
    const entry = typeof entryOrPath === 'string' ? { path: entryOrPath, name: fileName(entryOrPath) } : entryOrPath;
    const path = normalizePath(entry?.path);
    if (!path || !isSafePath(path)) {
      const error = new Error('Unsafe repository path');
      error.code = 'github_path';
      throw error;
    }
    if (!supportedPath(path)) {
      const error = new Error('不支持的文件格式');
      error.code = 'unsupported_format';
      throw error;
    }
    if (Number(entry?.size) > limits.maxFileBytes) {
      const error = new Error('文件超过大小限制');
      error.code = 'github_size';
      throw error;
    }
    const file = await client.readFile(config, path);
    const bytes = Number(file.size) || new TextEncoder().encode(file.text || '').byteLength;
    if (bytes > limits.maxFileBytes) {
      const error = new Error('文件超过大小限制');
      error.code = 'github_size';
      throw error;
    }
    const classification = classifyResource({ ...file, path, name: entry?.name || file.name || fileName(path) });
    if (classification.kind === 'unknown' || !classification.parsed) {
      const error = new Error(classification.warnings.join('；') || 'Unsupported resource');
      error.code = 'unsupported_format';
      throw error;
    }
    return {
      sourceKey: sourceKey(config, path),
      sourceUrl: file.sourceUrl,
      kind: classification.kind,
      name: entry?.name || file.name || fileName(path),
      path,
      parsed: classification.parsed,
      normalized: classification.normalized || classification.parsed,
      size: bytes,
      sha: entry?.sha || file.sha || '',
      warnings: classification.warnings || [],
      duplicate: { kind: 'none' },
    };
  }

  async function findDuplicate(candidate, state) {
    const history = state.github?.importHistory || {};
    if (history[candidate.sourceKey]) {
      return { kind: 'source', existingId: history[candidate.sourceKey].id, existingName: history[candidate.sourceKey].name || candidate.name };
    }
    if (!adapter?.findResource) return { kind: 'none' };
    const matches = await adapter.findResource(candidate.kind, candidate.name);
    const match = Array.isArray(matches) ? matches[0] : null;
    return match ? { kind: 'name', existingId: match.id || match.characterId || match.lorebookId || match.presetId || match.regexId, existingName: match.name || candidate.name } : { kind: 'none' };
  }

  async function createResource(candidate, payload, requestId) {
    if (adapter?.importResource) return adapter.importResource(candidate.kind, payload, requestId);
    const method = CREATE_METHODS[candidate.kind];
    if (!method || typeof adapter?.[method] !== 'function') throw new Error(`Tavo ${candidate.kind} import API is unavailable`);
    return adapter[method](payload, requestId);
  }

  async function updateResource(candidate, payload) {
    if (!adapter?.updateResource) throw new Error('重复资源暂不支持更新');
    return adapter.updateResource(candidate.kind, payload, candidate.duplicate.existingId);
  }

  async function prepareFiles({ config, entries = [] }) {
    if (entries.length > limits.maxBatch) throw new Error(`最多导入 ${limits.maxBatch} 个文件`);
    const state = await readState(storage);
    const candidates = [];
    let totalBytes = 0;
    for (const entry of entries) {
      if (entry?.type && entry.type !== 'file' && entry.type !== 'blob') continue;
      const candidate = await readCandidate(config, entry);
      totalBytes += candidate.size;
      if (totalBytes > limits.maxTotalBytes) throw new Error('批量文件超过总大小限制');
      candidate.duplicate = await findDuplicate(candidate, state);
      candidates.push(candidate);
    }
    return candidates;
  }

  async function importCandidates(candidates = [], decisions = {}) {
    const state = await readState(storage);
    const history = { ...(state.github?.importHistory || {}) };
    const results = [];
    for (const candidate of candidates) {
      const choice = typeof decisions[candidate.sourceKey] === 'string' ? { decision: decisions[candidate.sourceKey] } : (decisions[candidate.sourceKey] || {});
      const decision = choice.decision || (candidate.duplicate?.kind === 'none' ? 'create' : 'skip');
      try {
        if (decision === 'skip') {
          results.push({ status: 'skipped', candidate });
          continue;
        }
        const payload = candidatePayload(candidate, decision === 'create' ? choice.newName : '');
        const result = decision === 'update'
          ? await updateResource(candidate, payload)
          : await createResource(candidate, payload, `github:${candidate.path}:${choice.requestConflict || decision}`);
        if (result === null) {
          results.push({ status: 'cancelled', candidate });
          continue;
        }
        const id = resultId(result);
        history[candidate.sourceKey] = { id, kind: candidate.kind, name: choice.newName || candidate.name, sha: candidate.sha, importedAt: new Date().toISOString() };
        results.push({ status: decision === 'update' ? 'updated' : 'created', id, resource: result, candidate });
      } catch (error) {
        results.push({ status: 'failed', candidate, error });
      }
    }
    await writeHistory(storage, state, history);
    return results;
  }

  return {
    client,
    adapter,
    isSupportedFile: supportedPath,
    readCandidate,
    prepareFiles,
    inspectFiles: prepareFiles,
    importCandidates,
    async importFile({ config, path, conflict = 'new' }) {
      const [candidate] = await prepareFiles({ config, entries: [{ path, name: fileName(path), type: 'file' }] });
      const decision = conflict === 'skip' ? 'skip' : conflict === 'update' ? 'update' : 'create';
      const [result] = await importCandidates([candidate], { [candidate.sourceKey]: { decision, requestConflict: conflict } });
      return { path, kind: candidate.kind, resource: result?.resource, conflict, status: result?.status, id: result?.id };
    },
  };
}
