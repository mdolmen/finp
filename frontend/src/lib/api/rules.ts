import { rpc } from "./client";
import type { Predicate, Rule } from "./types";

type CreateInput = {
  name: string;
  category_id: number;
  predicate: Predicate;
  enabled?: boolean;
  priority?: number | null;
};

type UpdateInput = {
  id: number;
  name?: string;
  category_id?: number;
  predicate?: Predicate;
  enabled?: boolean;
};

export const rulesApi = {
  list: (categoryId?: number) =>
    rpc<Rule[]>("rules.list", { category_id: categoryId ?? null }),
  get: (id: number) => rpc<Rule>("rules.get", { id }),
  create: (input: CreateInput) => rpc<Rule>("rules.create", input),
  update: (input: UpdateInput) => rpc<Rule>("rules.update", input),
  delete: (id: number) => rpc<null>("rules.delete", { id }),
  reorderInCategory: (categoryId: number, ruleIds: number[]) =>
    rpc<null>("rules.reorder_in_category", {
      category_id: categoryId,
      rule_ids: ruleIds,
    }),
  applyNow: () => rpc<{ assigned: number }>("rules.apply_now"),
};
