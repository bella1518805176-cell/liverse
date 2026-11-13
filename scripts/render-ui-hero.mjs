import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const palette = Object.freeze({
  orange: '#FF5018',
  ink: '#0B0D10',
  panel: '#171A1F',
  surface: '#242A32',
  text: '#F5F6F7',
  muted: '#A8ADB5',
  border: '#68727E',
});

const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const text = (x, y, value, size = 14, fill = palette.text, weight = 400, anchor = 'start') => `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${esc(value)}</text>`;
const rect = (x, y, w, h, fill, radius = 0, stroke = 'none', opacity = 1) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}" opacity="${opacity}"/>`;
const line = (x1, y1, x2, y2, color = palette.border, width = 1) => `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${width}"/>`;

function button(x, y, w, label, active = false, h = 44) {
  return rect(x, y, w, h, active ? palette.orange : palette.ink, 3, active ? palette.orange : palette.text, active ? 1 : 0.8) + text(x + w / 2, y + h / 2 + 5, label, 13, active ? palette.ink : palette.text, 700, 'middle');
}

function logo(x, y, scale = 1) {
  return text(x, y, 'LIVERSE', 28 * scale, palette.orange, 800) + line(x, y + 12 * scale, x + 142 * scale, y + 12 * scale, palette.orange, 3 * scale);
}

function heroScene(x, y, w, h, imageHref, mobile = false) {
  const contentX = x + (mobile ? 24 : 42);
  const bottomY = y + h - (mobile ? 168 : 188);
  let s = `<defs><clipPath id="hero-${x}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12"/></clipPath></defs>`;
  s += `<g clip-path="url(#hero-${x})">`;
  s += rect(x, y, w, h, palette.ink);
  s += `<image href="${imageHref}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" opacity="${mobile ? 0.68 : 0.76}"/>`;
  s += rect(x, y, mobile ? w : w * 0.62, h, palette.ink, 0, 'none', mobile ? 0.62 : 0.74);
  s += rect(x, y + h * 0.64, w, h * 0.36, palette.ink, 0, 'none', 0.88);
  s += rect(x + 18, y + 18, w - 36, h - 36, 'none', 0, palette.border, 0.55);
  s += logo(contentX, y + (mobile ? 54 : 64), mobile ? 0.78 : 1);
  s += text(x + w - (mobile ? 24 : 42), y + 55, '上海 LIVERSE', 11, palette.text, 600, 'end');
  s += text(x + w - (mobile ? 24 : 42), y + 76, '场馆影像 / VI 参考', 9, palette.muted, 400, 'end');
  s += text(contentX, bottomY - (mobile ? 100 : 80), 'LIVERSE', mobile ? 20 : 24, palette.orange, 800);
  s += line(contentX, bottomY - (mobile ? 75 : 46), contentX + (mobile ? 36 : 54), bottomY - (mobile ? 75 : 46), palette.orange, 4);
  s += mobile
    ? `<text x="${contentX}" y="${bottomY - 34}" fill="${palette.text}" font-size="25" font-weight="800"><tspan x="${contentX}">属于你的现场，</tspan><tspan x="${contentX}" dy="34">从这里看见</tspan></text>`
    : text(contentX, bottomY, '属于你的现场，从这里看见', 39, palette.text, 800);
  if (mobile) {
    s += text(contentX, bottomY + 31, '从座位出发，提前了解舞台视角与真实现场', 10, palette.muted, 400);
    s += button(contentX, bottomY + 61, 128, '开始看视野', true, 40);
    s += button(contentX + 138, bottomY + 61, 112, '进入在现场', false, 40);
  } else {
    s += text(contentX, bottomY + 34, '从座位出发，提前了解舞台视角与真实现场', 14, palette.muted, 400);
    s += button(contentX, bottomY + 66, 154, '开始看视野', true);
    s += button(contentX + 166, bottomY + 66, 136, '进入在现场');
  }
  const navY = y + h - 52;
  s += line(x + 18, navY - 18, x + w - 18, navY - 18, palette.border, 1);
  for (const [index, label] of ['看视野', '在现场', '我的'].entries()) {
    const cx = x + w * (index + 0.5) / 3;
    s += index === 0 ? rect(cx - 22, navY - 18, 44, 2, palette.orange) : '';
    s += text(cx, navY + 4, label, 10, index === 0 ? palette.text : palette.muted, index === 0 ? 700 : 400, 'middle');
  }
  s += `</g>`;
  return s;
}

export async function renderHero() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const source = path.join(root, 'tmp/vi-pages/shanghai-6-06.png');
  const image = await sharp(source).extract({ left: 30, top: 83, width: 372, height: 470 }).png().toBuffer();
  const imageHref = `data:image/png;base64,${image.toString('base64')}`;
  const width = 1440;
  const height = 1180;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Microsoft YaHei, PingFang SC, sans-serif"><title>LIVERSE Hero 入口页 UI 示意</title><desc>以 VI 场馆影像作为入口承接，主入口进入看视野，次入口进入在现场，底部保留三板块导航。</desc>`;
  svg += rect(0, 0, width, height, palette.ink);
  svg += text(54, 68, 'LIVERSE  /  HERO 入口承接页', 36, palette.text, 800);
  svg += text(54, 106, '真实场馆影像 · 黑色内容层 · 开始看视野 / 进入在现场 · 2026.11.13', 18, palette.muted);
  svg += line(54, 136, 178, 136, palette.orange, 5);
  svg += text(54, 174, '首屏先建立现场感，再把用户送进真实可用的三板块功能。', 18, palette.text, 500);
  svg += text(54, 210, '图片来源：上海 LIVERSE VI 场馆介绍资料中的场馆影像，正式上线需确认授权。', 13, palette.muted, 400);
  svg += text(54, 258, '桌面端  1440 × 900 内容区', 16, palette.text, 700);
  svg += heroScene(54, 282, 780, 812, imageHref, false);
  svg += text(900, 258, '移动端  390 × 844', 16, palette.text, 700);
  svg += heroScene(900, 282, 360, 812, imageHref, true);
  svg += rect(1292, 282, 94, 812, palette.panel, 8, palette.border);
  svg += text(1310, 318, '承接逻辑', 14, palette.orange, 700);
  svg += line(1310, 334, 1350, 334, palette.orange, 3);
  const notes = [
    ['01', '品牌影像', '先用真实场馆建立现场感'],
    ['02', '主入口', '开始看视野 → 选座与视角'],
    ['03', '次入口', '进入在现场 → 实拍与感受'],
    ['04', '继续探索', '首屏底部露出三板块 Tab'],
  ];
  notes.forEach(([number, title, body], index) => {
    const yy = 378 + index * 142;
    svg += text(1310, yy, number, 12, palette.orange, 800);
    svg += text(1340, yy, title, 12, palette.text, 700);
    svg += text(1310, yy + 27, body, 10, palette.muted, 400);
    if (index < notes.length - 1) svg += line(1310, yy + 55, 1368, yy + 55, palette.border);
  });
  svg += text(54, 1134, '示意图只表达入口层级、图片使用方式和交互去向；不代表已接入真实 3D、交易或实时演出能力。', 14, palette.muted);
  svg += '</svg>';
  const output = path.join(root, 'output/ui');
  await mkdir(output, { recursive: true });
  const stem = path.join(output, 'LIVERSE_Hero入口页_UI示意');
  await writeFile(`${stem}.svg`, svg, 'utf8');
  await sharp(Buffer.from(svg)).png().toFile(`${stem}.png`);
  return stem;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Generated ${await renderHero()}.{svg,png}`);
}
