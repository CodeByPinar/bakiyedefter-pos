import { initialSchema } from "./001_initial_schema";
import { customerFinanceProfile } from "./002_customer_finance_profile";
import { customerCodeAndPosIntegration } from "./003_customer_code_and_pos_integration";

export type Migration = { version: number; name: string; sql: string };
export const migrations: Migration[] = [initialSchema, customerFinanceProfile, customerCodeAndPosIntegration];
