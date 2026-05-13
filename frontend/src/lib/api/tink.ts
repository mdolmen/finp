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
};
