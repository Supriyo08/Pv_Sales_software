import { Solution } from "./solution.model";
import { SolutionVersion } from "./solution-version.model";
import { HttpError } from "../../middleware/error";
import { events } from "../../lib/events";

type CreateSolutionInput = { name: string; description?: string };

type CreateVersionInput = {
  validFrom: Date;
  validTo?: Date | null;
  basePriceCents: number;
  currency?: string;
  agentBp: number;
  managerBp: number;
  changeReason?: string;
};

export async function listSolutions() {
  return Solution.find({ deletedAt: null }).sort({ name: 1 });
}

export async function getSolution(id: string) {
  const s = await Solution.findOne({ _id: id, deletedAt: null });
  if (!s) throw new HttpError(404, "Solution not found");
  return s;
}

export async function createSolution(input: CreateSolutionInput) {
  const exists = await Solution.findOne({ name: input.name });
  if (exists) throw new HttpError(409, "Solution name already exists");
  return Solution.create(input);
}

export async function listVersions(solutionId: string) {
  await getSolution(solutionId);
  return SolutionVersion.find({ solutionId }).sort({ validFrom: -1 });
}

export async function activeVersionAt(solutionId: string, at: Date) {
  const v = await SolutionVersion.findOne({
    solutionId,
    validFrom: { $lte: at },
    $or: [{ validTo: null }, { validTo: { $gt: at } }],
  })
    .sort({ validFrom: -1 })
    .lean();
  if (!v) throw new HttpError(404, "No active version for that date");
  return v;
}

export async function createVersion(
  solutionId: string,
  createdBy: string,
  input: CreateVersionInput
) {
  await getSolution(solutionId);

  const previous = await SolutionVersion.findOne({ solutionId, validTo: null }).sort({
    validFrom: -1,
  });
  if (previous && previous.validFrom >= input.validFrom) {
    throw new HttpError(400, "validFrom must be after the previous version's validFrom");
  }

  const version = await SolutionVersion.create({
    solutionId,
    validFrom: input.validFrom,
    validTo: input.validTo ?? null,
    basePriceCents: input.basePriceCents,
    currency: input.currency ?? "EUR",
    agentBp: input.agentBp,
    managerBp: input.managerBp,
    changeReason: input.changeReason ?? "",
    createdBy,
  });

  if (previous && !previous.validTo) {
    previous.validTo = input.validFrom;
    await previous.save();
  }

  events.emit("solution.version.updated", {
    solutionId,
    versionId: version._id.toString(),
  });

  return version;
}
