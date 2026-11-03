# LIVERSE 观演视野

当前下一版 Demo 设计见[上海首版 Demo 产品设计](docs/demo-product-design.md)：上海单馆、指定真实2D座位图、场馆／场次与楼层切换、同页选位及三种3D模式占位。以下运行与线上体验说明描述既有实现，尚未按新方案改版。

北京 LIVERSE 原生微信小程序、NestJS API、图片 Worker 与 React 运营后台。当前交付为可运行的开发版本，正式场馆坐标、模型校准、微信与腾讯云联调和真机验收尚未完成。

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

## 独立体验 Demo

[免登录线上体验](https://miracleplus.feishu.link/app/app_17gv6eymhad)，可直接转发给他人。2026-10-27 已验证桌面／手机流程；参考图片签名最早于北京时间 2026-11-26 10:03 到期，届时需续签并发布。完整发布信息见 `infra/demo-hosting.json` 与实施记录。

不需要数据库、微信登录或运营账号。先运行 `pnpm build:demo`，再运行 `pnpm demo`，打开 [体验版](http://127.0.0.1:4173/)。同一局域网的其他设备可使用运行电脑的内网 IP 和 4173 端口访问；需要防火墙允许该端口。外网用户需要将 `dist/demo/index.html` 与 `dist/demo/assets/` 部署到 HTTPS 静态托管服务。

`dist/demo` 包含免依赖的 Node.js 静态服务器与 Windows 启动脚本，可打包转发。体验内容包括两层示例排座、3D 环顾与坐站姿、两个位置对比、本机收藏和位置分享。座位与模型均为开发示例；图片保留来源说明。无后台、上传或数据库接口，正式微信功能仍使用原生小程序。

验证：`pnpm test:demo` 在桌面和手机视口验证无需 API 的完整体验、分享、收藏持久化和静态服务访问边界。

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
pnpm test:e2e
pnpm audit --audit-level=low
```

单元和接口测试自动启动独立 PostgreSQL 55433，执行真实迁移并清理。浏览器测试需要本机开发库和服务，使用已安装的 Chrome；真实运营测试只在指定本机数据库中创建临时测试账号和投稿，完成后清理。截图输出到 `output/verification/`。

## 工程目录

- `apps/miniprogram`：原生 TypeScript、WXML、WXSS 页面与微信能力封装。
- `apps/api`：公开／个人／运营 API、Prisma 迁移、私有媒体处理及 Worker。
- `apps/admin`：内容审核、官方资料录入、布局发布、工单和操作记录。
- `packages/contracts`、`packages/venue-core`：共享校验、位置、坐标、对比与相机计算。
- `packages/venue-renderer`：Three.js r133 示例场景与渲染生命周期。
- `fixtures`：仅开发使用的示例布局。
- `assets`：有来源登记的开发参考影像。
- `infra`：Docker 与 PostgreSQL 部署参考。

## 交付边界

[实施与验证记录](docs/implementation.md)列出已实现能力、方案差异及未验证项。[产品设计文档](docs/product-design.md)和[技术方案](docs/technical-design.md)保留为设计基线；正式上线须补齐真实资产、主体与域名、微信授权、运营政策和真机报告，不应把开发示例作为公众可用的真实看座服务。
