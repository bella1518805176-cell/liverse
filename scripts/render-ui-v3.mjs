import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

export const palette = Object.freeze({
  orange: '#FF5018', ink: '#0B0D10', panel: '#171A1F', surface: '#242A32',
  text: '#F5F6F7', muted: '#A8ADB5', border: '#68727E', warning: '#F3C46B',
});

const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const text = (x, y, value, size = 14, fill = palette.text, weight = 400, anchor = 'start') => `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${esc(value)}</text>`;
const rect = (x, y, w, h, fill, radius = 8, stroke = 'none') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`;
const line = (x1, y1, x2, y2, color = palette.border, width = 1) => `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${width}"/>`;
const button = (x, y, w, label, active = false, h = 38) => rect(x, y, w, h, active ? palette.orange : palette.surface, 7, active ? palette.orange : palette.border) + text(x + w / 2, y + h / 2 + 5, label, 12, active ? palette.ink : palette.text, 600, 'middle');
const chip = (x, y, w, label, active = false) => rect(x, y, w, 28, active ? '#2B1710' : palette.surface, 14, active ? palette.orange : palette.border) + text(x + w / 2, y + 18, label, 10, active ? palette.orange : palette.muted, 600, 'middle');
const header = (title, subtitle) => text(22, 34, 'LIVERSE', 21, palette.orange, 800) + text(22, 60, title, 21, palette.text, 700) + text(22, 82, subtitle, 10, palette.muted) + line(22, 96, 67, 96, palette.orange, 3);
const bottomNav = (active) => {
  let s = rect(0, 742, 360, 70, palette.ink, 0, palette.border);
  for (const [index, label] of ['看视野', '在现场', '我的'].entries()) {
    const x = 60 + index * 120;
    if (index === active) s += rect(x - 20, 742, 40, 3, palette.orange, 0) + text(x, 774, '●', 14, palette.orange, 700, 'middle') + text(x, 798, label, 10, palette.text, 600, 'middle');
    else s += text(x, 774, '○', 14, palette.muted, 700, 'middle') + text(x, 798, label, 10, palette.muted, 400, 'middle');
  }
  return s;
};
function frame(x, y, title, subtitle, body, active = 0) {
  return rect(x, y, 360, 812, palette.ink, 14, palette.border) + text(x + 18, y + 20, '微信安全区', 9, palette.muted) + rect(x + 270, y + 10, 72, 24, palette.surface, 12) + text(x + 306, y + 26, '···  ○', 10, palette.text, 500, 'middle') + headerAt(x, y, title, subtitle) + body(x, y) + bottomNavAt(x, y, active);
}
function headerAt(x, y, title, subtitle) {
  return text(x + 18, y + 60, 'LIVERSE', 21, palette.orange, 800) + text(x + 18, y + 86, title, 21, palette.text, 700) + text(x + 18, y + 108, subtitle, 10, palette.muted) + line(x + 18, y + 122, x + 63, y + 122, palette.orange, 3);
}
function bottomNavAt(x, y, active) {
  let s = rect(x, y + 742, 360, 70, palette.ink, 0, palette.border);
  for (const [index, label] of ['看视野', '在现场', '我的'].entries()) {
    const cx = x + 60 + index * 120;
    if (index === active) s += rect(cx - 20, y + 742, 40, 3, palette.orange, 0) + text(cx, y + 774, '●', 14, palette.orange, 700, 'middle') + text(cx, y + 798, label, 10, palette.text, 600, 'middle');
    else s += text(cx, y + 774, '○', 14, palette.muted, 700, 'middle') + text(cx, y + 798, label, 10, palette.muted, 400, 'middle');
  }
  return s;
}
function lookBody(x, y) {
  let s = rect(x + 18, y + 140, 324, 34, palette.panel, 7, palette.border) + text(x + 29, y + 162, '上海 LIVERSE', 11, palette.text, 600) + text(x + 329, y + 162, '演示场次 A  ▾', 10, palette.muted, 400, 'end');
  s += button(x + 18, y + 184, 158, '座位图', true) + button(x + 184, y + 184, 158, '3D 视图');
  s += button(x + 18, y + 232, 82, '1F 一楼', true) + button(x + 108, y + 232, 82, '2F 二楼');
  s += rect(x + 18, y + 282, 324, 212, palette.panel, 8, palette.border) + text(x + 32, y + 306, '1F · 场次座位布局', 11, palette.text, 600) + text(x + 327, y + 306, '800 个座位', 9, palette.muted, 400, 'end') + text(x + 180, y + 338, '↑ 舞台方向', 11, palette.text, 600, 'middle');
  for (const [yy, label, width] of [[360, '前区  ·  1–12排', 244], [407, '中区  ·  13–19排', 218], [454, '后区  ·  20–23排', 193]]) { const left = x + 180 - width / 2; s += rect(left, y + yy, width, 33, palette.surface, 4, palette.border) + text(left + 12, y + yy + 21, label, 10, palette.text, 600); }
  s += `<circle cx="${x + 252}" cy="${y + 376}" r="9" fill="${palette.orange}" stroke="${palette.text}" stroke-width="2"/>` + text(x + 252, y + 380, '1', 9, palette.ink, 700, 'middle');
  s += text(x + 32, y + 518, '已选位置', 9, palette.muted) + text(x + 32, y + 538, '上海 LIVERSE · 1F前区 · 1排1号', 11, palette.text, 600) + button(x + 18, y + 557, 216, '从这里看舞台', true) + button(x + 242, y + 557, 100, '清除选择');
  s += text(x + 18, y + 626, '现场参考', 16, palette.text, 700) + text(x + 342, y + 626, '3 条', 10, palette.muted, 400, 'end') + chip(x + 18, y + 640, 96, '该位置实拍', true) + chip(x + 122, y + 640, 78, '同区实拍') + chip(x + 208, y + 640, 78, '全馆实拍');
  return s;
}
function onsiteBody(x, y) {
  let s = rect(x + 18, y + 140, 157, 34, palette.panel, 7, palette.border) + text(x + 29, y + 162, '上海 LIVERSE', 10, palette.text, 600) + text(x + 162, y + 162, '▾', 10, palette.muted, 400, 'end');
  s += rect(x + 185, y + 140, 157, 34, palette.panel, 7, palette.border) + text(x + 196, y + 162, '当前场次', 10, palette.text, 600) + text(x + 329, y + 162, '▾', 10, palette.muted, 400, 'end');
  s += chip(x + 18, y + 188, 55, '全部', true) + chip(x + 81, y + 188, 55, '照片') + chip(x + 144, y + 188, 55, '感受') + chip(x + 214, y + 188, 128, '全部标签  ▾');
  s += chip(x + 18, y + 228, 88, '全馆实拍', true) + chip(x + 114, y + 228, 88, '同区实拍') + chip(x + 210, y + 228, 100, '该位置实拍');
  s += photoCard(x + 18, y + 276, '用户实拍', '1F 前区', '无遮挡  ·  屏看得清楚', '#753B2B') + photoCard(x + 185, y + 276, '现场感受', '1F 中区', '距离较远', '#263D4B');
  s += text(x + 18, y + 542, '真实照片和观众感受', 12, palette.text, 600) + text(x + 18, y + 562, '帮助你提前认识现场', 10, palette.muted) + button(x + 18, y + 590, 154, '上传实拍', true) + button(x + 188, y + 590, 154, '分享感受');
  return s;
}
function photoCard(x, y, source, location, tags, color) {
  return rect(x, y, 157, 226, palette.panel, 7, palette.border) + rect(x, y, 157, 112, color, 7) + text(x + 78, y + 62, '现场照片', 12, palette.text, 600, 'middle') + text(x + 10, y + 134, source, 10, palette.orange, 700) + text(x + 147, y + 134, location, 9, palette.muted, 400, 'end') + text(x + 10, y + 157, tags, 8, palette.muted) + text(x + 10, y + 185, '演示场次 A', 8, palette.muted) + text(x + 147, y + 185, '热心观众', 8, palette.muted, 400, 'end');
}
function uploadBody(x, y) {
  let s = rect(x + 14, y + 138, 332, 558, palette.panel, 10, palette.border) + text(x + 30, y + 166, '上传实拍', 18, palette.text, 700) + text(x + 30, y + 187, '确认真实拍摄位置，审核后公开', 9, palette.muted) + line(x + 30, y + 199, x + 75, y + 199, palette.orange, 3);
  const fields = [['场馆', '上海 LIVERSE'], ['演出场次', '演示场次 A'], ['实际拍摄分区', '请选择分区'], ['楼层 / 排号 / 座位号', '1F  /  3排  /  12号']];
  fields.forEach(([label, value], i) => { const yy = y + 220 + i * 47; s += text(x + 30, yy, label, 9, palette.muted) + rect(x + 30, yy + 8, 300, 29, palette.surface, 5, palette.border) + text(x + 42, yy + 27, value, 10, i === 2 ? palette.muted : palette.text, 500); });
  s += rect(x + 30, y + 420, 300, 56, palette.surface, 6, palette.orange) + text(x + 180, y + 446, '+  添加现场照片', 11, palette.orange, 600, 'middle') + text(x + 180, y + 465, '最多 4 张 · 单张不超过 20 MB', 8, palette.muted, 400, 'middle');
  s += text(x + 30, y + 507, '视角标签（选填）', 9, palette.muted) + chip(x + 30, y + 517, 57, '无遮挡', true) + chip(x + 95, y + 517, 70, '栏杆遮挡') + chip(x + 173, y + 517, 70, '音响遮挡') + chip(x + 251, y + 517, 79, '屏看得清楚');
  s += text(x + 30, y + 574, '署名', 9, palette.muted) + rect(x + 30, y + 583, 300, 29, palette.surface, 5, palette.border) + text(x + 42, y + 602, '热心观众', 10, palette.text, 500) + text(x + 30, y + 635, '□  我确认内容为本人拍摄，并同意审核通过后公开', 9, palette.muted) + button(x + 30, y + 652, 300, '提交实拍', true, 38);
  return s;
}
function meBody(x, y) {
  let s = rect(x + 18, y + 140, 324, 84, palette.panel, 8, palette.border) + rect(x + 32, y + 157, 45, 45, palette.orange, 23) + text(x + 54, y + 186, '热', 18, palette.ink, 700, 'middle') + text(x + 92, y + 174, '热心观众', 13, palette.text, 700) + text(x + 92, y + 194, '公开署名 · 本机演示', 9, palette.muted);
  s += rect(x + 18, y + 240, 101, 57, palette.panel, 7, palette.border) + rect(x + 129, y + 240, 101, 57, palette.panel, 7, palette.border) + rect(x + 240, y + 240, 102, 57, palette.panel, 7, palette.border);
  [['0', '我的投稿'], ['0', '实拍'], ['0', '感受']].forEach(([num, label], i) => { const cx = x + 68 + i * 111; s += text(cx, y + 263, num, 18, palette.orange, 700, 'middle') + text(cx, y + 282, label, 9, palette.muted, 400, 'middle'); });
  s += text(x + 18, y + 341, '投稿记录', 16, palette.text, 700) + text(x + 342, y + 341, '本机演示', 9, palette.muted, 400, 'end');
  s += rect(x + 18, y + 360, 324, 67, palette.panel, 7, palette.border) + rect(x + 30, y + 372, 44, 44, palette.surface, 5) + text(x + 52, y + 399, '◎', 18, palette.muted, 500, 'middle') + text(x + 86, y + 387, '还没有投稿记录', 11, palette.text, 600) + text(x + 86, y + 407, '去“在现场”上传照片或分享感受', 9, palette.muted);
  s += text(x + 18, y + 472, '隐私与数据管理', 11, palette.text, 500) + text(x + 342, y + 472, '›', 18, palette.muted, 400, 'end') + line(x + 18, y + 486, x + 342, y + 486, palette.border) + text(x + 18, y + 518, '反馈与举报进度', 11, palette.text, 500) + text(x + 342, y + 518, '›', 18, palette.muted, 400, 'end');
  return s;
}

export function renderBoard() {
  const width = 1440, height = 1200;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Microsoft YaHei, PingFang SC, sans-serif"><title>LIVERSE v3 全深色三板块 UI 架构</title><desc>看视野、在现场、上传实拍和我的四个深色界面状态。</desc>`;
  s += rect(0, 0, width, height, palette.ink, 0) + text(54, 68, 'LIVERSE  /  三板块 UI 设计 v3', 36, palette.text, 800) + text(54, 106, '全深色品牌系统 · 看视野 / 在现场 / 我的 · 2026.11.12', 18, palette.muted) + line(54, 136, 178, 136, palette.orange, 5) + text(54, 174, '黑色剧场空间承载全部功能，品牌橙只用于识别、选择和主要操作。', 18, palette.text, 500);
  for (const [i, color] of Object.values(palette).entries()) { const x = 54 + i * 142; s += rect(x, 197, 22, 22, color, 4, palette.border) + text(x + 30, 214, color, 12, palette.muted); }
  const frames = [
    { x: 54, title: '01  看视野 / 已选位置', body: lookBody, active: 0 },
    { x: 396, title: '02  在现场 / 内容浏览', body: onsiteBody, active: 1 },
    { x: 738, title: '03  上传实拍 / 表单浮层', body: uploadBody, active: 1 },
    { x: 1080, title: '04  我的 / 投稿状态', body: meBody, active: 2 },
  ];
  frames.forEach(({ x, title, body, active }) => { s += text(x, 264, title, 17, palette.text, 700) + frame(x, 282, title.slice(4), '上海 LIVERSE · 深色功能面', body, active); });
  s += line(54, 1140, 1386, 1140, palette.border) + text(54, 1172, '示意图只表达信息层级和组件关系；正式座位图、投稿照片和审核数据以产品数据为准。', 14, palette.muted) + '</svg>';
  return s;
}

async function main() {
  const output = fileURLToPath(new URL('../output/ui/', import.meta.url));
  await mkdir(output, { recursive: true });
  const stem = path.join(output, 'LIVERSE_看视野在现场我的_UI架构示意');
  const svg = renderBoard();
  await writeFile(`${stem}.svg`, svg, 'utf8');
  await sharp(Buffer.from(svg)).png().toFile(`${stem}.png`);
  console.log(`Generated ${stem}.{svg,png}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
