import { DEFAULT_PHONE_STATE, createStorage } from '../core/storage.js';
import { createTavoAdapter } from '../tavo/adapter.js';
import { GitHubClient } from '../github/client.js';
import { createImportService } from '../github/import-service.js';
import { createIdentityService } from '../wechat/identity-store.js';
import { createThreadService } from '../wechat/thread-store.js';
import { createMomentsService } from '../wechat/moments-store.js';
import { createRoleDialogueService } from '../runtime/role-dialogue.js';

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
    github: { ...DEFAULT_PHONE_STATE.github, ...(input.github || {}) },
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
  const importService = options.importService || (adapter ? createImportService({ client: new GitHubClient(), adapter }) : null);
  const roleDialogue = adapter && threadService ? createRoleDialogueService({ adapter, threadService }) : null;
  const localize = (key, fallback) => {
    try { return tavoFacade?.plugin?.i18n?.t?.(key) || fallback; } catch { return fallback; }
  };
  const notify = async (message) => {
    try { await tavoFacade?.utils?.toast?.(message); } catch { /* no-op in a test fixture */ }
  };

  const launcher = el('button', {
    className: 'phone-launcher',
    'aria-label': localize('runtime.openPhone', '打开小手机'),
    text: '⌂',
    onClick: () => { open = true; refresh().catch(() => {}); render(); },
  });
  const shell = el('section', { className: 'phone-shell', hidden: '' });
  const topbar = el('header', { className: 'phone-topbar' });
  const identity = el('span', { className: 'phone-identity' });
  const title = el('h2', { className: 'phone-title' });
  const close = el('button', { className: 'phone-close', 'aria-label': localize('runtime.closePhone', '关闭小手机'), text: '×', onClick: () => { open = false; render(); } });
  topbar.append(identity, title, close);
  const content = el('main', { className: 'phone-content' });
  const nav = el('nav', { className: 'phone-nav', 'aria-label': '微信导航' });
  shell.append(topbar, content, nav);
  root.replaceChildren(launcher, shell);

  async function refresh() {
    if (!storage?.loadGlobal) return;
    try { state = mergeState(await storage.loadGlobal()); } catch (error) { await notify(localize('runtime.error', '手机数据加载失败')); throw error; }
  }

  async function save() {
    if (storage?.saveGlobal) await storage.saveGlobal(state);
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
    const candidates = state.candidates.length ? state.candidates.map(candidateCard) : [el('p', { className: 'phone-muted', text: '还没有待确认角色' })];
    content.replaceChildren(el('div', { className: 'phone-section' }, [
      el('div', { className: 'phone-card' }, [el('div', { className: 'phone-row' }, [el('strong', { text: '对话轮数检测' }), el('span', { className: 'phone-pill', text: `${state.detection.roundThreshold} 回合` })]), el('label', { className: 'phone-row', text: '启用检测' }, [enabled]), el('div', { className: 'phone-field' }, [el('label', { text: '每几个完整回合检测' }), threshold]), saveSettings]),
      el('div', { className: 'phone-section' }, [el('strong', { text: '待确认角色' }), ...candidates]),
    ]));
    nav.replaceChildren();
  }

  function renderImport() {
    title.textContent = localize('apps.import', '内容导入');
    const config = state.github;
    const owner = el('input', { className: 'github-owner', value: config.owner, placeholder: 'owner' });
    const repo = el('input', { className: 'github-repo', value: config.repo, placeholder: 'repo' });
    const branch = el('input', { className: 'github-branch', value: config.branch || 'main', placeholder: 'main' });
    const rootPath = el('input', { className: 'github-root', value: config.rootPath || '', placeholder: '可选目录' });
    const token = el('input', { className: 'github-token', type: 'password', value: config.token || '', placeholder: '可选 token' });
    const fileList = el('div', { className: 'phone-section' });
    const persistGithubConfig = async () => {
      const nextConfig = { ...state.github, owner: owner.value.trim(), repo: repo.value.trim(), branch: branch.value.trim() || 'main', rootPath: rootPath.value.trim(), token: token.value };
      state.github = nextConfig;
      await save();
      return nextConfig;
    };
    const saveConfig = el('button', { className: 'phone-button', text: '保存仓库配置', onClick: async () => { await persistGithubConfig(); await notify('GitHub 配置已保存'); } });
    const browse = el('button', { className: 'phone-button primary', text: '测试并浏览文件', onClick: async () => {
      const currentConfig = await persistGithubConfig();
      if (!importService) return notify('GitHub 导入服务暂不可用');
      try {
        const files = await importService.client.listFiles(currentConfig);
        fileList.replaceChildren(...files.map((file) => el('div', { className: 'phone-card phone-row' }, [el('span', { text: file.path }), el('button', { className: 'phone-button', text: '导入', onClick: async () => { try { await importService.importFile({ config: state.github, path: file.path, conflict: 'new' }); await notify('导入成功'); } catch (error) { await notify(error.message || '导入失败'); } } })])));
      } catch (error) { await notify(error.message || 'GitHub 连接失败'); }
    } });
    content.replaceChildren(el('div', { className: 'phone-section' }, [
      el('div', { className: 'phone-card phone-section' }, [el('strong', { text: 'GitHub 仓库' }), ...[
        ['owner', owner, 'Owner'], ['repo', repo, 'Repo'], ['branch', branch, 'Branch'], ['root', rootPath, '目录'], ['token', token, 'Token'],
      ].map(([, input, label]) => el('div', { className: 'phone-field' }, [el('label', { text: label }), input])), el('div', { className: 'phone-row' }, [saveConfig, browse])]),
      fileList,
    ]));
    nav.replaceChildren();
  }

  function renderMessages() {
    title.textContent = '微信';
    const threads = Object.values(state.threads || {}).filter((thread) => thread.identityId === state.activeIdentityId);
    const list = threads.length ? threads.map((thread) => el('button', { className: 'phone-app-card', onClick: () => { activeThreadId = thread.id; page = 'thread'; render(); } }, [el('span', { text: thread.title || thread.participantIds.join('、') || '未命名会话' }), el('small', { text: thread.unread ? `${thread.unread} 条未读` : '已读' })])) : [el('p', { className: 'phone-muted', text: '暂无会话，可从通讯录发起聊天。' })];
    content.replaceChildren(el('div', { className: 'phone-section' }, [el('div', { className: 'phone-card' }, [el('strong', { text: '会话' }), ...list])]));
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
  return { render, refresh, dispose: () => root.replaceChildren() };
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('[data-shiyu-phone]');
  if (root) mountPhone(root);
}
