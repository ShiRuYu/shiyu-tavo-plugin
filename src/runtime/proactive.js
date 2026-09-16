export function shouldProactivelyMessage({ contact, event, settings = {}, random = Math.random }) {
  if (!settings.enabled) return { allowed: false, reason: 'disabled' };
  const present = new Set(event?.presentCharacterIds || []);
  if (present.has(contact?.id)) return { allowed: false, reason: 'same_scene' };
  const at = Date.parse(event?.at || new Date().toISOString());
  const last = contact?.lastContactAt ? Date.parse(contact.lastContactAt) : 0;
  const elapsedMinutes = last ? Math.max(0, at - last) / 60000 : Infinity;
  if (elapsedMinutes < Number(settings.cooldownMinutes ?? 30)) return { allowed: false, reason: 'cooldown' };
  const elapsedHours = elapsedMinutes / 60;
  if (Number.isFinite(elapsedHours) && elapsedHours < Number(settings.absentAfterHours ?? 24)) {
    return { allowed: false, reason: 'recently_contacted' };
  }
  if (random() > Number(settings.probability ?? 0.2)) return { allowed: false, reason: 'probability' };
  return { allowed: true, reason: 'eligible' };
}
