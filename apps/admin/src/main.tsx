import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ConfigProvider,
  theme,
  App as AntApp,
  Button,
  Input,
  Form,
  Table,
  Tag,
  Modal,
  Select,
  Empty,
  Spin,
  Alert,
  Image,
  Statistic,
} from "antd";
import {
  LayoutDashboard,
  Map,
  Images,
  MessageSquare,
  ScrollText,
  LogOut,
  RefreshCw,
  ArrowUpRight,
  Plus,
  ChevronRight,
  Activity,
} from "lucide-react";
import type {
  Layout,
  PublicContent,
  Ticket,
} from "../../../packages/contracts";
import { api, setCsrf } from "./api";
import { PreviewApp } from "./preview";
import { OfficialEditor } from "./official";
import "./style.css";
type AdminSession = { username?: string; role: string; csrf: string };
type ContentRow = PublicContent & {
  reason: string;
  media: { id: string; state: string }[];
};
type LayoutRow = { id: string; status: string; revision: number; data: Layout };
const states: Record<string, string> = {
  pending: "待审核",
  published: "已公开",
  rejected: "未通过",
  withdrawn: "已下架",
  deleted: "已删除",
  draft: "草稿",
  received: "已收到",
  processing: "处理中",
  resolved: "已解决",
  declined: "不予处理",
};
const status = (v: string) => (
  <Tag
    color={
      v === "published" || v === "resolved"
        ? "green"
        : v === "pending" || v === "draft"
          ? "orange"
          : "default"
    }
  >
    {states[v] ?? v}
  </Tag>
);
function Login({ onLogin }: { onLogin: (s: AdminSession) => void }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(values: unknown) {
    setBusy(true);
    setError("");
    try {
      const s = await api<AdminSession>("/admin/login", "POST", values);
      setCsrf(s.csrf);
      onLogin(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <div className="login-brand">
        <div className="wordmark">
          LIVERSE<span>.</span>
        </div>
        <p>北京 · 观演视野工作台</p>
        <a href="/?preview=1">
          打开开发预览 <ArrowUpRight size={16} />
        </a>
      </div>
      <section className="login-form">
        <div className="eyebrow">OPERATIONS</div>
        <h1>登录管理后台</h1>
        <p className="muted">场馆资料、现场内容与用户反馈</p>
        <Form layout="vertical" onFinish={submit}>
          <Form.Item
            name="username"
            label="运营账号"
            rules={[{ required: true }]}
          >
            <Input autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item name="otp" label="二次验证码">
            <Input autoComplete="one-time-code" maxLength={6} />
          </Form.Item>
          {error && <Alert type="error" message={error} />}
          <Button
            htmlType="submit"
            type="primary"
            aria-label="登录"
            loading={busy}
            block
          >
            登录
          </Button>
        </Form>
      </section>
    </main>
  );
}
function Workspace() {
  const [officialOpen, setOfficialOpen] = useState(false);
  const { message } = AntApp.useApp();
  const [session, setSession] = useState<AdminSession | null>(null),
    [booting, setBooting] = useState(true),
    [view, setView] = useState("overview"),
    [rows, setRows] = useState<unknown[]>([]),
    [overview, setOverview] = useState<Record<string, number>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [modal, setModal] = useState<{
      kind: string;
      item?: ContentRow | LayoutRow | Ticket;
      state?: string;
    } | null>(null),
    [note, setNote] = useState(""),
    [layoutJson, setLayoutJson] = useState("");
  useEffect(() => {
    void api<AdminSession>("/admin/me")
      .then((s) => {
        setCsrf(s.csrf);
        setSession(s);
      })
      .catch(() => {})
      .finally(() => setBooting(false));
  }, []);
  async function load() {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      if (view === "overview") setOverview(await api("/admin/overview"));
      else setRows(await api<unknown[]>(`/admin/${view}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [view, session]);
  async function action() {
    if (!modal) return;
    try {
      if (modal.kind === "review") {
        const c = modal.item as ContentRow;
        await api(`/admin/contributions/${c.id}/review`, "POST", {
          state: modal.state,
          revision: c.revision,
          reason: note,
        });
      }
      if (modal.kind === "publish") {
        const l = modal.item as LayoutRow;
        await api(`/admin/layouts/${l.id}/publish`, "POST", {
          action: modal.state,
          revision: l.revision,
        });
      }
      if (modal.kind === "reply") {
        const t = modal.item as Ticket;
        await api(`/admin/tickets/${t.id}/reply`, "POST", {
          status: modal.state,
          reply: note,
          revision: t.revision,
        });
      }
      if (modal.kind === "layout")
        await api("/admin/layouts", "POST", JSON.parse(layoutJson));
      setModal(null);
      setNote("");
      message.success("操作已完成并记录");
      await load();
    } catch (e) {
      message.error((e as Error).message);
    }
  }
  const open = (
    kind: string,
    item?: ContentRow | LayoutRow | Ticket,
    state?: string,
  ) => {
    setNote("");
    setModal({ kind, item, state });
  };
  const role = session?.role;
  const canContent = role === "content" || role === "system",
    canLayout = role === "layout" || role === "system";
  const nav = [
    {
      key: "overview",
      label: "工作概览",
      icon: LayoutDashboard,
      visible: true,
    },
    { key: "layouts", label: "场馆与布局", icon: Map, visible: canLayout },
    {
      key: "contributions",
      label: "内容审核",
      icon: Images,
      visible: canContent,
    },
    {
      key: "tickets",
      label: "反馈与举报",
      icon: MessageSquare,
      visible: canContent,
    },
    { key: "audit", label: "操作记录", icon: ScrollText, visible: true },
    {
      key: "jobs",
      label: "处理任务",
      icon: Activity,
      visible: role === "system",
    },
  ];
  if (booting)
    return (
      <div className="center">
        <Spin />
      </div>
    );
  if (!session) return <Login onLogin={setSession} />;
  return (
    <div className="workspace">
      <aside>
        <div className="wordmark">
          LIVERSE<span>.</span>
        </div>
        <div className="workspace-label">观演视野 · 运营工作台</div>
        <nav>
          {nav
            .filter((n) => n.visible)
            .map((n) => (
              <button
                key={n.key}
                className={view === n.key ? "selected" : ""}
                onClick={() => setView(n.key)}
              >
                <n.icon size={18} />
                {n.label}
                {view === n.key && <ChevronRight size={14} />}
              </button>
            ))}
        </nav>
        <div className="aside-bottom">
          <a href="/?preview=1" target="_blank" rel="noreferrer">
            <ArrowUpRight size={18} />
            开发预览
          </a>
          <button
            onClick={async () => {
              await api("/admin/logout", "POST");
              setCsrf("");
              setSession(null);
            }}
          >
            <LogOut size={18} />
            退出登录
          </button>
          <span>
            {session.username} ·{" "}
            {role === "system"
              ? "系统管理员"
              : role === "layout"
                ? "场馆管理员"
                : "内容运营"}
          </span>
        </div>
      </aside>
      <div className="workspace-body">
        <header>
          <div>
            <span className="muted">北京 LIVERSE / </span>
            {nav.find((n) => n.key === view)?.label}
          </div>
          <span className="env-tag">本地开发</span>
        </header>
        <main className="workspace-main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">LIVERSE · BEIJING</div>
              <h1>{nav.find((n) => n.key === view)?.label}</h1>
            </div>
            <div className="horizontal">
              {view === "contributions" && (
                <Button
                  type="primary"
                  icon={<Plus size={16} />}
                  onClick={() => setOfficialOpen(true)}
                >
                  录入官方资料
                </Button>
              )}
              {view === "layouts" && (
                <Button
                  type="primary"
                  icon={<Plus size={16} />}
                  onClick={() => {
                    setLayoutJson("");
                    open("layout");
                  }}
                >
                  导入布局
                </Button>
              )}
              <Button
                aria-label="刷新"
                title="刷新"
                icon={<RefreshCw size={16} />}
                onClick={load}
                loading={busy}
              />
            </div>
          </div>
          {error && (
            <Alert
              type="error"
              message={error}
              action={<Button onClick={load}>重试</Button>}
            />
          )}
          <Spin spinning={busy}>
            {view === "overview" && (
              <>
                <div className="stats">
                  {[
                    ["pending", "待审核内容"],
                    ["published", "公开内容"],
                    ["tickets", "待处理反馈"],
                    ["failedJobs", "失败任务"],
                  ].map(([key, label]) => (
                    <div className="stat" key={key}>
                      <Statistic title={label} value={overview[key] ?? 0} />
                      <span className="muted">
                        {key === "pending"
                          ? "审核后才会公开展示"
                          : key === "published"
                            ? "含官方与观众内容"
                            : key === "tickets"
                              ? "已收到与处理中"
                              : "需要检查并重新处理"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="overview-venue">
                  <img
                    src="/assets/beijing-stage.jpg"
                    alt="北京 LIVERSE 宣传资料场馆画面"
                  />
                  <div>
                    <div className="eyebrow">VENUE REFERENCE</div>
                    <h2>北京 LIVERSE</h2>
                    <p className="muted">台湖演艺小镇 · 音宇宙</p>
                    <p>场馆宣传资料，未作逐座视角校准。</p>
                    {canLayout && (
                      <Button onClick={() => setView("layouts")}>
                        管理布局 <ArrowUpRight size={16} />
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}
            {view === "contributions" && (
              <Table
                rowKey="id"
                dataSource={rows as ContentRow[]}
                pagination={{ pageSize: 10 }}
                scroll={{ x: 750 }}
                columns={[
                  {
                    title: "现场内容",
                    key: "content",
                    render: (_, c: ContentRow) => (
                      <div>
                        <strong>{c.displayName}</strong>
                        <p className="table-text">{c.text || "图片投稿"}</p>
                        <div className="horizontal">
                          {c.media.map((m) => (
                            <Image
                              key={m.id}
                              width={64}
                              height={48}
                              style={{ objectFit: "cover" }}
                              src={`/api/v1/admin/media/${m.id}`}
                              alt="待审核图片"
                            />
                          ))}
                        </div>
                      </div>
                    ),
                  },
                  {
                    title: "来源",
                    dataIndex: "source",
                    render: (s: string) => (s === "official" ? "官方" : "观众"),
                  },
                  { title: "状态", dataIndex: "state", render: status },
                  {
                    title: "操作",
                    key: "action",
                    render: (_, c: ContentRow) => (
                      <div className="horizontal">
                        {c.state === "pending" && (
                          <>
                            <Button
                              size="small"
                              type="primary"
                              onClick={() => open("review", c, "published")}
                            >
                              通过
                            </Button>
                            <Button
                              size="small"
                              onClick={() => open("review", c, "rejected")}
                            >
                              不通过
                            </Button>
                          </>
                        )}
                        {c.state === "published" && (
                          <Button
                            size="small"
                            danger
                            onClick={() => open("review", c, "withdrawn")}
                          >
                            下架
                          </Button>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            )}
            {view === "layouts" && (
              <Table
                rowKey="id"
                dataSource={rows as LayoutRow[]}
                pagination={{ pageSize: 10 }}
                scroll={{ x: 720 }}
                columns={[
                  {
                    title: "标准布局版本",
                    key: "name",
                    render: (_, l: LayoutRow) => (
                      <div>
                        <strong>{l.data.name}</strong>
                        <div className="muted">{l.id}</div>
                        {l.data.demo && <Tag color="orange">开发示例</Tag>}
                      </div>
                    ),
                  },
                  {
                    title: "核验",
                    key: "verified",
                    render: (_, l: LayoutRow) =>
                      l.data.verified ? "已核验" : "待核验",
                  },
                  {
                    title: "位置",
                    key: "seats",
                    render: (_, l: LayoutRow) =>
                      `${l.data.sections.length} 区域 / ${l.data.seats.length} 示例位置`,
                  },
                  { title: "状态", dataIndex: "status", render: status },
                  {
                    title: "操作",
                    key: "actions",
                    render: (_, l: LayoutRow) => (
                      <div className="horizontal">
                        <Button
                          size="small"
                          onClick={() => {
                            setLayoutJson(JSON.stringify(l.data, null, 2));
                            open("inspect", l);
                          }}
                        >
                          查看
                        </Button>
                        {l.status === "draft" ? (
                          <Button
                            size="small"
                            type="primary"
                            onClick={() => open("publish", l, "publish")}
                          >
                            发布
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            onClick={() => open("publish", l, "rollback")}
                          >
                            设为当前
                          </Button>
                        )}
                        {l.status === "published" && (
                          <Button
                            size="small"
                            danger
                            onClick={() => open("publish", l, "withdraw")}
                          >
                            下架
                          </Button>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            )}
            {view === "tickets" && (
              <Table
                rowKey="id"
                dataSource={rows as Ticket[]}
                pagination={{ pageSize: 10 }}
                scroll={{ x: 650 }}
                columns={[
                  {
                    title: "问题",
                    dataIndex: "text",
                    render: (t: string) => <p className="table-text">{t}</p>,
                  },
                  { title: "类型", dataIndex: "category" },
                  { title: "状态", dataIndex: "status", render: status },
                  { title: "运营回复", dataIndex: "reply" },
                  {
                    title: "操作",
                    key: "action",
                    render: (_, t: Ticket) => (
                      <Button
                        size="small"
                        onClick={() => open("reply", t, "resolved")}
                      >
                        处理 / 回复
                      </Button>
                    ),
                  },
                ]}
              />
            )}
            {view === "audit" && (
              <Table
                rowKey="id"
                dataSource={rows as Record<string, unknown>[]}
                pagination={{ pageSize: 15 }}
                scroll={{ x: 700 }}
                columns={[
                  { title: "操作", dataIndex: "action" },
                  { title: "对象", dataIndex: "targetId" },
                  { title: "操作人", dataIndex: "actorId" },
                  {
                    title: "时间",
                    dataIndex: "createdAt",
                    render: (s: string) =>
                      new Date(s).toLocaleString("zh-CN", {
                        timeZone: "Asia/Shanghai",
                      }),
                  },
                ]}
              />
            )}
            {view === "jobs" && (
              <Table
                rowKey="id"
                dataSource={rows as Record<string, unknown>[]}
                pagination={{ pageSize: 15 }}
                columns={[
                  { title: "任务", dataIndex: "kind" },
                  { title: "状态", dataIndex: "state" },
                  { title: "尝试次数", dataIndex: "attempts" },
                  { title: "结果", dataIndex: "error" },
                ]}
              />
            )}
          </Spin>
        </main>
      </div>
      <OfficialEditor
        open={officialOpen}
        onClose={() => setOfficialOpen(false)}
        onCreated={() => {
          message.success("官方资料已送审");
          void load();
        }}
      />
      <Modal
        open={!!modal}
        title={
          modal?.kind === "review"
            ? "确认审核处理"
            : modal?.kind === "publish"
              ? "确认布局发布操作"
              : modal?.kind === "reply"
                ? "处理反馈"
                : modal?.kind === "inspect"
                  ? "布局资料"
                  : "导入布局草稿"
        }
        onCancel={() => setModal(null)}
        onOk={modal?.kind === "inspect" ? () => setModal(null) : action}
        okText={modal?.kind === "inspect" ? "关闭" : "确认"}
        cancelText="取消"
        width={640}
      >
        {(modal?.kind === "layout" || modal?.kind === "inspect") && (
          <>
            <p className="muted">
              唯一版本 ID、资料来源与核验状态将随布局保存。
            </p>
            <Input.TextArea
              value={layoutJson}
              onChange={(e) => setLayoutJson(e.target.value)}
              rows={16}
              readOnly={modal.kind === "inspect"}
            />
          </>
        )}
        {modal?.kind === "review" && (
          <>
            <p>
              {modal.state === "published"
                ? "确认文字、图片、署名、位置及权利授权均符合公开条件。"
                : "处理结果和原因将对投稿者可见。"}
            </p>
            <Input.TextArea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="审核说明（拒绝或下架必填）"
              rows={4}
            />
          </>
        )}
        {modal?.kind === "publish" && (
          <Alert
            type="warning"
            message={
              modal.state === "withdraw"
                ? "下架后公开位置与相关媒体将停止访问。"
                : "确认此版本资料适用；操作将变更场馆当前布局指针并记录审计。"
            }
          />
        )}
        {modal?.kind === "reply" && (
          <>
            <Select
              style={{ width: "100%", marginBottom: 16 }}
              value={modal.state}
              onChange={(state) => setModal({ ...modal, state })}
              options={[
                { value: "processing", label: "处理中" },
                { value: "resolved", label: "已解决" },
                { value: "declined", label: "不予处理" },
              ]}
            />
            <Input.TextArea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="向提交者说明处理结果"
            />
          </>
        )}
      </Modal>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      button={{ autoInsertSpace: false }}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#ff5018",
          borderRadius: 6,
          colorBgBase: "#101317",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
          fontSize: 14,
        },
      }}
    >
      <AntApp>
        {new URLSearchParams(location.search).has("preview") ? (
          <PreviewApp />
        ) : (
          <Workspace />
        )}
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
