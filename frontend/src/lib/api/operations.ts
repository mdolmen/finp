import { rpc } from "./client";
import type { Operation, OperationFilters } from "./types";

export const operationsApi = {
  list: (filters: OperationFilters = {}) =>
    rpc<Operation[]>("operations.list", filters),
  get: (id: number) => rpc<Operation>("operations.get", { id }),
  insert: (input: {
    account_id: number;
    date: string;
    montant_cents: number;
    libelle: string;
  }) => rpc<Operation | null>("operations.insert", input),
  assignCategory: (id: number, categoryId: number | null) =>
    rpc<Operation>("operations.assign_category", { id, category_id: categoryId }),
  bulkAssignCategory: (ids: number[], categoryId: number | null) =>
    rpc<{ updated: number }>("operations.bulk_assign_category", {
      ids,
      category_id: categoryId,
    }),
  setRecurring: (id: number, recurring: "none" | "monthly" | "yearly") =>
    rpc<Operation>("operations.set_recurring", { id, recurring }),
};
