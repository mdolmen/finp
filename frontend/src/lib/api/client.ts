import { invoke } from "@tauri-apps/api/core";

// Mirrors the structured error returned by Rust's `rpc` Tauri command.
// `data.code` is the stable string identifier the UI keys off (e.g. "category.in_use").
export type RpcErrorPayload = {
  code: number;
  message: string;
  data?: { code?: string; [key: string]: unknown };
};

export class RpcError extends Error {
  readonly code: number;
  readonly appCode: string | null;
  readonly data: Record<string, unknown> | null;

  constructor(payload: RpcErrorPayload) {
    super(payload.message);
    this.name = "RpcError";
    this.code = payload.code;
    this.appCode = (payload.data?.code as string | undefined) ?? null;
    this.data = payload.data ?? null;
  }
}

function isRpcErrorPayload(value: unknown): value is RpcErrorPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value &&
    typeof (value as { code: unknown }).code === "number"
  );
}

export async function rpc<T>(method: string, params?: unknown): Promise<T> {
  try {
    return (await invoke("rpc", { method, params })) as T;
  } catch (raw) {
    if (isRpcErrorPayload(raw)) throw new RpcError(raw);
    throw raw;
  }
}
