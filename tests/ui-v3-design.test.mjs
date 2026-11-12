import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const docPath = path.join(root, 'output/ui/LIVERSE_看视野在现场我的_UI设计方案_v3.md');
const svgPath = path.join(root, 'output/ui/LIVERSE_看视野在现场我的_UI架构示意.svg');
const pngPath = path.join(root, 'output/ui/LIVERSE_看视野在现场我的_UI架构示意.png');
const doc = readFileSync(docPath, 'utf8');
const svg = readFileSync(svgPath, 'utf8');

test('v3 UI design covers the three current product areas and shared submission rules', () => {
  for (const phrase of ['看视野', '在现场', '我的', '上传实拍', '分享感受', '该位置实拍', '同区实拍', '全馆实拍', '待审核', '已公开', '未通过', '申请补录'])
    assert.ok(doc.includes(phrase), `missing ${phrase}`);
  for (const tag of ['无遮挡', '栏杆遮挡', '音响遮挡', '屏看得清楚', '距离较远'])
    assert.ok(doc.includes(tag), `missing tag ${tag}`);
  assert.match(doc, /全深色 UI/);
  assert.match(doc, /不保留当前 Demo 的浅色画布、白色卡片/);
});

test('v3 UI design preserves the VI palette and excludes light functional surfaces', async () => {
  for (const color of ['#FF5018', '#0B0D10', '#171A1F', '#242A32', '#F5F6F7', '#A8ADB5', '#68727E', '#F3C46B']) {
    assert.ok(doc.includes(color), `missing ${color} in design tokens`);
    assert.ok(svg.includes(color), `missing ${color} in diagram`);
  }
  assert.doesNotMatch(doc, /浅灰画布和白色照片卡片/);
  assert.doesNotMatch(doc, /白底橙色边线/);
  assert.match(doc, /所有页面背景、地图外框和底部导航/);
  const png = await sharp(pngPath).metadata();
  assert.equal(png.width, 1440);
  assert.equal(png.height, 1200);
  const { data } = await sharp(pngPath).extract({ left: 0, top: 0, width: 1, height: 1 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([...data], [11, 13, 16]);
});

test('v3 design links resolve to source materials and current implementation', () => {
  for (const match of doc.matchAll(/\[[^\]]+\]\((<[^>]+>|[^)\s]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '');
    if (/^(?:https?:|#)/i.test(target)) continue;
    const resolved = path.resolve(path.dirname(docPath), decodeURIComponent(target.split('#')[0]));
    assert.ok(existsSync(resolved), `broken source link ${target}`);
  }
});
