export let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export async function uploadOfficial(file: File) {
  const media = await api<{ id: string }>("/admin/uploads", "POST");
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`/api/v1/admin/uploads/${media.id}/file`, {
    method: "POST",
    headers: { "X-CSRF-Token": csrf },
    body: form,
  });
  if (!response.ok) throw new Error("图片上传失败");
  for (let i = 0; i < 40; i++) {
    const state = await api<{ state: string }>(`/admin/uploads/${media.id}`);
    if (state.state === "ready") return media.id;
    if (state.state === "failed") throw new Error("图片处理失败");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("图片处理尚未完成，请稍后重试");
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "请求失败");
  return data as T;
}
