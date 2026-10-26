# 部署与恢复

本机示例不对公网发布。Docker 文件未在当前机器实际运行，先在预发布环境验证。

1. 从 `.env.example` 创建 `.env.production`，使用托管 PostgreSQL 地址或 Compose 服务名 `postgres`，注入真实微信、COS、运营联系邮箱与 HTTPS `APP_ORIGIN`。秘密不进 Git。
2. 构建镜像，单独一次执行 `prisma migrate deploy`，不要让每个 API 副本抢跑迁移。
3. API 与 Worker 分开运行；网关提供后台静态目录 `dist/admin`，`/api/` 转发 API；设置请求大小、连接超时、限流和 HTTPS。生产不运行示例 seed 或开发登录。
4. 首个运营账号用 `admin:create` 创建，使用 Argon2id 和 TOTP；授予所需最小角色。无默认密码。
5. 对 `/api/v1/health`、队列失败数／积压时间、图片处理失败、HTTP 错误率、数据库与出网设置告警。

数据库启用备份与时间点恢复；私有 COS 开启版本／生命周期。正式保留期、RPO、RTO、预算与负责人必须由运营确定。恢复后先核对删除和下架审计，确认没有重新开放已撤下媒体，再恢复服务。

代码回退使用已验证的旧镜像；布局回退使用当前版本指针，不覆盖历史布局。Git 回退不能恢复媒体删除或数据库数据。

生产发布仍受 `docs/implementation.md` 的未完成项约束，尤其是真实资产、微信真机、内容安全检测、运营政策与恢复演练。
