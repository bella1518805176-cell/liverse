# LIVERSE 观演视野

LIVERSE 是一个无需账号的上海演出场馆 Demo：在 2D 座位图里选座，切换 3D 视角看舞台，并体验现场投稿。

设计基线见[上海首版 Demo 产品设计](docs/demo-product-design.md)。当前 Demo 使用上海单馆、两层座位和可交互 3D 估算模型。

配套[UI设计方案 v2](output/ui/LIVERSE_座位视野模拟器_UI设计方案.md)与[单页状态示意图](output/ui/LIVERSE_UI方向与页面结构.png)已按该范围调整，延续原有橙黑白配色。

当前三板块功能的完整交付方案见[UI设计方案 v4](output/ui/LIVERSE_完整UI设计方案_v4.md)。迭代过程和详细架构仍保留在[UI设计方案 v3](output/ui/LIVERSE_看视野在现场我的_UI设计方案_v3.md)、[全深色架构示意图](output/ui/LIVERSE_看视野在现场我的_UI架构示意.png)和[Hero入口页示意图](output/ui/LIVERSE_Hero入口页_UI示意.png)。本版将看视野、在现场、我的以及实拍投稿统一到 LIVERSE 黑橙白 VI 系统，并用真实场馆影像承接进入功能。

## 运行公开 Demo

需要 Node.js 24。进入 [apps/demo](apps/demo) 后运行：

```sh
cd apps/demo
npm install
npm run dev
```

开发地址为 [localhost:5173](http://localhost:5173/)。在同一目录运行 `npm run build` 生成 `dist/`，再运行 `npm run preview` 从 [127.0.0.1:4173](http://127.0.0.1:4173/) 体验生产构建。

## 部署到 Cloudflare Pages

将仓库推送到 GitHub 后，在 Cloudflare 控制台创建一个 **Pages** 项目，选择 **Connect to Git**，绑定该仓库，并填写下列参数：

| 配置 | 值 |
| --- | --- |
| 生产分支 | `main` |
| 根目录 | `apps/demo` |
| 框架预设 | None |
| 构建命令 | `npm ci && npm run build` |
| 输出目录（相对于根目录） | `dist` |
| 构建环境变量 | `NODE_VERSION=24`、`SKIP_DEPENDENCY_INSTALL=1` |
| 生产分支自动部署 | 启用 |

首次绑定并构建成功后，Pages 会给出可公开访问的 `pages.dev` 地址。随后 `git push origin main` 会自动更新同一地址。访客可以直接打开；无需开启 Cloudflare Access。站点部署在域名根路径；Vite 会处理相对导入的图片，`public/_redirects` 会复制到产物，使 `/seats`、`/onsite` 和 `/me` 可以直达和刷新。

## Demo 使用与限制

- **看视野**：选择场次和楼层，在 2D 图上选位，然后从该位置看舞台，或查看 3D 总览和手机取景。
- **在现场**：按场次、分区、内容类型和标签看示例；可模拟投稿。**我的**显示本机模拟待审核记录。
- 投稿文字保存在 localStorage，图片保存在 IndexedDB，不会上传或公开。刷新后可恢复；更换设备、浏览器或站点域名会使用独立存储，清除站点数据会删除记录。隐私模式或浏览器策略可能限制存储。
- 座位与模型用于演示，视野为估算；现场参考列表是样例。3D 需要 WebGL，可用 2D 图继续选位。

## 后续迭代

- [mock/shanghai.json](apps/demo/src/mock/shanghai.json) 管理场馆、场次、布局和参考内容；[3D 落位数据](apps/demo/src/mock/shanghai-3d-placement-estimate.json) 管理逐座坐标。可在 [demo-data.ts](apps/demo/src/demo-data.ts) 和 [venue-data.ts](apps/demo/src/venue-data.ts) 将 JSON 数据源替换成后端接口。
- [submissions.ts](apps/demo/src/submissions.ts) 集中处理投稿读写。接入服务端后，可将文字写入数据库，照片写入对象存储，并从审核接口读取状态。
- Demo 当前没有外部 API 或密钥。未来可复制 `apps/demo/.env.example` 为 `apps/demo/.env.local`，本地设置 `VITE_API_BASE_URL`；线上在 Pages 项目的环境变量中设置公开 API 地址。秘密密钥只留在后端环境变量，所有 `VITE_*` 都会暴露给浏览器。模板不包含真实凭据。

## 其他工程

仓库还保留原有北京 LIVERSE 微信小程序、NestJS API、图片 Worker 与 React 运营后台。它们独立于公开 Demo。

## 本地运行

需要 Node.js 24、pnpm 11.25.0。仓库不含真实凭据；复制 `.env.example` 为本机 `.env` 并填写配置。开发数据库可使用内置 PostgreSQL，无需 Docker。

```powershell
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:local
```

保持数据库进程运行，在另一终端执行：

```powershell
pnpm db:migrate
pnpm db:seed
pnpm dev
```

开发预览：`http://127.0.0.1:5173/?preview=1`；运营后台：`http://127.0.0.1:5173/`；API 文档：`http://127.0.0.1:3000/api/docs`。浏览器预览用于验证选位与视角交互，不替代原生小程序或真机验证。

示例编号：楼层「示例 1F」、排「D01」、号「01」。示例不是正式场馆排座；数据库不自动生成场次、用户投稿、互动数量或运营账号。

## 免登录访客体验

运行 `pnpm build:guest` 生成单个 HTML 文件 `dist/guest/index.html`。可直接把文件发给体验者，用支持 WebGL 的桌面浏览器打开即可离线体验。要给手机用户发一个可直接点开的链接，把同一个文件上传到普通 HTTPS 静态托管即可。运行 `pnpm serve:guest` 可在 [本机预览](http://127.0.0.1:4174/)。

访客可以在两层北京示例排座中选座、查看 3D 坐姿和站姿、对比两个位置，以及在浏览器中收藏。网页托管后可分享指定座位的链接。体验使用程序生成的座位和舞台示意，全程无需账号或后端服务。

`pnpm test:guest` 在桌面和手机浏览器视口验证离线文件与静态网页。

## 微信开发者工具

```powershell
pnpm build:mini
```

导入 `dist/miniprogram`。默认游客 AppID 可用于开发工具检查部分公开页面；微信登录、上传权限和真机预览需真实 AppID。开发工具本机调试需关闭合法域名校验；真机请配置 `MINI_API_BASE` 指向可访问的 HTTPS API。修改配置后重新构建。首页、实拍、我的为主包；地图、视野、对比为分包。

正式构建运行 `pnpm exec tsx scripts/build-mini.ts --production`，必须设置 `MINI_APP_ID` 和 HTTPS `MINI_API_BASE`。构建拒绝缺失配置和示例依赖；服务端另行拒绝正式环境发布示例布局。

## 运营账号

无默认账号或默认密码。设置临时环境变量后运行一次性命令：

```powershell
$env:ADMIN_USERNAME = 'your_operator'
$env:ADMIN_PASSWORD = 'a-unique-password-at-least-14-characters'
$env:ADMIN_ROLE = 'system'
pnpm admin:create
Remove-Item Env:ADMIN_PASSWORD
```

角色为 `content`（审核、官方资料及工单）、`layout`（布局）和 `system`（全部）。生产账号还必须配置 `ADMIN_TOTP_SECRET`。后台 Cookie 会话、Origin 和 CSRF 校验均由 API 执行。

## 验证

```powershell
pnpm test
pnpm build
pnpm build:demo
pnpm test:demo
pnpm test:e2e
pnpm audit --audit-level=low
```

单元和接口测试自动启动独立 PostgreSQL 55433，执行真实迁移并清理。浏览器测试需要本机开发库和服务，使用已安装的 Chrome；真实运营测试只在指定本机数据库中创建临时测试账号和投稿，完成后清理。截图输出到 `output/verification/`。

## 工程目录

- `apps/miniprogram`：原生 TypeScript、WXML、WXSS 页面与微信能力封装。
- `apps/api`：公开／个人／运营 API、Prisma 迁移、私有媒体处理及 Worker。
- `apps/admin`：内容审核、官方资料录入、布局发布、工单和操作记录。
- `apps/demo`：单独安装、构建和部署的公开上海 Demo。
- `packages/contracts`、`packages/venue-core`：共享校验、位置、坐标、对比与相机计算。
- `packages/venue-renderer`：Three.js r133 示例场景与渲染生命周期。
- `fixtures`：仅开发使用的示例布局。
- `assets`：有来源登记的开发参考影像。
- `infra`：Docker 与 PostgreSQL 部署参考。

## 交付边界

[实施与验证记录](docs/implementation.md)列出已实现能力、方案差异及未验证项。[产品设计文档](docs/product-design.md)和[技术方案](docs/technical-design.md)保留为设计基线；正式上线须补齐真实资产、主体与域名、微信授权、运营政策和真机报告，不应把开发示例作为公众可用的真实看座服务。
