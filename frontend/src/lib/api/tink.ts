import { rpc } from "./client";

export type TinkEnvironment = "sandbox" | "production";

export interface TinkCredentials {
  client_id: string;
  client_secret: string;
  environment: TinkEnvironment;
}

export interface StartOAuthResult {
  auth_url: string;
  state: string;
}

export type OAuthStatus = "pending" | "complete" | "error" | "not_found";

export interface OAuthStatusResult {
  status: OAuthStatus;
  tink_user_id?: string;
  error?: string;
}

export interface TinkAccount {
  id: string;
  name: string;
  type: string;
  iban: string | null;
}

export const tinkApi = {
  getCredentials(): Promise<TinkCredentials | null> {
    return rpc("tink.get_credentials");
  },

  saveCredentials(params: TinkCredentials): Promise<TinkCredentials> {
    return rpc("tink.save_credentials", params);
  },

  startOAuth(): Promise<StartOAuthResult> {
    return rpc("tink.start_oauth");
  },

  getOAuthStatus(state: string): Promise<OAuthStatusResult> {
    return rpc("tink.get_oauth_status", { state });
  },

  hasConnection(): Promise<{ connected: boolean }> {
    return rpc("tink.has_connection");
  },

  listTinkAccounts(): Promise<TinkAccount[]> {
    return rpc("tink.list_tink_accounts");
  },

  linkAccount(finp_account_id: number, tink_account_id: string): Promise<import("./types").Account> {
    return rpc("tink.link_account", { finp_account_id, tink_account_id });
  },

  syncAccount(account_id: number): Promise<{ imported: number; skipped: number }> {
    return rpc("tink.sync_account", { account_id });
  },
};
