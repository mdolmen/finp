import { rpc } from "./client";
import type { Account, Category, OperationType } from "./types";

export type MonthSlice = {
  month: string; // YYYY-MM
  type: Exclude<OperationType, "internal">;
  category_id: number | null;
  category_name: string | null;
  total_cents: number;
  is_planned: boolean;
};

export type BilanSummary = {
  months: string[];
  rows: MonthSlice[];
};

export type BilanFilterOptions = {
  accounts: Account[];
  debit_categories: Category[];
  credit_categories: Category[];
  debit_has_uncategorized: boolean;
  credit_has_uncategorized: boolean;
};

export type BilanSummaryInput = {
  today?: string | null;
  account_ids?: number[] | null;
  debit_category_ids?: number[] | null;
  credit_category_ids?: number[] | null;
  include_no_category_debit?: boolean;
  include_no_category_credit?: boolean;
};

export const bilanApi = {
  summary: (input: BilanSummaryInput = {}) =>
    rpc<BilanSummary>("bilan.summary", input),
  filterOptions: () => rpc<BilanFilterOptions>("bilan.filter_options"),
};
