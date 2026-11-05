import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

// Static design documentation only. These frames are states of one page.
export const palette = Object.freeze({
  orange: '#FF5018', background: '#0B0D10', panel: '#171A1F',
  surface: '#242A32', text: '#F5F6F7', muted: '#A8ADB5',
  border: '#68727E', warning: '#F3C46B',
});

export const frames = Object.freeze([
  { id: 'map-empty', title: '2D · 默认进入', view: '2D', selected: false,
    note: ['上海 / 演示场次 A / 1F / 未选位置。', '直接进入地图，不增加宣传首页。'] },
  { id: 'map-selected', title: '2D · 已选位置', view: '2D', selected: true,
    note: ['只高亮一个位置，摘要与地图同步。', '复位保留选择；切换其他楼层清空。'] },
  { id: 'overview', title: '3D · 场馆总览', view: '3D', mode: '场馆总览', selected: true,
    note: ['保留原位置；总览尚未接入模型。', '2D地图工具隐藏，三模式入口出现。'] },
  { id: 'audience-empty', title: '3D · 观众视角 / 未选位置', view: '3D', mode: '观众视角', selected: false,
    note: ['未选座也能切换模式，提供选位引导。', '不自动生成默认座位或假视野。'] },
  { id: 'phone-selected', title: '3D · 手机取景 / 已选位置', view: '3D', mode: '手机取景', selected: true,
    note: ['仅保留取景框与排座摘要。', '不申请相机权限，不显示倍率或快门。'] },
  { id: 'position-sheet', title: '位置浮层 · 3D内更换位置', view: '3D', mode: '观众视角', selected: true, sheet: true,
    note: ['确认前为草稿，取消不改变原位置。', '确认同步楼层与座位，继续当前模式。'] },
]);

const { orange, background, panel, surface, text: white, muted, border, warning } = palette;
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const txt = (x, y, value, size = 14, fill = white, weight = 400, anchor = 'start') =>
  `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${escape(value)}</text>`;
const rect = (x, y, w, h, fill, radius = 8, stroke = 'none') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`;
const line = (x1, y1, x2, y2, color = border, width = 1) =>
  `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${width}"/>`;
function button(x, y, w, label, active = false, h = 44) {
  return rect(x, y, w, h, active ? orange : surface, 8)
    + txt(x + w / 2, y + h / 2 + 5, label, 14, active ? background : white, 600, 'middle');
}
function tabs(y, labels, current) {
  const width = (343 - (labels.length - 1) * 8) / labels.length;
  return labels.map((label, i) => button(16 + i * (width + 8), y, width, label, i === current)).join('');
}
function position(selected) {
  return txt(16, 690, selected ? '已选位置' : '当前位置', 12, muted)
    + txt(16, 715, selected ? '上海 LIVERSE · 1F前区' : '尚未选择位置', 16, white, 600)
    + (selected ? txt(16, 738, '1排1号', 16, white, 600) : txt(16, 738, '在地图点选，或使用选位置', 12, muted))
    + button(16, 751, selected ? 231 : 343, selected ? '更换位置' : '选位置', true, 48)
    + (selected ? button(255, 751, 104, '清除选择', false, 48) : '');
}
function map(selected) {
  let s = rect(16, 268, 343, 352, background, 8, border)
    + txt(30, 290, '1F · 场次座位布局', 13, white, 600)
    + txt(30, 310, '已读取769个编号', 12, muted)
    + txt(187, 336, '↑ 舞台方向', 13, white, 600, 'middle');
  // Deliberately schematic areas, not a fabricated seating grid or real coordinates.
  for (const [y, label, detail, w] of [[354, '前区', '1–12排', 254], [428, '中区', '13–19排', 228], [502, '后区', '20–23排', 202]]) {
    const left = (375 - w) / 2;
    s += rect(left, y, w, 60, surface, 4, muted)
      + txt(left + 12, y + 23, label, 14, white, 600)
      + txt(left + 12, y + 44, detail, 12, muted);
  }
  s += txt(187, 421, '过道', 10, muted, 400, 'middle')
    + rect(242, 445, 49, 27, panel, 3, border) + txt(266, 463, '控台', 11, muted, 400, 'middle');
  if (selected) {
    s += `<circle cx="270" cy="380" r="12" fill="${orange}" stroke="${white}" stroke-width="2"/>`
      + txt(270, 385, '✓', 14, background, 700, 'middle');
  }
  s += button(30, 570, 44, '−') + button(82, 570, 44, '+') + button(283, 570, 62, '复位')
    + txt(16, 640, '区域框为结构示意，非逐座坐标', 12, muted)
    + txt(16, 660, '正式图保留原图编号、过道与不规则边界', 12, muted);
  return s;
}
function modeIcon(mode) {
  const x = 187, y = 356;
  const shape = mode === '场馆总览'
    ? rect(x - 22, y - 14, 44, 28, 'none', 3, orange) + line(x - 9, y - 14, x - 9, y + 14, orange) + line(x + 9, y - 14, x + 9, y + 14, orange)
    : `<path d="M${x - 26} ${y} Q${x} ${y - 27} ${x + 26} ${y} Q${x} ${y + 27} ${x - 26} ${y}Z" fill="none" stroke="${orange}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="7" fill="none" stroke="${orange}" stroke-width="2"/>`;
  return shape;
}
function placeholder(frame) {
  let s = rect(16, 268, 343, 322, background, 8, border)
    + txt(30, 291, '3D视图 · 占位', 12, muted)
    + modeIcon(frame.mode)
    + txt(187, 410, frame.mode, 24, white, 600, 'middle')
    + txt(187, 442, '3D模型暂未接入', 16, muted, 400, 'middle');
  if (!frame.selected) s += txt(187, 480, '请先选择位置', 15, white, 400, 'middle');
  else s += txt(187, 480, '1F前区 · 1排1号', 15, white, 600, 'middle');
  if (frame.mode === '场馆总览') {
    s += txt(187, 515, '接入模型后将在总览中标记该位置', 12, muted, 400, 'middle');
  }
  if (frame.mode === '手机取景') {
    s += `<path d="M47 330v-18h24 M304 312h24v18 M47 529v18h24 M304 547h24v-18" fill="none" stroke="${border}" stroke-width="2"/>`;
  }
  s += tabs(602, ['场馆总览', '观众视角', '手机取景'], ['场馆总览', '观众视角', '手机取景'].indexOf(frame.mode))
    + txt(187, 667, '回到2D选位置', 13, white, 500, 'middle');
  return s;
}
function sheet() {
  return `<g data-overlay="position">`
    + `<rect x="0" y="0" width="375" height="812" rx="12" fill="${background}" fill-opacity="0.78"/>`
    + rect(0, 350, 375, 462, panel, 16, border)
    + rect(164, 361, 47, 4, border, 2)
    + txt(16, 405, '选择位置', 22, white, 600)
    + txt(343, 405, '×', 24, muted, 400, 'middle')
    + txt(16, 442, '楼层', 13, muted)
    + tabs(455, ['1F 一楼', '2F 二楼'], 0)
    + txt(16, 530, '排号', 13, muted) + txt(195, 530, '座号', 13, muted)
    + button(16, 542, 164, '1排   ▾') + button(195, 542, 164, '1号   ▾')
    + txt(16, 617, '草稿 · 1F前区 · 1排1号', 14, white, 600)
    + txt(16, 641, '确认后更新位置，保持当前3D模式', 12, muted)
    + button(16, 664, 343, '确认位置', true, 48)
    + txt(187, 740, '回到2D选位置', 13, white, 500, 'middle')
    + txt(187, 777, '取消', 14, muted, 500, 'middle') + '</g>';
}
function phone(frame, x, y) {
  const selected = frame.selected;
  let s = `<g id="${frame.id}" data-view="${frame.view}" data-selected="${selected}" data-mode="${frame.mode ?? ''}" transform="translate(${x} ${y})">`
    + rect(0, 0, 375, 812, background, 12, border)
    + txt(16, 27, '微信顶部安全区', 11, muted)
    + rect(273, 9, 86, 27, surface, 14) + txt(316, 28, '···  |  ○', 13, white, 400, 'middle')
    + button(16, 44, 186, '上海 LIVERSE  ▾') + button(210, 44, 149, '演示场次 A  ▾')
    + txt(16, 114, '全坐席（有过道）1184', 15, white, 600)
    + txt(16, 141, '图纸标注1184座，7座编号待核对', 12, warning)
    + tabs(158, ['2D 座位图', '3D 视图'], frame.view === '2D' ? 0 : 1)
    + tabs(210, ['1F 一楼', '2F 二楼'], 0)
    + (frame.view === '2D' ? map(selected) : placeholder(frame))
    + position(selected);
  if (frame.sheet) s += sheet();
  return s + '</g>';
}

export function renderBoard() {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="1360" height="2370" viewBox="0 0 1360 2370" font-family="Microsoft YaHei, PingFang SC, sans-serif">
  <title>LIVERSE 上海单页探索 · UI方案 v2</title>
  <desc>同一页面的六个状态，保持原橙黑白色板。2D区域框为结构示意，正式地图应按原图逐座还原；3D模型暂未接入，手机取景没有真实相机效果。</desc>`;
  s += rect(0, 0, 1360, 2370, background, 0)
    + txt(64, 78, 'LIVERSE  /  上海单页探索', 42, white, 700)
    + txt(64, 122, 'UI方案 v2 · 2026.11.05 · 同一页面的状态切换', 20, muted)
    + line(64, 153, 216, 153, orange, 4)
    + txt(64, 190, '一个主探索页   /   场馆、场次与位置浮层   /   2D地图与三种3D模式同页切换', 19, white);
  [orange, background, panel, surface, white, muted, border, warning].forEach((color, i) => {
    const x = 64 + i * 153;
    s += rect(x, 215, 22, 22, color, 4, border) + txt(x + 30, 232, color, 14, muted);
  });
  frames.forEach((frame, i) => {
    const x = 64 + (i % 3) * 428;
    const row = i < 3 ? 0 : 1;
    const y = 322 + row * 986;
    s += txt(x, y - 30, `${String(i + 1).padStart(2, '0')} / ${frame.title}`, 19, white, 600)
      + phone(frame, x, y)
      + txt(x, y + 847, frame.note[0], 15, muted)
      + txt(x, y + 875, frame.note[1], 15, muted);
  });
  s += line(64, 2220, 1296, 2220, border)
    + txt(64, 2260, '2D结构示意，不代表已完成逐座还原；区域框与标记不作真实坐标依据。', 18, white, 500)
    + txt(64, 2295, '产品依据：docs/demo-product-design.md v1.0。全部3D状态为占位，不含实拍、模型或相机画面。', 17, muted)
    + txt(64, 2330, '交互规范、异常状态与验收对应见配套UI方案；浏览器图稿不等同于微信真机验证。', 17, muted)
    + '</svg>';
  return s;
}

async function main() {
  const output = fileURLToPath(new URL('../output/ui/', import.meta.url));
  await mkdir(output, { recursive: true });
  const stem = path.join(output, 'LIVERSE_UI方向与页面结构');
  const svg = renderBoard();
  await writeFile(`${stem}.svg`, svg, 'utf8');
  await sharp(Buffer.from(svg)).png().toFile(`${stem}.png`);
  console.log('Generated output/ui/LIVERSE_UI方向与页面结构.{svg,png}');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
