import { AgentMessageSchema, type AgentMessage } from "./schema.js";

export type ValidationResult =
  | { success: true; data: AgentMessage }
  | { success: false; errors: string[] };

/**
 * Validate an unknown value against the AgentMessage schema.
 * Returns a discriminated union so callers can handle errors without try/catch.
 */
export function validate(input: unknown): ValidationResult {
  const result = AgentMessageSchema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    ),
  };
}
