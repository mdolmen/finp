import { rpc } from "./client";
import type { Operation } from "./types";

export type IngestRow = {
  date: string;
  montant_cents: number;
  libelle: string;
};

export type IngestResult = {
  imported: number;
  skipped: number;
  rule_assigned: number;
  skipped_existing: Operation[];
};

export const importsApi = {
  ingest: (input: { account_id: number; rows: IngestRow[]; apply_rules?: boolean }) =>
    rpc<IngestResult>("import.ingest", input),
};
