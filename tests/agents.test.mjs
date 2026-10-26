import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const instructions = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');

test('requires a Git commit after every change for tracking and rollback', () => {
  assert.ok(instructions.includes(
    '每次改动完成后，都必须创建一个对应的 Git commit，以便后续追踪和回滚。',
  ));
});

test('requires updated tests and passing validation before delivery', () => {
  assert.ok(instructions.includes(
    '每次改动完成后，都必须编写或更新相关测试，并在交付给用户前，确保所有测试和验证全部通过。',
  ));
});
