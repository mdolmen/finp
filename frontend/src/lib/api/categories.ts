import { rpc } from "./client";
import type { Category } from "./types";

export const categoriesApi = {
  list: () => rpc<Category[]>("categories.list"),
  create: (name: string) => rpc<Category>("categories.create", { name }),
  rename: (id: number, name: string) =>
    rpc<Category>("categories.rename", { id, name }),
  delete: (id: number) => rpc<null>("categories.delete", { id }),
  reassignOperations: (fromId: number, toId: number | null) =>
    rpc<{ moved: number }>("categories.reassign_operations", {
      from_id: fromId,
      to_id: toId,
    }),
  setRecurring: (id: number, isRecurring: boolean) =>
    rpc<Category>("categories.set_recurring", { id, is_recurring: isRecurring }),
};
