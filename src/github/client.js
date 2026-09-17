const API_ROOT = 'https://api.github.com';

export function parseRepositoryInput(value) {
  const input = String(value || '').trim().replace(/\/$/, '');
  if (!input) return { owner: '', repo: '' };
  try {
    const url = new URL(input.includes('://') ? input : `https://github.com/${input}`);
    if (url.hostname.toLowerCase() !== 'github.com') return { owner: '', repo: '' };
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return { owner: '', repo: '' };
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') };
  } catch {
    return { owner: '', repo: '' };
  }
}

function repositoryParts(config) {
  const parsed = parseRepositoryInput(config?.repository);
  return {
    owner: config?.owner || parsed.owner,
    repo: config?.repo || parsed.repo,
  };
}

function encodePath(path) {
  return path.split('/').filter(Boolean).map((part) => encodeURIComponent(part)).join('/');
}

function decodeBase64(value) {
  const normalized = String(value || '').replace(/\s/g, '');
  if (typeof atob === 'function') {
    const bytes = Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(normalized, 'base64').toString('utf8');
}

export class GitHubClient {
  constructor({ fetchImpl = globalThis.fetch, apiRoot = API_ROOT, timeoutMs = 12000 } = {}) {
    this.fetchImpl = fetchImpl;
    this.apiRoot = apiRoot.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
  }

  headers(config) {
    const headers = { Accept: 'application/vnd.github+json' };
    if (config?.token) headers.Authorization = `Bearer ${config.token}`;
    return headers;
  }

  async request(config, path) {
    const { owner, repo } = repositoryParts(config);
    if (!owner || !repo) {
      const error = new Error('GitHub repository is required (owner/repo or URL)');
      error.code = 'github_config';
      throw error;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.apiRoot}${path}`, {
        headers: this.headers(config),
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = new Error(`GitHub request failed (${response.status})`);
        error.code = response.status === 401 ? 'github_auth' : response.status === 403 ? 'github_rate_limit' : response.status === 404 ? 'github_not_found' : 'github_http';
        error.status = response.status;
        throw error;
      }
      return response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        const timeout = new Error('GitHub request timed out');
        timeout.code = 'github_timeout';
        throw timeout;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async testConnection(config) {
    const { owner, repo } = repositoryParts(config);
    const data = await this.request(config, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
    return { ok: true, fullName: data.full_name, defaultBranch: data.default_branch };
  }

  async listFiles(config) {
    const { owner, repo } = repositoryParts(config);
    const branch = encodeURIComponent(config.branch || 'main');
    const data = await this.request(config, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${branch}?recursive=1`);
    const root = (config.rootPath || '').replace(/^\/+|\/+$/g, '');
    return (data.tree || []).filter((item) => item.type === 'blob' && (!root || item.path === root || item.path.startsWith(`${root}/`)));
  }

  async readFile(config, path) {
    const { owner, repo } = repositoryParts(config);
    const branch = encodeURIComponent(config.branch || 'main');
    const data = await this.request(config, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}?ref=${branch}`);
    const isBinary = /\.(png|webp|jpe?g|gif)$/i.test(path);
    return { path, text: isBinary ? '' : decodeBase64(data.content), base64: isBinary ? undefined : data.content, bytesBase64: isBinary ? data.content : undefined, sha: data.sha, size: data.size };
  }
}
