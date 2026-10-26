import type { ApiError, Layout } from "../../../../packages/contracts";
export class RequestError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
type Session = {
  accessToken: string;
  refreshToken: string;
  user: { id: string };
};
let session: Session | null = wx.getStorageSync("lv:session") || null;
export const apiBase = __API_BASE__;
export const loggedIn = () => !!session;
export const currentUserId = () => session?.user.id;
export function clearSession() {
  if (session) wx.removeStorageSync(`lv:account:${session.user.id}`);
  session = null;
  wx.removeStorageSync("lv:session");
}
export function request<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: unknown,
  key?: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${apiBase}${path}`,
      method,
      data: body as WechatMiniprogram.IAnyObject,
      timeout: 12000,
      header: {
        "Content-Type": "application/json",
        ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300)
          resolve(res.data as T);
        else {
          const error = res.data as ApiError;
          if (res.statusCode === 401) clearSession();
          reject(new RequestError(error.code, error.message || "请求失败"));
        }
      },
      fail() {
        reject(new RequestError("NETWORK_ERROR", "网络连接失败，请重试"));
      },
    });
  });
}
export async function login(): Promise<boolean> {
  if (session) return true;
  const confirm = await wx.showModal({
    title: "微信登录",
    content: "登录用于投稿、同步收藏和查询个人处理进度。",
    confirmText: "继续登录",
  });
  if (!confirm.confirm) return false;
  try {
    const { code } = await wx.login();
    session = await request<Session>("/auth/wechat", "POST", { code });
    wx.setStorageSync("lv:session", session);
    return true;
  } catch (e) {
    wx.showToast({ title: (e as Error).message, icon: "none" });
    return false;
  }
}
export async function logout() {
  try {
    await request("/auth/logout", "POST");
  } finally {
    clearSession();
  }
}
export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "服务暂不可用";
export const newKey = () =>
  `mini_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
export function upload(id: string, filePath: string): Promise<void> {
  return new Promise((resolve, reject) =>
    wx.uploadFile({
      url: `${apiBase}/uploads/${id}/file`,
      filePath,
      name: "file",
      header: session ? { Authorization: `Bearer ${session.accessToken}` } : {},
      timeout: 30000,
      success(r) {
        if (r.statusCode < 300) resolve();
        else reject(new Error("图片上传失败，请重试"));
      },
      fail: () => reject(new Error("图片上传失败，请重试")),
    }),
  );
}
export async function loadLayout(id?: string): Promise<Layout | null> {
  if (id) return request<Layout>(`/layouts/${encodeURIComponent(id)}`);
  const venues =
    await request<Array<{ id: string; layout: Layout | null }>>("/venues");
  return venues.find((v) => v.id === "beijing")?.layout ?? null;
}
