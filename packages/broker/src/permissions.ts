import type { AgentMessage } from "@agentlink/core";

/**
 * Permission row returned by the registry's GET /permissions/:agentId endpoint.
 */
interface PermissionRow {
  id: string;
  granterAgentId: string;
  granteeAgentId: string;
  allowedIntents: string[];
  grantedByHuman: boolean;
  createdAt: string;
}

/** Intents that are always allowed and skip the permission check. */
const EXEMPT_INTENTS = new Set(["HEARTBEAT", "BROADCAST"]);

/**
 * Checks whether `sender` is permitted to send `intent` to `recipient`
 * by querying the registry service.
 *
 * Returns `{ allowed: true }` when the message may proceed, or
 * `{ allowed: false, reason: string }` when it must be rejected.
 */
export async function checkPermission(
  registryUrl: string,
  msg: AgentMessage,
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  // 1. Skip check for exempt intents
  if (EXEMPT_INTENTS.has(msg.intent)) {
    return { allowed: true };
  }

  // 2. Skip check for channel-targeted messages (no direct recipient)
  if (msg.recipient.startsWith("channel://")) {
    return { allowed: true };
  }

  // 3. Query registry for permissions granted TO the sender
  const url = `${registryUrl}/permissions/${encodeURIComponent(msg.sender)}`;

  let rows: PermissionRow[];
  try {
    const res = await fetch(url);
    if (!res.ok) {
      // If registry is unreachable / errors, fail-open with a warning log.
      // In production you'd likely want fail-closed; for dev we stay lenient.
      console.warn(
        `[permissions] Registry returned ${res.status} for ${url} — failing open`,
      );
      return { allowed: true };
    }
    rows = (await res.json()) as PermissionRow[];
  } catch (err) {
    console.warn(
      `[permissions] Could not reach registry at ${url} — failing open`,
      err,
    );
    return { allowed: true };
  }

  // 4. Look for a row where the *granter* is the recipient (the agent being
  //    messaged) and the allowed intents include the message's intent.
  const match = rows.find(
    (r) =>
      r.granterAgentId === msg.recipient &&
      r.allowedIntents.includes(msg.intent),
  );

  if (match) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason:
      `Agent "${msg.sender}" does not have permission to send ` +
      `intent "${msg.intent}" to "${msg.recipient}". ` +
      `Grant permission via the registry first (POST /permissions/grant).`,
  };
}
