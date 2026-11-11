/** Owner access always verifies on the server; passphrases never enter storage. */
export interface OwnerStatus {
  configured: boolean;
  unlocked: boolean;
  expiresAt: number | null;
}
export class OwnerAccessError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'OwnerAccessError'; }
}
async function responseJSON(response: Response): Promise<Record<string, unknown>> {
  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new OwnerAccessError(
    typeof result.error === 'string' ? result.error : 'Owner authorisation failed', response.status,
  );
  return result;
}
export async function getOwnerStatus(): Promise<OwnerStatus> {
  const result = await responseJSON(await fetch('/api/owner?action=status', {
    credentials: 'same-origin', cache: 'no-store',
  }));
  return {
    configured: result.configured === true, unlocked: result.unlocked === true,
    expiresAt: typeof result.expiresAt === 'number' ? result.expiresAt : null,
  };
}
export async function ownerPost(action: 'unlock' | 'verify' | 'lock', passphrase?: string): Promise<OwnerStatus> {
  const response = await fetch('/api/owner?action=' + action, {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: {
      'X-Taiyou-Request': 'owner-mode',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(action === 'unlock' ? { passphrase } : {}),
  });
  const result = await responseJSON(response);
  return {
    configured: true, unlocked: result.unlocked === true,
    expiresAt: typeof result.expiresAt === 'number' ? result.expiresAt : null,
  };
}
