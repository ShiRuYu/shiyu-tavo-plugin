function roleOf(message) {
  if (message?.role) return message.role;
  return message?.isUser ? 'user' : 'assistant';
}

function stableMessages(messages) {
  return [...(Array.isArray(messages) ? messages : [])]
    .filter((message) => message && !message.hidden && !message.temporary)
    .sort((a, b) => Number(a.id ?? a.index ?? 0) - Number(b.id ?? b.index ?? 0));
}

export function countCompletedRounds(messages) {
  let waitingForReply = false;
  let rounds = 0;
  for (const message of stableMessages(messages)) {
    const role = roleOf(message);
    if (role === 'user') waitingForReply = true;
    else if (role === 'assistant' && waitingForReply) {
      rounds += 1;
      waitingForReply = false;
    }
  }
  return rounds;
}

export function recentRoundMessages(messages, roundCount) {
  const stable = stableMessages(messages);
  if (!Number.isFinite(roundCount) || roundCount <= 0) return [];
  const target = Math.floor(roundCount);
  let completed = 0;
  let waitingForReply = false;
  let start = stable.length;
  for (let index = stable.length - 1; index >= 0; index -= 1) {
    const role = roleOf(stable[index]);
    if (role === 'assistant') {
      completed += 1;
      waitingForReply = true;
    } else if (role === 'user' && waitingForReply) {
      waitingForReply = false;
      if (completed >= target) {
        start = index;
        break;
      }
    }
  }
  return stable.slice(start);
}
