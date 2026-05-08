import { rpc } from "./client";

export type PlannedOperation = {
  id: number;
  date: string;
  montant_cents: number;
  libelle: string;
  created_at: string;
};

export const plannedApi = {
  list: () => rpc<PlannedOperation[]>("planned.list"),
  create: (input: { date: string; montant_cents: number; libelle: string }) =>
    rpc<PlannedOperation>("planned.create", input),
  delete: (id: number) => rpc<null>("planned.delete", { id }),
};
