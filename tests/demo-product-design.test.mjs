import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const documentPath = path.join(root, 'docs/demo-product-design.md');
const document = readFileSync(documentPath, 'utf8');
const table = (prefix) => document.split(/\r?\n/)
  .filter((line) => new RegExp(`^\\| ${prefix}-\\d+ \\|`).test(line))
  .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));

test('demo requirements and state transitions have unique acceptance coverage', () => {
  const requirements = table('DFR');
  const transitions = table('ST');
  const acceptance = table('DAC');
  for (const entries of [requirements, transitions, acceptance]) {
    assert.ok(entries.length > 0);
    assert.equal(new Set(entries.map(([id]) => id)).size, entries.length);
    assert.ok(entries.every((row) => row.every(Boolean)), 'Incomplete requirement or scenario');
  }
  const requirementIds = new Set(requirements.map(([id]) => id));
  const transitionIds = new Set(transitions.map(([id]) => id));
  for (const [id, requirement, transition] of acceptance) {
    assert.ok(requirementIds.has(requirement), `${id}: unknown requirement ${requirement}`);
    assert.ok(transitionIds.has(transition), `${id}: unknown transition ${transition}`);
  }
  for (const [id] of requirements) {
    assert.ok(acceptance.some(([, reference]) => reference === id), `${id}: no acceptance`);
  }
  for (const [id] of transitions) {
    assert.ok(acceptance.some(([, , reference]) => reference === id), `${id}: no acceptance`);
  }
});

test('source register reconciles labeled and numbered seats without hiding the shortfall', () => {
  const section = document.split('### 2.1 已读取的图纸内容')[1]?.split('### 2.2')[0];
  assert.ok(section);
  const counts = section.split(/\r?\n/)
    .filter((line) => /^\| (?:1F |2F |合计)/.test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
  const total = counts.find(([label]) => label === '合计');
  const areas = counts.filter(([label]) => label !== '合计');
  assert.equal(areas.length, 4);
  for (const column of [1, 2]) {
    assert.equal(areas.reduce((sum, row) => sum + Number(row[column]), 0), Number(total[column]));
  }
  assert.equal(Number(total[1]) - Number(total[2]), 7);
  assert.equal(areas.filter(([, labeled, read]) => labeled !== read).length, 1);
  assert.match(areas.find(([, labeled, read]) => labeled !== read)[0], /1F 中区/);
});

test('all three placeholder modes specify behavior both with and without a position', () => {
  const modes = document.split(/\r?\n/)
    .filter((line) => /^\| (?:场馆总览|观众视角|手机取景) \|/.test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
  assert.equal(modes.length, 3);
  assert.deepEqual(modes.map(([mode]) => mode), ['场馆总览', '观众视角', '手机取景']);
  for (const row of modes) {
    assert.equal(row.length, 4);
    assert.ok(row.every(Boolean), `${row[0]}: missing position behavior or scope boundary`);
  }
});

test('current design links resolve and historical baselines point to the demo scope', () => {
  for (const relative of ['README.md', 'docs/product-design.md', 'docs/technical-design.md']) {
    const file = path.join(root, relative);
    const contents = readFileSync(file, 'utf8');
    assert.match(contents.slice(0, 650), /\]\((?:docs\/)?demo-product-design\.md\)/,
      `${relative}: current scope is not discoverable`);
  }
  for (const match of document.matchAll(/\[[^\]]+\]\((<[^>]+>|[^)\s]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '');
    if (/^(?:https?:|#)/i.test(target)) continue;
    const resolved = path.resolve(path.dirname(documentPath), decodeURIComponent(target.split('#')[0]));
    const relative = path.relative(root, resolved);
    assert.ok(relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
    assert.ok(existsSync(resolved), `Broken source link ${target}`);
  }
});
