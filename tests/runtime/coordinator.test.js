import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeCoordinator } from '../../src/runtime/coordinator.js';

test('coordinator registers chat and generation hooks', () => {
  const handlers = new Map();
  const coordinator = createRuntimeCoordinator({
    tavo: { plugin: { on: (type, handler) => handlers.set(type, handler) } },
    adapter: {},
    storage: {},
  });
  coordinator.register();
  assert.deepEqual([...handlers.keys()].sort(), [
    'chat:opened',
    'chat:updated',
    'generation:prepare',
    'generation:success',
    'message:added',
  ]);
});
