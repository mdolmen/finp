import { rpc } from "./client";

export type IngestRow = {
  date: string;
  montant_cents: number;
  libelle: string;
};

export type IngestResult = {
  imported: number;
  skipped: number;
  rule_assigned: number;
};

export const importsApi = {
  ingest: (input: { account_id: number; rows: IngestRow[]; apply_rules?: boolean }) =>
    rpc<IngestResult>("import.ingest", input),
};
