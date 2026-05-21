import { rpc } from "./client";
import type { Account } from "./types";

export interface GoCardlessCredentials {
  secret_id: string;
  secret_key: string;
}

export interface Institution {
  id: string;
  name: string;
  bic: string | null;
  logo: string | null;
}

export interface CreateRequisitionResult {
  link: string;
  requisition_id: string;
  state: string;
  redirect_uri: string;
}

export type RequisitionStatus = "pending" | "complete" | "error" | "not_found";

export interface RequisitionStatusResult {
  status: RequisitionStatus;
  requisition_id?: string;
  error?: string;
}

export interface GcAccount {
  id: string;
  iban: string | null;
  owner_name: string | null;
  institution_name: string | null;
}

export const gocardlessApi = {
  getCredentials(): Promise<GoCardlessCredentials | null> {
    return rpc("gocardless.get_credentials");
  },

  saveCredentials(params: GoCardlessCredentials): Promise<GoCardlessCredentials> {
    return rpc("gocardless.save_credentials", params);
  },

  hasConnection(): Promise<{ connected: boolean }> {
    return rpc("gocardless.has_connection");
  },

  listInstitutions(): Promise<Institution[]> {
    return rpc("gocardless.list_institutions");
  },

  createRequisition(institution_id: string): Promise<CreateRequisitionResult> {
    return rpc("gocardless.create_requisition", { institution_id });
  },

  getRequisitionStatus(state: string): Promise<RequisitionStatusResult> {
    return rpc("gocardless.get_requisition_status", { state });
  },

  listRequisitionAccounts(requisition_id: string): Promise<GcAccount[]> {
    return rpc("gocardless.list_requisition_accounts", { requisition_id });
  },

  linkAccount(
    finp_account_id: number,
    gocardless_account_id: string,
    requisition_id: string,
  ): Promise<Account> {
    return rpc("gocardless.link_account", {
      finp_account_id,
      gocardless_account_id,
      requisition_id,
    });
  },

  syncAccount(account_id: number): Promise<{ imported: number; skipped: number }> {
    return rpc("gocardless.sync_account", { account_id });
  },
};
