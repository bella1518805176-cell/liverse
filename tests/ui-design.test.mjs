import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import sharp from 'sharp';
import { palette } from '../scripts/render-ui-direction.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const file = path.join(root, 'output/ui/LIVERSE_座位视野模拟器_UI设计方案.md');
const design = readFileSync(file, 'utf8');
const product = readFileSync(path.join(root, 'docs/demo-product-design.md'), 'utf8');
const svg = readFileSync(path.join(root, 'output/ui/LIVERSE_UI方向与页面结构.svg'), 'utf8');
const rows = (document, pattern) => document.split(/\r?\n/)
  .filter((line) => pattern.test(line))
  .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
const section = (heading, next) => {
  const value = design.split(heading)[1]?.split(next)[0];
  assert.ok(value, `Missing design section: ${heading}`);
  return value;
};

test('UI design covers the current demo requirements and their matching acceptance cases', () => {
  const requirements = rows(product, /^\| DFR-\d+ \|/).map(([id]) => id);
  const acceptance = new Map(rows(product, /^\| DAC-\d+ \|/).map(([id, requirement]) => [id, requirement]));
  const mapping = rows(design, /^\| UI-\d+ \|/);
  assert.equal(mapping.length, requirements.length);
  assert.equal(new Set(mapping.map(([id]) => id)).size, mapping.length);
  assert.deepEqual(mapping.map(([, requirement]) => requirement).sort(), [...requirements].sort());
  const covered = [];
  for (const [id, requirement, references, details] of mapping) {
    assert.ok(details, `${id}: missing UI delivery`);
    const cases = references.match(/DAC-\d+/g) ?? [];
    assert.ok(cases.length > 0, `${id}: missing acceptance references`);
    for (const reference of cases) {
      assert.equal(acceptance.get(reference), requirement, `${id}: wrong requirement for ${reference}`);
      covered.push(reference);
    }
  }
  assert.deepEqual(covered.sort(), [...acceptance.keys()].sort());
});

test('UI state feedback covers each product transition without duplicate or unknown rules', () => {
  const expected = rows(product, /^\| ST-\d+ \|/).map(([id]) => id);
  const transitions = rows(design, /^\| ST-\d+ \|/);
  assert.deepEqual(transitions.map(([id]) => id), expected);
  assert.ok(transitions.every((row) => row.length === 3 && row.every(Boolean)));
});

test('all eight original colors stay unchanged in the document and diagram palette', () => {
  const baseline = ['#FF5018', '#0B0D10', '#171A1F', '#242A32', '#F5F6F7', '#A8ADB5', '#68727E', '#F3C46B'];
  const colors = rows(section('### 2.1 色板', '### 2.2'), /^\| [^|]+ \| `#[0-9A-F]{6}` \|/)
    .map(([, color]) => color.replaceAll('`', ''));
  assert.deepEqual(colors, baseline);
  assert.deepEqual(Object.values(palette), baseline);
  for (const color of baseline) assert.ok(svg.includes(color), `Diagram lost ${color}`);
});

test('text and seat boundary colors meet the specified contrast on dark surfaces', () => {
  const luminance = (hex) => {
    const values = hex.slice(1).match(/../g).map((value) => Number.parseInt(value, 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  const contrast = (a, b) => {
    const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (values[0] + 0.05) / (values[1] + 0.05);
  };
  for (const surface of [palette.background, palette.panel, palette.surface]) {
    assert.ok(contrast(palette.text, surface) >= 4.5);
    assert.ok(contrast(palette.muted, surface) >= 4.5);
    const outline = surface === palette.surface ? palette.muted : palette.border;
    assert.ok(contrast(outline, surface) >= 3);
  }
  assert.match(design, /次级表面上，必要边界与焦点轮廓改用已有的/);
  assert.ok(contrast(palette.background, palette.orange) >= 4.5);
});

test('seat counts match the product source and keep the seven-seat discrepancy explicit', () => {
  const counts = (contents) => rows(contents, /^\| (?:1F |2F |合计)/)
    .map(([name, labeled, read]) => [name, Number(labeled), Number(read)]);
  const source = counts(product);
  const actual = counts(section('### 4.1 数据范围与真实结构', '### 4.2'));
  assert.deepEqual(actual, source);
  const areas = actual.filter(([name]) => name !== '合计');
  const total = actual.find(([name]) => name === '合计');
  assert.equal(areas.reduce((sum, row) => sum + row[1], 0), total[1]);
  assert.equal(areas.reduce((sum, row) => sum + row[2], 0), total[2]);
  assert.equal(total[1] - total[2], 7);
  assert.match(design, /图纸标注1184座，7座编号待核对/);
  assert.match(design, /不补号、不猜位置/);
});

test('single-page scope excludes legacy business features and keeps all three selection sheets', () => {
  const scope = section('## 1. 设计结论与调整范围', '## 2.');
  assert.match(scope, /一个主探索页面，无独立业务子页、无底部业务 TabBar/);
  assert.match(scope, /上海这一项真实可用记录/);
  for (const show of ['演示场次 A', '演示场次 B']) assert.ok(scope.includes(show));
  const exclusions = rows(scope, /^\| 本版排除 \|/)[0][1];
  for (const excluded of ['实拍', '回忆', '轨迹', '我的', '登录', '收藏', '最近浏览', '对比', '分享', '投稿', '票务', '舞台调整', '真实相机', '手机倍率']) {
    assert.ok(exclusions.includes(excluded), `Missing exclusion ${excluded}`);
  }
  const sheets = section('## 6. 三类底部浮层', '## 7.');
  for (const label of ['场馆浮层', '场次浮层', '位置浮层', '取消不改变', '草稿', '确认']) {
    assert.ok(sheets.includes(label), `Missing sheet behavior ${label}`);
  }
});

test('each 3D mode defines selected and unselected behavior, with explicit placeholder boundaries', () => {
  const modes = rows(design, /^\| (?:场馆总览|观众视角|手机取景) \|/);
  assert.deepEqual(modes.map(([mode]) => mode), ['场馆总览', '观众视角', '手机取景']);
  for (const row of modes) {
    assert.equal(row.length, 4);
    assert.ok(row.every(Boolean));
    assert.match(row[1], /选|入口/);
    assert.match(row[2], /排座|位置/);
  }
  assert.match(modes[2][3], /没有摄像头权限/);
  assert.match(design, /3D模型暂未接入/);
  assert.match(design, /三个模式按钮始终可用，包括未选座时/);
});

test('current diagram shows one-page states, an honest 2D schematic and image-free 3D placeholders', async () => {
  const frames = [...svg.matchAll(/<g id="([^"]+)" data-view="([^"]+)" data-selected="([^"]+)" data-mode="([^"]*)"/g)];
  assert.equal(frames.length, 6);
  assert.equal(new Set(frames.map(([, id]) => id)).size, 6);
  const threeD = frames.filter(([, , view]) => view === '3D');
  assert.deepEqual([...new Set(threeD.map(([, , , , mode]) => mode))].sort(), ['场馆总览', '手机取景', '观众视角'].sort());
  assert.ok(threeD.some(([, , , selected]) => selected === 'false'));
  assert.ok(svg.includes('data-overlay="position"'));
  assert.ok(svg.includes('区域框与标记不作真实坐标依据'));
  assert.equal((svg.match(/3D模型暂未接入/g) ?? []).length, threeD.length + 1); // plus accessible description
  assert.ok(!/<image\b|(?:xlink:)?href=|data:image|苏州|进入看座|加入对比|我的收藏/.test(svg),
    'The design must not embed photos, external assets or obsolete business controls');
  const pngPath = path.join(root, 'output/ui/LIVERSE_UI方向与页面结构.png');
  const png = await sharp(pngPath).metadata();
  const dimensions = svg.match(/<svg[^>]+width="(\d+)" height="(\d+)"/);
  assert.equal(png.width, Number(dimensions[1]));
  assert.equal(png.height, Number(dimensions[2]));
  const { data } = await sharp(pngPath).extract({ left: 0, top: 0, width: 1, height: 1 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([...data], [11, 13, 16], 'PNG still uses an old or changed background');
});

test('UI source, preview and README links resolve within the repository', () => {
  for (const documentPath of [file, path.join(root, 'README.md')]) {
    const contents = readFileSync(documentPath, 'utf8');
    for (const match of contents.matchAll(/\[[^\]]+\]\((<[^>]+>|[^)\s]+)\)/g)) {
      const target = match[1].replace(/^<|>$/g, '');
      if (/^(?:https?:|#)/i.test(target)) continue;
      const resolved = path.resolve(path.dirname(documentPath), decodeURIComponent(target.split('#')[0]));
      const relative = path.relative(root, resolved);
      assert.ok(relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
      assert.ok(existsSync(resolved), `Broken design link ${target}`);
    }
  }
  assert.match(readFileSync(path.join(root, 'README.md'), 'utf8').slice(0, 850), /UI设计方案 v2/);
});
