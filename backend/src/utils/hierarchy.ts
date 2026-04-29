import { HttpError } from "../middleware/error";

export async function ensureNoCycle(
  selfId: string,
  proposedParentId: string | null,
  getParentId: (id: string) => Promise<string | null>,
  maxDepth = 50
): Promise<void> {
  if (!proposedParentId) return;
  if (proposedParentId === selfId) {
    throw new HttpError(400, "Cannot reference self in hierarchy");
  }
  let current: string | null = proposedParentId;
  for (let depth = 0; depth < maxDepth; depth++) {
    if (current === selfId) {
      throw new HttpError(400, "Cycle detected in hierarchy");
    }
    const next = await getParentId(current);
    if (!next) return;
    current = next;
  }
  throw new HttpError(400, "Hierarchy depth exceeds limit");
}
