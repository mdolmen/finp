import { rpc } from "./client";

export type TinkEnvironment = "sandbox" | "production";

export interface TinkCredentials {
  client_id: string;
  client_secret: string;
  environment: TinkEnvironment;
}

export const tinkApi = {
  getCredentials(): Promise<TinkCredentials | null> {
    return rpc("tink.get_credentials");
  },

  saveCredentials(params: TinkCredentials): Promise<TinkCredentials> {
    return rpc("tink.save_credentials", params);
  },
};
