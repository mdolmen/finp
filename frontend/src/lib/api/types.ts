// Wire shapes mirroring the pydantic output models in backend/src/finp/commands/.
// Keep this file in lockstep with the Python side.

export type OperationType = "debit" | "credit" | "internal";

export type Account = {
  id: number;
  name: string;
  csv_mapping: Record<string, unknown> | null;
  created_at: string;
  last_import_at: string | null;
  initial_balance_cents: number;
  initial_balance_date: string | null;
  current_balance_cents: number;
  tink_account_id: string | null;
  tink_last_sync_at: string | null;
};

export type Category = {
  id: number;
  name: string;
  is_builtin: boolean;
  display_order: number;
};

export type Operation = {
  id: number;
  account_id: number;
  date: string;
  montant_cents: number;
  libelle: string;
  type: OperationType;
  category_id: number | null;
  dedup_hash: string;
  created_at: string;
  recurring: "none" | "monthly" | "yearly";
};

export type Predicate =
  | { kind: "libelle_contains"; text: string; case_sensitive: boolean }
  | { kind: "montant_compare"; operator: ">" | "<" | "=="; value_cents: number };

export type Rule = {
  id: number;
  name: string;
  category_id: number;
  priority: number;
  predicate: Predicate;
  enabled: boolean;
  created_at: string;
};

export type OperationListResult = {
  items: Operation[];
  has_more: boolean;
};

export type OperationFilters = {
  account_ids?: number[] | null;
  category_ids?: number[] | null;
  include_no_category?: boolean;
  types?: OperationType[] | null;
  date_from?: string | null;
  date_to?: string | null;
  search_terms?: string[] | null;
  search_combinator?: "AND" | "OR" | "XOR";
  montant_op?: ">" | "<" | "==" | null;
  montant_value_cents?: number | null;
  recurring_only?: boolean;
  limit?: number;
  offset?: number;
};
