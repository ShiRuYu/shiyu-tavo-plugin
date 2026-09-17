import { DEFAULT_PHONE_STATE, createStorage } from '../core/storage.js';
import { createTavoAdapter } from '../tavo/adapter.js';
import { GitHubClient, parseRepositorySource, normalizePath } from '../github/client.js';
import { createImportService } from '../github/import-service.js';
import { createIdentityService } from '../wechat/identity-store.js';
import { createThreadService } from '../wechat/thread-store.js';
import { createMomentsService } from '../wechat/moments-store.js';
import { createRoleDialogueService } from '../runtime/role-dialogue.js';
import { createSocialScanner } from '../runtime/social-scanner.js';
import { createManualDetectionService } from '../detection/manual-detection.js';
import { parseDetectorResponse } from '../detection/role-detector.js';

const APP_LABELS = [
  { id: 'characters', key: 'apps.characters', fallback: '角色管理', hint: '检测剧情中的新角色' },
  { id: 'import', key: 'apps.import', fallback: '内容导入', hint: '从 GitHub 导入资源' },
  { id: 'wechat', key: 'apps.wechat', fallback: '微信', hint: '角色聊天与朋友圈' },
];

function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(options).forEach(([key, value]) => {
    if (key === 'text') node.textContent = value;
    else if (key === 'className') node.className = value;
    else if (key === 'value') node.value = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== undefined && value !== null) node.setAttribute(key, value);
  });
  children.forEach((child) => node.append(child));
  return node;
}

function mergeState(input = {}) {
  return {
    ...JSON.parse(JSON.stringify(DEFAULT_PHONE_STATE)),
    ...input,
    identities: Array.isArray(input.identities) && input.identities.length ? input.identities : JSON.parse(JSON.stringify(DEFAULT_PHONE_STATE.identities)),
    candidates: Array.isArray(input.candidates) ? input.candidates : [],
    threads: input.threads && typeof input.threads === 'object' ? input.threads : {},
    moments: Array.isArray(input.moments) ? input.moments : [],
    github: {
      ...DEFAULT_PHONE_STATE.github,
      ...(input.github || {}),
      repository: input.github?.repository || [input.github?.owner, input.github?.repo].filter(Boolean).join('/'),
    },
    wechat: { ...(DEFAULT_PHONE_STATE.wechat || { autoScanEnabled: true }), ...(input.wechat || {}) },
    detection: { ...DEFAULT_PHONE_STATE.detection, ...(input.detection || {}) },
  };
}

export function mountPhone(root, options = {}) {
  let open = false;
  let page = 'home';
  let wechatTab = 'messages';
  let activeThreadId = null;
  let state = mergeState(options.state);
  const tavoFacade = options.tavo || (typeof tavo !== 'undefined' ? tavo : null);
  const storage = options.storage || (tavoFacade ? createStorage(tavoFacade) : null);
  const adapter = options.adapter || (tavoFacade ? createTavoAdapter(tavoFacade) : null);
  const identityService = options.identityService || (storage && adapter ? createIdentityService({ storage, adapter }) : null);
  const threadService = options.threadService || (storage ? createThreadService({ storage }) : null);
  const momentsService = options.momentsService || (storage ? createMomentsService({ storage }) : null);
  const importService = options.importService || (adapter ? createImportService({ client: new GitHubClient(), adapter, storage }) : null);
  const manualDetection = options.manualDetection || (storage && adapter ? createManualDetectionService({ adapter, storage }) : null);
  const roleDialogue = adapter && threadService ? createRoleDialogueService({ adapter, threadService }) : null;
  const socialScanner = options.socialScanner || (storage && adapter && threadService && roleDialogue ? createSocialScanner({ adapter, storage, threadService, roleDialogueService: roleDialogue }) : null);
  const localize = (key, fallback) => {
    try { return tavoFacade?.plugin?.i18n?.t?.(key) || fallback; } catch { return fallback; }
  };
  const notify = async (message) => {
    try { await tavoFacade?.utils?.toast?.(message); } catch { /* no-op in a test fixture */ }
  };
  const dragCleanups = [];
  let suppressLauncherClick = false;

  function enableDragging(node, handle = node, { onDragged } = {}) {
    const viewport = globalThis.window || document.defaultView || globalThis;
    let drag = null;
    const onPointerDown = (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      if (handle !== node && event.target?.closest?.('button')) return;
      const rect = node.getBoundingClientRect?.() || {};
      const width = rect.width || node.offsetWidth || (node === launcher ? 54 : 390);
      const height = rect.height || node.offsetHeight || (node === launcher ? 54 : 500);
      const left = Number.isFinite(rect.left) && rect.left ? rect.left : Math.max(0, (Number(viewport.innerWidth) || 800) - width - (node === launcher ? 18 : 14));
      const top = Number.isFinite(rect.top) && rect.top ? rect.top : (node === launcher ? Math.max(0, (Number(viewport.innerHeight) || 600) - height - 18) : 14);
      drag = { startX: event.clientX || 0, startY: event.clientY || 0, left, top, width, height, moved: false };
      node.style.cursor = 'grabbing';
      event.preventDefault?.();
    };
    const onPointerMove = (event) => {
      if (!drag) return;
      const dx = (event.clientX || 0) - drag.startX;
      const dy = (event.clientY || 0) - drag.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
      const maxLeft = Math.max(0, (Number(viewport.innerWidth) || 800) - drag.width);
      const maxTop = Math.max(0, (Number(viewport.innerHeight) || 600) - drag.height);
      const left = Math.min(maxLeft, Math.max(0, drag.left + dx));
      const top = Math.min(maxTop, Math.max(0, drag.top + dy));
      node.style.left = `${left}px`;
      node.style.top = `${top}px`;
      node.style.right = 'auto';
      node.style.bottom = 'auto';
      event.preventDefault?.();
    };
    const onPointerUp = () => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      node.style.cursor = 'grab';
      if (moved) onDragged?.();
    };
    handle.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener?.('pointermove', onPointerMove);
    viewport.addEventListener?.('pointerup', onPointerUp);
    viewport.addEventListener?.('pointercancel', onPointerUp);
    return () => {
      handle.removeEventListener('pointerdown', onPointerDown);
      viewport.removeEventListener?.('pointermove', onPointerMove);
      viewport.removeEventListener?.('pointerup', onPointerUp);
      viewport.removeEventListener?.('pointercancel', onPointerUp);
    };
  }

  const launcher = el('button', {
    className: 'phone-launcher',
    'aria-label': localize('runtime.openPhone', '打开小手机'),
    text: '⌂',
    onClick: () => { if (suppressLauncherClick) { suppressLauncherClick = false; return; } open = true; refresh().catch(() => {}); render(); },
  });
  const shell = el('section', { className: 'phone-shell', hidden: '' });
  const topbar = el('header', { className: 'phone-topbar' });
  const homeBack = el('button', { className: 'phone-home-button', 'data-action': 'phone-home', 'aria-label': localize('common.back', '返回手机首页'), text: '‹', hidden: '', onClick: () => { page = 'home'; wechatTab = 'messages'; activeThreadId = null; render(); } });
  const identity = el('span', { className: 'phone-identity' });
  const title = el('h2', { className: 'phone-title' });
  const close = el('button', { className: 'phone-close', 'aria-label': localize('runtime.closePhone', '关闭小手机'), text: '×', onClick: () => { open = false; render(); } });
  topbar.append(homeBack, identity, title, close);
  const content = el('main', { className: 'phone-content' });
  const nav = el('nav', { className: 'phone-nav', 'aria-label': '微信导航' });
  shell.append(topbar, content, nav);
  root.replaceChildren(launcher, shell);
  dragCleanups.push(enableDragging(launcher, launcher, { onDragged: () => { suppressLauncherClick = true; } }));
  dragCleanups.push(enableDragging(shell, topbar));

  async function refresh() {
    if (!storage?.loadGlobal) return;
    try { state = mergeState(await storage.loadGlobal()); } catch (error) { await notify(localize('runtime.error', '手机数据加载失败')); throw error; }
  }

  async function save() {
    if (storage?.saveGlobal) await storage.saveGlobal(state);
  }

  async function addCandidates(candidates, source = 'manual') {
    const stamped = (Array.isArray(candidates) ? candidates : []).filter((candidate) => candidate?.name).map((candidate, index) => ({
      ...candidate,
      id: candidate.id || `candidate:${source}:${Date.now()}:${index}`,
      status: candidate.status || 'pending',
      detectedAt: candidate.detectedAt || new Date().toISOString(),
    }));
    if (!stamped.length) return [];
    const existing = new Set((state.candidates || []).map((candidate) => String(candidate.name).toLocaleLowerCase()));
    const unique = stamped.filter((candidate) => !existing.has(String(candidate.name).toLocaleLowerCase()));
    if (!unique.length) return [];
    state.candidates = [...(state.candidates || []), ...unique];
    await save();
    return unique;
  }

  function renderHome() {
    title.textContent = '小手机';
    const grid = el('div', { className: 'phone-home-grid' });
    APP_LABELS.forEach((app) => grid.append(el('button', {
      className: 'phone-app-card',
      'data-app': app.id,
      onClick: () => { page = app.id; render(); },
    }, [el('span', { text: localize(app.key, app.fallback) }), el('small', { text: app.hint })])));
    content.replaceChildren(grid);
    nav.replaceChildren();
  }

  function candidateCard(candidate) {
    const card = el('article', { className: 'phone-card', 'data-candidate': candidate.id || candidate.name });
    const name = el('input', { className: 'candidate-name', value: candidate.name, 'aria-label': '角色名称' });
    const description = el('textarea', { className: 'candidate-description', 'aria-label': '角色描述' });
    description.value = candidate.description || '';
    const actions = el('div', { className: 'phone-row' });
    const confirm = el('button', { className: 'phone-button primary', text: '确认创建', onClick: async () => {
      if (!adapter?.createCharacter) return notify('Tavo 角色 API 暂不可用');
      confirm.disabled = true;
      try {
        const created = await adapter.createCharacter({ ...candidate, name: name.value.trim(), description: description.value.trim() }, candidate.id || `candidate:${Date.now()}`);
        state.candidates = state.candidates.filter((item) => item.id !== candidate.id);
        if (created?.id) state.identities.push({ id: `character:${created.id}`, kind: 'character', characterId: created.id, name: created.name || name.value.trim(), profile: { bio: description.value.trim() }, settings: { proactiveEnabled: false, roleDialogueEnabled: false } });
        await save();
        render();
      } catch (error) { confirm.disabled = false; await notify(error.message || '角色创建失败'); }
    } });
    const ignore = el('button', { className: 'phone-button', text: '忽略', onClick: async () => { state.candidates = state.candidates.filter((item) => item.id !== candidate.id); await save(); render(); } });
    actions.append(confirm, ignore);
    card.append(el('div', { className: 'phone-field' }, [el('label', { text: '名称' }), name]), el('div', { className: 'phone-field' }, [el('label', { text: '描述' }), description]), actions);
    return card;
  }

  function renderCharacters() {
    title.textContent = localize('apps.characters', '角色管理');
    const enabled = el('input', { type: 'checkbox', checked: state.detection.enabled ? 'checked' : undefined, 'aria-label': '启用角色检测' });
    const threshold = el('input', { type: 'number', min: '1', max: '100', value: String(state.detection.roundThreshold), 'aria-label': '检测回合阈值' });
    const saveSettings = el('button', { className: 'phone-button primary', text: '保存检测设置', onClick: async () => { state.detection = { ...state.detection, enabled: enabled.checked, roundThreshold: Math.max(1, Number(threshold.value) || 5) }; await save(); await notify('角色检测设置已保存'); } });
    const manualDetect = el('button', { className: 'phone-button primary', 'data-action': 'manual-detect', text: '手动检测当前剧情', onClick: async () => {
      if (!manualDetection) return notify('手动检测服务暂不可用');
      manualDetect.disabled = true;
      try {
        const found = await manualDetection.detect();
        if (storage?.loadGlobal) state = mergeState(await storage.loadGlobal() || state);
        const added = await addCandidates(found, 'manual');
        await notify(added.length ? `发现 ${added.length} 个待确认角色` : '没有发现新的角色');
        render();
      } catch (error) { await notify(error.message || '手动检测失败'); manualDetect.disabled = false; }
    } });
    const rolePrompt = el('textarea', { 'data-action': 'role-prompt', placeholder: '描述你想生成的角色，例如：住在灯塔的修理师…', 'aria-label': '角色描述' });
    const generateRole = el('button', { className: 'phone-button', 'data-action': 'generate-role', text: '根据描述生成角色卡', onClick: async () => {
      if (!adapter?.oneOffGenerate || !rolePrompt.value.trim()) return notify('请先输入角色描述');
      generateRole.disabled = true;
      try {
        const raw = await adapter.oneOffGenerate([
          '根据用户描述生成一个可编辑的角色卡候选。只输出 JSON：{"candidates":[{"name":"","aliases":[],"description":"","personality":"","scenario":"","first_mes":"","tags":[]}]。',
          `用户描述：${rolePrompt.value.trim()}`,
        ].join('\n\n'), { context: false });
        const added = await addCandidates(parseDetectorResponse(raw), 'prompt');
        await notify(added.length ? '角色候选已生成，请确认创建' : '没有生成有效角色卡');
        render();
      } catch (error) { await notify(error.message || '角色生成失败'); generateRole.disabled = false; }
    } });
    const candidates = state.candidates.length ? state.candidates.map(candidateCard) : [el('p', { className: 'phone-muted', text: '还没有待确认角色' })];
    content.replaceChildren(el('div', { className: 'phone-section' }, [
      el('div', { className: 'phone-card' }, [el('div', { className: 'phone-row' }, [el('strong', { text: '对话轮数检测' }), el('span', { className: 'phone-pill', text: `${state.detection.roundThreshold} 回合` })]), el('label', { className: 'phone-row', text: '启用检测' }, [enabled]), el('div', { className: 'phone-field' }, [el('label', { text: '每几个完整回合检测' }), threshold]), saveSettings]),
      el('div', { className: 'phone-card phone-section' }, [el('strong', { text: '立即检测或生成' }), manualDetect, el('div', { className: 'phone-field' }, [el('label', { text: '根据描述生成角色' }), rolePrompt]), generateRole]),
      el('div', { className: 'phone-section' }, [el('strong', { text: '待确认角色' }), ...candidates]),
    ]));
    nav.replaceChildren();
  }

  function renderImport() {
    title.textContent = localize('apps.import', '内容导入');
    const config = state.github;
    const repository = el('input', { className: 'github-repository', value: config.repository || [config.owner, config.repo].filter(Boolean).join('/'), placeholder: 'owner/repo 或 https://github.com/owner/repo' });
    const branch = el('input', { className: 'github-branch', value: config.branch || 'main', placeholder: 'main' });
    const token = el('input', { className: 'github-token', type: 'password', value: config.token || '', placeholder: '可选 token' });
    const fileList = el('div', { className: 'phone-section' });
    const status = el('p', { className: 'phone-muted', 'data-action': 'github-status' });
    const preview = el('pre', { className: 'phone-card', 'data-action': 'github-preview', hidden: '' });
    const conflictList = el('div', { className: 'phone-section' });
    const conflictCard = el('div', { className: 'phone-card phone-section', 'data-action': 'github-conflicts', hidden: '' });
    let repositoryPath = '';
    let repositoryEntries = [];
    let fallbackFiles = [];
    let selectedPaths = new Set();
    let conflicts = [];
    let activeConfig = state.github;
    const persistGithubConfig = async () => {
      const parsed = parseRepositorySource(repository.value.trim(), branch.value.trim() || 'main');
      const nextConfig = { repository: repository.value.trim(), branch: branch.value.trim() || parsed.branch || 'main', token: token.value, importHistory: state.github.importHistory || {} };
      state.github = nextConfig;
      await save();
      return nextConfig;
    };
    const isSupported = (entry) => entry?.type === 'file' || entry?.type === 'blob'
      ? (importService?.isSupportedFile ? importService.isSupportedFile(entry.path) : /\.(json|png)$/i.test(entry.path || ''))
      : false;
    const entriesForFallback = (allFiles, path) => {
      const prefix = path ? `${path}/` : '';
      const entries = new Map();
      allFiles.forEach((file) => {
        if (!file?.path || !file.path.startsWith(prefix)) return;
        const relative = file.path.slice(prefix.length);
        if (!relative) return;
        const parts = relative.split('/');
        if (parts.length > 1) entries.set(`dir:${parts[0]}`, { name: parts[0], path: `${prefix}${parts[0]}`, type: 'dir' });
        else entries.set(`file:${file.path}`, { name: parts[0], path: file.path, type: 'file', size: file.size || 0, sha: file.sha || '' });
      });
      return [...entries.values()];
    };
    const updateStatus = (message, warning = false) => { status.textContent = message; status.classList.toggle('phone-muted', !warning); };
    const renderDirectory = () => {
      const entries = repositoryEntries;
      const rows = [];
      if (repositoryPath) rows.push(el('button', { className: 'phone-button', 'data-action': 'github-up', text: '‹ 上一级目录', onClick: () => openDirectory(repositoryPath.split('/').slice(0, -1).join('/')) }));
      const supportedEntries = entries.filter(isSupported);
      const selectAll = el('button', { className: 'phone-button', 'data-action': 'github-select-all', text: supportedEntries.length && supportedEntries.every((entry) => selectedPaths.has(entry.path)) ? '取消全选' : '全选可导入文件', onClick: () => {
        const allSelected = supportedEntries.length && supportedEntries.every((entry) => selectedPaths.has(entry.path));
        supportedEntries.forEach((entry) => allSelected ? selectedPaths.delete(entry.path) : selectedPaths.add(entry.path));
        renderDirectory();
      } });
      rows.push(el('div', { className: 'phone-row' }, [el('span', { text: repositoryPath ? `目录：/${repositoryPath}` : '仓库根目录' }), selectAll]));
      const sorted = [...entries].sort((a, b) => Number((b.type === 'dir' || b.type === 'directory')) - Number((a.type === 'dir' || a.type === 'directory')) || String(a.name).localeCompare(String(b.name)));
      rows.push(...sorted.map((entry) => (entry.type === 'dir' || entry.type === 'directory')
        ? el('button', { className: 'phone-app-card', 'data-action': 'github-directory', onClick: () => openDirectory(entry.path) }, [el('span', { text: `📁 ${entry.name}` }), el('small', { text: '打开目录' })])
        : el('div', { className: 'phone-card phone-row' }, [el('label', { className: 'phone-row' }, [el('input', { type: 'checkbox', 'data-action': 'github-select', disabled: !isSupported(entry), checked: selectedPaths.has(entry.path) ? 'checked' : undefined, onChange: (event) => { if (event.target.checked) selectedPaths.add(entry.path); else selectedPaths.delete(entry.path); } }), el('span', { text: `📄 ${entry.name}` })]), el('button', { className: 'phone-button', 'data-action': 'github-preview-file', text: '预览', disabled: !isSupported(entry), onClick: () => previewEntry(entry) })])));
      if (!entries.length) rows.push(el('p', { className: 'phone-muted', text: '当前目录没有文件或文件夹' }));
      fileList.replaceChildren(...rows);
    };
    const previewEntry = async (entry) => {
      if (!importService?.readCandidate) return;
      preview.hidden = false;
      preview.textContent = '正在读取资源…';
      try {
        const candidate = await importService.readCandidate(activeConfig, entry);
        preview.textContent = JSON.stringify({ kind: candidate.kind, name: candidate.name, source: candidate.sourceKey, data: candidate.normalized }, null, 2);
      } catch (error) { preview.textContent = error.message || '预览失败'; }
    };
    const renderConflicts = () => {
      conflictList.replaceChildren(...conflicts.map((candidate) => {
        const select = el('select', { 'data-action': 'github-conflict-decision' }, [el('option', { value: 'update', text: '更新已有资源' }), el('option', { value: 'create', text: '新建副本' }), el('option', { value: 'skip', text: '跳过' })]);
        const rename = el('input', { className: 'github-rename', value: candidate.name, placeholder: '新名称（可选）', hidden: 'hidden' });
        select.addEventListener('change', () => { rename.hidden = select.value !== 'create'; });
        return el('div', { className: 'phone-card' }, [el('div', { className: 'phone-row' }, [el('strong', { text: candidate.name }), el('span', { className: 'phone-pill', text: candidate.kind })]), el('p', { className: 'phone-muted', text: `发现重复：${candidate.duplicate.existingName || candidate.name}` }), el('div', { className: 'phone-row' }, [select, rename])]);
      }));
      conflictCard.hidden = !conflicts.length;
    };
    const openDirectory = async (path) => {
      repositoryPath = normalizePath(path);
      if (importService?.client?.listDirectory) {
        try { repositoryEntries = await importService.client.listDirectory(activeConfig, repositoryPath); renderDirectory(); } catch (error) { updateStatus(error.message || '目录加载失败', true); }
      } else {
        repositoryEntries = entriesForFallback(fallbackFiles, repositoryPath);
        renderDirectory();
      }
    };
    const importSelected = async () => {
      const selected = repositoryEntries.filter((entry) => selectedPaths.has(entry.path) && isSupported(entry));
      if (!selected.length) return updateStatus('请先勾选可导入的文件', true);
      if (!importService?.prepareFiles || !importService?.importCandidates) return updateStatus('批量导入服务暂不可用', true);
      updateStatus('正在分析资源…');
      try {
        const candidates = await importService.prepareFiles({ config: activeConfig, entries: selected });
        conflicts = candidates.filter((candidate) => candidate.duplicate?.kind && candidate.duplicate.kind !== 'none');
        const clean = candidates.filter((candidate) => !conflicts.includes(candidate));
        const results = await importService.importCandidates(clean);
        selectedPaths = new Set([...selectedPaths].filter((path) => !selected.some((entry) => entry.path === path)));
        renderConflicts();
        const created = results.filter((result) => result.status === 'created').length;
        const failed = results.filter((result) => result.status === 'failed').length;
        updateStatus(`${created} 个资源已导入${conflicts.length ? `，${conflicts.length} 个重复待处理` : ''}${failed ? `，${failed} 个失败` : ''}`, failed > 0);
        await openDirectory(repositoryPath);
      } catch (error) { updateStatus(error.message || '批量导入失败', true); }
    };
    const confirmConflicts = async () => {
      if (!conflicts.length || !importService?.importCandidates) return;
      const decisions = {};
      [...conflictList.children].forEach((row, index) => { const candidate = conflicts[index]; const select = row.querySelector('select'); const rename = row.querySelector('.github-rename'); decisions[candidate.sourceKey] = { decision: select.value, newName: rename?.value?.trim() || '' }; });
      const results = await importService.importCandidates(conflicts, decisions);
      conflicts = [];
      renderConflicts();
      updateStatus(`重复资源处理完成：${results.filter((result) => ['created', 'updated'].includes(result.status)).length} 个成功`);
      await openDirectory(repositoryPath);
    };
    const browse = el('button', { className: 'phone-button primary', 'data-action': 'github-load', text: '加载仓库目录', onClick: async () => {
      const currentConfig = await persistGithubConfig();
      if (!importService) return notify('GitHub 导入服务暂不可用');
      browse.disabled = true;
      try {
        activeConfig = currentConfig;
        selectedPaths = new Set();
        repositoryPath = '';
        if (importService.client.listDirectory) {
          repositoryEntries = await importService.client.listDirectory(currentConfig, '');
          renderDirectory();
        } else {
          fallbackFiles = await importService.client.listFiles(currentConfig);
          repositoryEntries = entriesForFallback(fallbackFiles, '');
          renderDirectory();
        }
        updateStatus(`已加载 ${repositoryEntries.length} 项，请进入目录并勾选要导入的文件`);
      } catch (error) { await notify(error.message || 'GitHub 连接失败'); }
      finally { browse.disabled = false; }
    } });
    const importButton = el('button', { className: 'phone-button primary', 'data-action': 'github-import-selected', text: '导入选中资源', onClick: importSelected });
    const confirmButton = el('button', { className: 'phone-button primary', 'data-action': 'github-confirm-conflicts', text: '确认处理重复资源', onClick: confirmConflicts });
    conflictCard.append(el('strong', { text: '重复资源处理' }), el('p', { className: 'phone-muted', text: '选择更新已有资源、新建副本或跳过。' }), conflictList, confirmButton);
    content.replaceChildren(el('div', { className: 'phone-section' }, [
      el('div', { className: 'phone-card phone-section' }, [el('strong', { text: 'GitHub 仓库' }), ...[
        ['repository', repository, '仓库'], ['branch', branch, '分支'], ['token', token, 'Token'],
      ].map(([, input, label]) => el('div', { className: 'phone-field' }, [el('label', { text: label }), input])), el('div', { className: 'phone-row' }, [browse, importButton])]),
      status,
      fileList,
      conflictCard,
      preview,
    ]));
    renderDirectory();
    nav.replaceChildren();
  }

  function renderMessages() {
    title.textContent = '微信';
    const threads = Object.values(state.threads || {}).filter((thread) => thread.identityId === state.activeIdentityId);
    const list = threads.length ? threads.map((thread) => el('button', { className: 'phone-app-card', onClick: () => { activeThreadId = thread.id; page = 'thread'; render(); } }, [el('span', { text: thread.title || thread.participantIds.join('、') || '未命名会话' }), el('small', { text: thread.unread ? `${thread.unread} 条未读` : '已读' })])) : [el('p', { className: 'phone-muted', text: '暂无会话，可从通讯录发起聊天。' })];
    const autoScan = el('input', { type: 'checkbox', 'data-action': 'wechat-auto-scan', checked: state.wechat?.autoScanEnabled !== false ? 'checked' : undefined, 'aria-label': '自动扫描剧情' });
    autoScan.addEventListener('change', async () => { state.wechat = { ...(state.wechat || {}), autoScanEnabled: autoScan.checked }; await save(); });
    const scan = el('button', { className: 'phone-button primary', 'data-action': 'wechat-scan', text: '立即扫描剧情', onClick: async () => {
      if (!socialScanner) return notify('微信扫描服务暂不可用');
      scan.disabled = true;
      try {
        const result = await socialScanner.scan();
        if (storage?.loadGlobal) state = mergeState(await storage.loadGlobal() || state);
        const count = Number(result?.proactive || 0) + Number(result?.roleDialogue || 0);
        await notify(count ? `扫描完成，新增 ${count} 条角色动态` : '扫描完成，暂无新的角色动态');
        render();
      } catch (error) { await notify(error.message || '微信扫描失败'); scan.disabled = false; }
    } });
    content.replaceChildren(el('div', { className: 'phone-section' }, [
      el('div', { className: 'phone-card phone-section' }, [el('strong', { text: '剧情扫描' }), el('label', { className: 'phone-row', text: '自动扫描生成后的剧情' }, [autoScan]), scan]),
      el('div', { className: 'phone-card' }, [el('strong', { text: '会话' }), ...list]),
    ]));
  }

  function renderContacts() {
    const contacts = state.identities.filter((item) => item.id !== state.activeIdentityId && item.kind === 'character');
    const list = contacts.length ? contacts.map((contact) => el('button', { className: 'phone-app-card', onClick: async () => { const thread = await threadService?.getOrCreateThread({ identityId: state.activeIdentityId, kind: 'user-character', participantIds: [contact.characterId], title: contact.name }); state = mergeState(await storage?.loadGlobal?.() || state); activeThreadId = thread.id; page = 'thread'; render(); } }, [el('span', { text: contact.name }), el('small', { text: contact.settings?.proactiveEnabled ? '主动聊天已开' : '主动聊天未开' })])) : [el('p', { className: 'phone-muted', text: '还没有角色联系人。' })];
    content.replaceChildren(el('div', { className: 'phone-section' }, [el('div', { className: 'phone-card' }, [el('strong', { text: '角色联系人' }), ...list])]));
  }

  function renderDiscover() {
    const moments = [...(state.moments || [])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const composer = el('textarea', { placeholder: '发一条朋友圈…', 'aria-label': '朋友圈内容' });
    const publish = el('button', { className: 'phone-button primary', text: '发布', onClick: async () => { if (!momentsService || !composer.value.trim()) return; await momentsService.createMoment(state.activeIdentityId, { text: composer.value }); state = mergeState(await storage.loadGlobal()); render(); } });
    const feed = moments.length ? moments.map((moment) => el('article', {}, [el('strong', { text: state.identities.find((item) => item.id === moment.identityId)?.name || moment.identityId }), el('p', { text: moment.text }), el('small', { className: 'phone-muted', text: moment.createdAt })])) : [el('p', { className: 'phone-muted', text: '还没有朋友圈动态。' })];
    content.replaceChildren(el('div', { className: 'phone-section' }, [el('div', { className: 'phone-card phone-section' }, [composer, publish]), el('div', { className: 'phone-card phone-feed' }, feed)]));
  }

  function renderMe() {
    const select = el('select', { 'aria-label': '当前手机身份' });
    state.identities.forEach((item) => select.append(el('option', { value: item.id, text: item.name, selected: item.id === state.activeIdentityId ? 'selected' : undefined })));
    select.addEventListener('change', async () => { if (identityService) await identityService.switchIdentity(select.value); state = mergeState(await storage?.loadGlobal?.() || { ...state, activeIdentityId: select.value }); render(); });
    const current = state.identities.find((item) => item.id === state.activeIdentityId) || state.identities[0];
    const proactive = el('input', { type: 'checkbox', checked: current?.settings?.proactiveEnabled ? 'checked' : undefined, 'aria-label': '允许主动聊天' });
    proactive.addEventListener('change', async () => { state.identities = state.identities.map((item) => item.id === current.id ? { ...item, settings: { ...(item.settings || {}), proactiveEnabled: proactive.checked } } : item); await save(); });
    const roleDialogue = el('input', { type: 'checkbox', checked: current?.settings?.roleDialogueEnabled ? 'checked' : undefined, 'aria-label': '允许角色间后台聊天' });
    roleDialogue.addEventListener('change', async () => { state.identities = state.identities.map((item) => item.id === current.id ? { ...item, settings: { ...(item.settings || {}), roleDialogueEnabled: roleDialogue.checked } } : item); await save(); });
    content.replaceChildren(el('div', { className: 'phone-section' }, [el('div', { className: 'phone-card phone-section' }, [el('strong', { text: '当前手机身份' }), select, el('label', { className: 'phone-row', text: '允许角色主动聊天' }, [proactive]), el('label', { className: 'phone-row', text: '允许角色间后台聊天' }, [roleDialogue])]), el('div', { className: 'phone-card' }, [el('p', { className: 'phone-muted', text: `身份空间：${current?.name || '用户'}` })])]));
  }

  function renderThread() {
    const thread = state.threads?.[activeThreadId];
    if (!thread) { page = 'wechat'; render(); return; }
    title.textContent = thread.title || '微信聊天';
    const messages = thread.messages.map((message) => el('div', { className: 'phone-card' }, [el('small', { className: 'phone-muted', text: message.role === 'character' ? '角色' : '我' }), el('p', { text: message.content })]));
    const input = el('textarea', { placeholder: '输入消息…', 'aria-label': '微信消息' });
    const send = el('button', { className: 'phone-button primary', text: '发送', onClick: async () => {
      if (!input.value.trim() || !threadService) return;
      const text = input.value.trim(); input.value = '';
      await threadService.appendMessage(thread.id, { authorId: state.activeIdentityId, role: 'user', content: text });
      const contact = state.identities.find((item) => item.characterId && thread.participantIds.includes(item.characterId));
      if (roleDialogue && contact) await roleDialogue.generateExchange({ threadId: thread.id, speakerId: contact.characterId, speakerName: contact.name, context: text });
      state = mergeState(await storage.loadGlobal()); render();
    } });
    content.replaceChildren(el('div', { className: 'phone-section' }, [...messages, el('div', { className: 'phone-card phone-section' }, [input, send])]));
    nav.replaceChildren(el('button', { text: '‹ 返回', onClick: () => { page = 'wechat'; render(); } }));
  }

  function renderNav(current = wechatTab) {
    nav.replaceChildren(...[
      ['messages', '微信'], ['contacts', '通讯录'], ['discover', '发现'], ['me', '我的'],
    ].map(([id, label]) => el('button', { 'aria-current': current === id ? 'page' : 'false', text: label, onClick: () => { page = 'wechat'; wechatTab = id; render(); } })));
  }

  function renderWechat() {
    title.textContent = '微信';
    if (wechatTab === 'contacts') renderContacts();
    else if (wechatTab === 'discover') renderDiscover();
    else if (wechatTab === 'me') renderMe();
    else renderMessages();
    renderNav();
  }

  function render() {
    launcher.hidden = open;
    shell.hidden = !open;
    homeBack.hidden = !open || page === 'home';
    const current = state.identities.find((item) => item.id === state.activeIdentityId);
    identity.textContent = `身份 · ${current?.name || '用户'}`;
    if (!open) return;
    if (page === 'characters') renderCharacters();
    else if (page === 'import') renderImport();
    else if (page === 'wechat') renderWechat();
    else if (page === 'thread') renderThread();
    else renderHome();
  }

  render();
  return { render, refresh, dispose: () => { dragCleanups.forEach((cleanup) => cleanup()); root.replaceChildren(); } };
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('[data-shiyu-phone]');
  if (root) mountPhone(root);
}
