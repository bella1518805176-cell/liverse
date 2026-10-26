import { copyFile, writeFile } from "node:fs/promises";
await copyFile("apps/demo/server.mjs", "dist/demo/server.mjs");
await writeFile(
  "dist/demo/start-demo.cmd",
  '@echo off\r\ncd /d "%~dp0"\r\nnode server.mjs\r\npause\r\n',
);
await writeFile(
  "dist/demo/README.txt",
  [
    "LIVERSE 观演视野体验版",
    "",
    "需要 Node.js 24 或更新版本，不需要安装依赖。",
    "Windows：双击 start-demo.cmd。其他系统：在本目录运行 node server.mjs。",
    "浏览器打开 http://127.0.0.1:4173/。同一局域网其他设备可使用运行电脑的内网 IP 和 4173 端口访问。",
    "静态内容也可部署到任意 HTTPS 静态网站托管服务，无需上传 server.mjs 和 start-demo.cmd。",
    "",
    "示例位置：示例 1F，D01 排，01 号。可选位、环顾、切换坐站姿、收藏及对比。",
    "座位和模型为开发示例，不代表真实场馆视野。收藏和最近浏览仅保存在本机浏览器。",
    "不提供微信登录、上传投稿、售票或后台操作。",
    "场馆图片来自项目提供的宣传资料，公开传播前需权利方确认。",
  ].join("\r\n"),
);
console.log("Standalone demo packaged in dist/demo");
