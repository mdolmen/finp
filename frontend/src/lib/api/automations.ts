import { rpc } from "./client";
import type { Predicate } from "./types";

export type AutomationEventType =
  | "operation.created"
  | "operation.updated"
  | "operation.category_assigned"
  | "rule.matched";

export type Automation = {
  id: number;
  name: string;
  event_type: AutomationEventType;
  predicate: Predicate;
  callback_url: string;
  enabled: boolean;
  created_at: string;
};

export type PendingStatus = "pending" | "sent" | "failed" | "refused";

export type AutomationPending = {
  id: number;
  automation_id: number;
  automation_name: string;
  callback_url: string;
  event_type: AutomationEventType;
  operation_id: number | null;
  payload: Record<string, unknown>;
  status: PendingStatus;
  error: string | null;
  response_status_code: number | null;
  response_body_excerpt: string | null;
  created_at: string;
  resolved_at: string | null;
};

type CreateInput = {
  name: string;
  event_type: AutomationEventType;
  predicate: Predicate;
  callback_url: string;
  enabled?: boolean;
};

type UpdateInput = {
  id: number;
  name?: string;
  event_type?: AutomationEventType;
  predicate?: Predicate;
  callback_url?: string;
  enabled?: boolean;
};

export type HistoryStatusFilter = "sent" | "failed" | "refused" | "all";

export const automationsApi = {
  list: () => rpc<Automation[]>("automations.list"),
  create: (input: CreateInput) => rpc<Automation>("automations.create", input),
  update: (input: UpdateInput) => rpc<Automation>("automations.update", input),
  toggle: (id: number, enabled: boolean) =>
    rpc<Automation>("automations.toggle", { id, enabled }),
  delete: (id: number) => rpc<null>("automations.delete", { id }),
  pending: {
    list: () => rpc<AutomationPending[]>("automations.pending.list"),
    confirm: (id: number) =>
      rpc<AutomationPending>("automations.pending.confirm", { id }),
    refuse: (id: number) =>
      rpc<AutomationPending>("automations.pending.refuse", { id }),
  },
  history: {
    list: (status: HistoryStatusFilter = "all", limit = 20) =>
      rpc<AutomationPending[]>("automations.history.list", { status, limit }),
  },
};
