const API_ROOT = 'https://api.github.com';

export function normalizePath(value) {
  return String(value || '').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean).join('/');
}

export function normalizeRef(value, fallback = 'main') {
  const ref = decodeURIComponent(String(value || '').trim()) || fallback;
  return ref.replace(/^refs\/(?:heads|tags)\//, '');
}

export function isSafePath(value) {
  const path = String(value || '');
  return !path.startsWith('/') && !path.includes('\\') && !path.split('/').includes('..');
}

export function parseRepositorySource(value, defaultBranch = 'main') {
  const input = String(value || '').trim();
  if (!input) return { owner: '', repo: '', branch: normalizeRef(defaultBranch), path: '' };
  let url;
  try { url = new URL(input.includes('://') ? input : `https://github.com/${input}`); } catch { return { owner: '', repo: '', branch: normalizeRef(defaultBranch), path: '' }; }
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  if (host === 'raw.githubusercontent.com') {
    if (parts.length < 3) return { owner: '', repo: '', branch: normalizeRef(defaultBranch), path: '' };
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, ''), branch: normalizeRef(parts[2], defaultBranch), path: normalizePath(parts.slice(3).map(decodeURIComponent).join('/')) };
  }
  if (host !== 'github.com' || parts.length < 2) return { owner: '', repo: '', branch: normalizeRef(defaultBranch), path: '' };
  const source = { owner: parts[0], repo: parts[1].replace(/\.git$/, ''), branch: normalizeRef(defaultBranch), path: '' };
  if (parts[2] === 'tree' || parts[2] === 'blob') {
    if (!parts[3]) return { owner: '', repo: '', branch: normalizeRef(defaultBranch), path: '' };
    source.branch = normalizeRef(parts[3], defaultBranch);
    source.path = normalizePath(parts.slice(4).map(decodeURIComponent).join('/'));
  }
  return source;
}

export function parseRepositoryInput(value) {
  const source = parseRepositorySource(value);
  return { owner: source.owner, repo: source.repo };
}

function repositoryParts(config = {}) {
  const parsed = parseRepositorySource(config.repository || [config.owner, config.repo].filter(Boolean).join('/'), config.branch || 'main');
  return {
    owner: config.owner || parsed.owner,
    repo: config.repo || parsed.repo,
    branch: normalizeRef(config.branch || parsed.branch),
    path: normalizePath(config.rootPath || parsed.path),
  };
}

function encodePath(path) {
  return normalizePath(path).split('/').filter(Boolean).map((part) => encodeURIComponent(part)).join('/');
}

function decodeBase64(value) {
  const normalized = String(value || '').replace(/\s/g, '');
  if (typeof atob === 'function') {
    const bytes = Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function sourceUrl(source, path, kind = 'blob') {
  const suffix = encodePath(path);
  return `https://github.com/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/${kind}/${encodeURIComponent(source.branch)}${suffix ? `/${suffix}` : ''}`;
}

export class GitHubClient {
  constructor({ fetchImpl = globalThis.fetch, apiRoot = API_ROOT, timeoutMs = 12000, retryDelayMs = 250 } = {}) {
    this.fetchImpl = fetchImpl;
    this.apiRoot = apiRoot.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
    this.retryDelayMs = retryDelayMs;
  }

  headers(config) {
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (config?.token) headers.Authorization = `Bearer ${config.token}`;
    return headers;
  }

  async request(config, path, attempt = 0) {
    const { owner, repo } = repositoryParts(config);
    if (!owner || !repo) {
      const error = new Error('GitHub repository is required (owner/repo or URL)');
      error.code = 'github_config';
      throw error;
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : null;
    try {
      const response = await this.fetchImpl(`${this.apiRoot}${path}`, {
        headers: this.headers(config),
        signal: controller?.signal,
      });
      if ((response.status === 408 || response.status === 429 || response.status >= 500) && attempt < 1) {
        if (this.retryDelayMs) await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
        return this.request(config, path, attempt + 1);
      }
      if (!response.ok) {
        const error = new Error(`GitHub request failed (${response.status})`);
        error.code = response.status === 401 ? 'github_auth' : response.status === 403 ? 'github_rate_limit' : response.status === 404 ? 'github_not_found' : 'github_http';
        error.status = response.status;
        error.rateLimitReset = response.headers?.get?.('x-ratelimit-reset') || null;
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
      if (timer) clearTimeout(timer);
    }
  }

  async testConnection(config) {
    const { owner, repo } = repositoryParts(config);
    const data = await this.request(config, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
    return { ok: true, fullName: data.full_name, defaultBranch: data.default_branch };
  }

  async listDirectory(config, path = '') {
    const source = repositoryParts(config);
    const directory = normalizePath(path || source.path);
    if (!isSafePath(directory)) {
      const error = new Error('Unsafe repository path');
      error.code = 'github_path';
      throw error;
    }
    const suffix = encodePath(directory);
    const data = await this.request(config, `/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/contents${suffix ? `/${suffix}` : ''}?ref=${encodeURIComponent(source.branch)}`);
    const list = Array.isArray(data) ? data : [data];
    return list.filter(Boolean).map((entry) => ({
      name: String(entry.name || '').trim(),
      path: normalizePath(entry.path),
      type: entry.type === 'directory' ? 'dir' : entry.type,
      size: Number(entry.size) || 0,
      sha: entry.sha || '',
      downloadUrl: entry.download_url || '',
      htmlUrl: entry.html_url || sourceUrl(source, entry.path, entry.type === 'directory' || entry.type === 'dir' ? 'tree' : 'blob'),
    }));
  }

  async listFiles(config) {
    const source = repositoryParts(config);
    const data = await this.request(config, `/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/git/trees/${encodeURIComponent(source.branch)}?recursive=1`);
    const root = source.path;
    return (data.tree || []).filter((item) => item.type === 'blob' && (!root || item.path === root || item.path.startsWith(`${root}/`)));
  }

  async readFile(config, path) {
    const source = repositoryParts(config);
    const normalizedPath = normalizePath(path || source.path);
    if (!isSafePath(normalizedPath)) {
      const error = new Error('Unsafe repository path');
      error.code = 'github_path';
      throw error;
    }
    const data = await this.request(config, `/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/contents/${encodePath(normalizedPath)}?ref=${encodeURIComponent(source.branch)}`);
    const isBinary = /\.(png|webp|jpe?g|gif)$/i.test(normalizedPath);
    return {
      path: normalizedPath,
      name: data.name || normalizedPath.split('/').pop(),
      text: isBinary ? '' : decodeBase64(data.content),
      base64: isBinary ? undefined : data.content,
      bytesBase64: isBinary ? data.content : undefined,
      sha: data.sha,
      size: data.size,
      sourceUrl: data.html_url || sourceUrl(source, normalizedPath),
    };
  }
}
