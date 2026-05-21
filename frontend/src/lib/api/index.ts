export { rpc, RpcError } from "./client";
export { accountsApi } from "./accounts";
export { categoriesApi } from "./categories";
export { operationsApi } from "./operations";
export { rulesApi } from "./rules";
export { importsApi } from "./imports";
export type { IngestRow, IngestResult } from "./imports";
export { bilanApi } from "./bilan";
export type {
  BilanFilterOptions,
  BilanSummary,
  BilanSummaryInput,
  MonthSlice,
} from "./bilan";
export { plannedApi } from "./planned";
export type { PlannedOperation } from "./planned";
export { automationsApi } from "./automations";
export type {
  Automation,
  AutomationEventType,
  AutomationPending,
  HistoryStatusFilter,
  PendingStatus,
} from "./automations";
export { gocardlessApi } from "./gocardless";
export type {
  GoCardlessCredentials,
  Institution,
  CreateRequisitionResult,
  RequisitionStatus,
  RequisitionStatusResult,
  GcAccount,
} from "./gocardless";
export type * from "./types";
