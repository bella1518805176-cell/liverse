import { useEffect, useRef, useState } from "react";
import { Modal, Form, Input, Select, Checkbox, Alert } from "antd";
import type { Layout, PositionRef } from "../../../packages/contracts";
import { api, uploadOfficial } from "./api";
export function OfficialEditor({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose(): void;
  onCreated(): void;
}) {
  const [layouts, setLayouts] = useState<Layout[]>([]),
    [layoutId, setLayoutId] = useState(""),
    [kind, setKind] = useState("venue"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [files, setFiles] = useState<File[]>([]);
  const [form] = Form.useForm();
  const uploads = useRef(new Map<File, string>()),
    requestId = useRef(crypto.randomUUID());
  useEffect(() => {
    if (open) {
      void api<Array<{ status: string; data: Layout }>>(
        "/admin/published-layouts",
      )
        .then((rows) => {
          const available = rows
            .filter((r) => r.status === "published")
            .map((r) => r.data);
          setLayouts(available);
          setLayoutId((current) =>
            available.some((l) => l.id === current)
              ? current
              : (available[0]?.id ?? ""),
          );
        })
        .catch((e) => setError(e.message));
    }
  }, [open]);
  const layout = layouts.find((l) => l.id === layoutId);
  async function submit() {
    try {
      const values = await form.validateFields();
      if (!layout || !values.consent)
        throw new Error("请选择已发布布局并确认授权");
      if (!values.text?.trim() && !files.length)
        throw new Error("请提供文字或图片");
      setBusy(true);
      setError("");
      const mediaIds: string[] = [];
      for (const file of files) {
        let id = uploads.current.get(file);
        if (!id) {
          id = await uploadOfficial(file);
          uploads.current.set(file, id);
        }
        mediaIds.push(id);
      }
      const position: PositionRef =
        kind === "section"
          ? {
              venueId: layout.venueId,
              layoutVersionId: layout.id,
              kind: "section",
              sectionId: values.positionId,
            }
          : kind === "seat"
            ? {
                venueId: layout.venueId,
                layoutVersionId: layout.id,
                kind: "seat",
                seatId: values.positionId,
              }
            : {
                venueId: layout.venueId,
                layoutVersionId: layout.id,
                kind: "venue",
              };
      const response = await fetch("/api/v1/admin/official-content", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": (await api<{ csrf: string }>("/admin/me")).csrf,
          "Idempotency-Key": requestId.current,
        },
        body: JSON.stringify({
          position,
          text: values.text ?? "",
          tags: [],
          mediaIds,
          consent: true,
          displayName: "LIVERSE 官方",
          ...(values.shotDate ? { shotDate: values.shotDate } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      onCreated();
      onClose();
      form.resetFields();
      setFiles([]);
      uploads.current.clear();
      requestId.current = crypto.randomUUID();
    } catch (e) {
      if (e instanceof Error) setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="录入官方参考资料"
      open={open}
      onCancel={() => {
        if (!busy) onClose();
      }}
      closable={!busy}
      keyboard={!busy}
      cancelButtonProps={{ disabled: busy }}
      onOk={submit}
      confirmLoading={busy}
      maskClosable={!busy}
      okText="保存并送审"
      cancelText="取消"
    >
      <Form
        form={form}
        layout="vertical"
        disabled={busy}
        onValuesChange={() => (requestId.current = crypto.randomUUID())}
      >
        <Form.Item label="适用布局">
          <Select
            value={layoutId}
            onChange={(v) => {
              setLayoutId(v);
              setKind("venue");
              form.resetFields(["positionId"]);
              requestId.current = crypto.randomUUID();
            }}
            options={layouts.map((l) => ({ value: l.id, label: l.name }))}
          />
        </Form.Item>
        <Form.Item label="位置精度">
          <Select
            value={kind}
            onChange={(value) => {
              setKind(value);
              form.resetFields(["positionId"]);
              requestId.current = crypto.randomUUID();
            }}
            options={[
              { value: "venue", label: "整个场馆" },
              { value: "section", label: "区域参考" },
              ...(layout?.capabilities.seats
                ? [{ value: "seat", label: "明确座位" }]
                : []),
            ]}
          />
        </Form.Item>
        {kind !== "venue" && (
          <Form.Item
            label="关联位置"
            name="positionId"
            rules={[{ required: true }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={
                kind === "section"
                  ? layout?.sections.map((s) => ({
                      value: s.id,
                      label: s.name,
                    }))
                  : layout?.seats.map((s) => ({
                      value: s.id,
                      label: `${s.floor} / ${s.rowLabel} 排 ${s.seatLabel} 号`,
                    }))
              }
            />
          </Form.Item>
        )}
        <Form.Item label="素材说明与来源" name="text">
          <Input.TextArea maxLength={300} rows={4} />
        </Form.Item>
        <Form.Item label="拍摄日期（选填）" name="shotDate">
          <Input placeholder="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item label="参考图片（最多 4 张）">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={busy}
            onChange={(e) => {
              const next = [...(e.target.files ?? [])];
              if (
                next.length > 4 ||
                next.some((f) => f.size > 20 * 1024 * 1024)
              ) {
                setError("最多 4 张，每张最多 20 MB");
                return;
              }
              setFiles(next);
              requestId.current = crypto.randomUUID();
            }}
          />
        </Form.Item>
        <Form.Item name="consent" valuePropName="checked">
          <Checkbox>确认素材权利、来源及位置精度，授权公开展示</Checkbox>
        </Form.Item>
        <Alert
          type="info"
          message="官方资料仍需审核通过后才会公开。宣传效果图不得标为座位实拍。"
        />
        {error && <Alert type="error" message={error} />}
      </Form>
    </Modal>
  );
}
