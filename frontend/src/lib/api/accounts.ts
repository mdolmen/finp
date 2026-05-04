import { rpc } from "./client";
import type { Account } from "./types";

export const accountsApi = {
  list: () => rpc<Account[]>("accounts.list"),
  get: (id: number) => rpc<Account>("accounts.get", { id }),
  create: (name: string) => rpc<Account>("accounts.create", { name }),
  rename: (id: number, name: string) =>
    rpc<Account>("accounts.rename", { id, name }),
  setCsvMapping: (id: number, mapping: Record<string, unknown> | null) =>
    rpc<Account>("accounts.set_csv_mapping", { id, mapping }),
  delete: (id: number) => rpc<null>("accounts.delete", { id }),
};
