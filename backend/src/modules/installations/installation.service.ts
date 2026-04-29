import {
  Installation,
  INSTALLATION_STATUSES,
  type InstallationStatus,
} from "./installation.model";
import { HttpError } from "../../middleware/error";
import { events } from "../../lib/events";

const ORDER: Record<InstallationStatus, number> = {
  SCHEDULED: 0,
  SURVEY: 1,
  PERMITS: 2,
  INSTALLED: 3,
  ACTIVATED: 4,
  INSPECTED: 5,
};

export async function list(filter: { status?: InstallationStatus }) {
  const q: Record<string, unknown> = {};
  if (filter.status) q.status = filter.status;
  return Installation.find(q).sort({ createdAt: -1 }).limit(200);
}

export async function getByContractId(contractId: string) {
  const i = await Installation.findOne({ contractId });
  if (!i) throw new HttpError(404, "Installation not found");
  return i;
}

export async function transition(id: string, nextStatus: InstallationStatus, notes?: string) {
  const inst = await Installation.findById(id);
  if (!inst) throw new HttpError(404, "Installation not found");

  const current = inst.status as InstallationStatus;
  if (ORDER[nextStatus] <= ORDER[current]) {
    throw new HttpError(400, `Cannot move from ${current} to ${nextStatus} (forward-only)`);
  }

  inst.status = nextStatus;
  inst.milestones.push({ status: nextStatus, date: new Date(), notes: notes ?? "" });
  if (nextStatus === "ACTIVATED") inst.activatedAt = new Date();
  await inst.save();

  if (nextStatus === "ACTIVATED") {
    events.emit("installation.activated", {
      installationId: inst._id.toString(),
      contractId: inst.contractId.toString(),
    });
  }
  return inst;
}

export { INSTALLATION_STATUSES };
