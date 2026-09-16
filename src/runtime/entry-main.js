import { createTavoAdapter } from '../tavo/adapter.js';
import { createStorage } from '../core/storage.js';
import { createRuntimeCoordinator } from './coordinator.js';
import { createIdentityService } from '../wechat/identity-store.js';
import { createThreadService } from '../wechat/thread-store.js';
import { createRoleDialogueService } from './role-dialogue.js';

export function startShiyuPhone(tavoFacade = (typeof tavo !== 'undefined' ? tavo : null)) {
  // Keep the entry runtime on the same locale source as the fragment UI.
  if (typeof tavo !== 'undefined' && tavo.plugin?.i18n?.t) tavo.plugin.i18n.t('plugin.name');
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
