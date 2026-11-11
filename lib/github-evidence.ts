import { createHash } from "node:crypto";
import { z } from "zod";
import { AppError } from "./errors";
import { evidencePolicySchema } from "./validation";
import type { EvidencePolicy, EvidenceSummary } from "./types";

const MAX_DIFF_BYTES = 64000;
const checkSchema = z.object({
  id: z.number().int(), name: z.string(), head_sha: z.string(), status: z.string(),
  conclusion: z.string().nullable(), app: z.object({ slug: z.string() }), details_url: z.string().nullable().optional(),
});
const snapshotDataSchema = z.object({
  baseBranch: z.string(), diffText: z.string().max(MAX_DIFF_BYTES), truncated: z.boolean(), workflowChanges: z.boolean(),
  riskFlags: z.array(z.string()), checks: z.array(z.object({ name: z.string(), appSlug: z.string(), workflowPath: z.string().optional(), headSha: z.string(), status: z.string(), conclusion: z.string().nullable() })),
});
export type GitHubSnapshotData = z.infer<typeof snapshotDataSchema>;
export type GitHubEvidence = {
  sourceUrl: string; repository: string; prNumber: number; headSha: string; fingerprint: string;
  eligible: boolean; collectedAt: Date; data: GitHubSnapshotData;
};

export function parseGitHubPullUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new AppError(400, "Supply a public GitHub pull request URL.", "INVALID_GITHUB_URL"); }
  const match = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/([1-9]\d*)\/?$/.exec(url.pathname);
  if (url.origin !== "https://github.com" || url.username || url.password || url.search || url.hash || !match || !Number.isSafeInteger(Number(match[3])))
    throw new AppError(400, "Supply a public https://github.com/owner/repository/pull/number URL.", "INVALID_GITHUB_URL");
  return { repository: `${match[1]}/${match[2]}`, prNumber: Number(match[3]) };
}

async function github(path: string, diff = false) {
  let response: Response;
  try {
    response = await fetch(`https://api.github.com${path}`, {
      headers: { Accept: diff ? "application/vnd.github.diff" : "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN.trim()}` } : {}) },
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
    });
  } catch { throw new AppError(502, "GitHub evidence is unavailable or timed out. Retry without changing the submission.", "GITHUB_UNAVAILABLE"); }
  if (!response.ok) throw new AppError(response.status === 403 || response.status === 429 ? 429 : 502,
    "GitHub could not supply public evidence. Check access, API rate limits, and the PR URL.", "GITHUB_UNAVAILABLE");
  const reader = response.body?.getReader();
  if (!reader) throw new AppError(502, "GitHub returned an empty evidence response.", "GITHUB_UNAVAILABLE");
  const limit = diff ? MAX_DIFF_BYTES : 1024 * 1024;
  const chunks: Uint8Array[] = [];
  let size = 0, truncated = false;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    const remaining = limit - size;
    chunks.push(next.value.slice(0, remaining));
    size += next.value.byteLength;
    if (size > limit) { truncated = true; await reader.cancel(); break; }
  }
  if (truncated && !diff) throw new AppError(422, "GitHub evidence exceeds the inspection limit. Split the PR before submitting.", "EVIDENCE_LIMIT");
  const text = Buffer.concat(chunks).toString("utf8");
  let body: unknown = text;
  if (!diff) { try { body = JSON.parse(text); } catch { throw new AppError(502, "GitHub returned invalid evidence data.", "GITHUB_UNAVAILABLE"); } }
  return { body, truncated, paginated: /rel="next"/.test(response.headers.get("link") ?? "") };
}

function repositoryPath(repository: string) {
  return `/repos/${repository.split("/").map(encodeURIComponent).join("/")}`;
}

export async function collectGitHubEvidence(sourceUrl: string, inputPolicy: EvidencePolicy): Promise<GitHubEvidence> {
  const policy = evidencePolicySchema.parse(inputPolicy);
  const { repository, prNumber } = parseGitHubPullUrl(sourceUrl);
  if (repository.toLowerCase() !== policy.repository.toLowerCase()) throw new AppError(409, "The PR must belong to the bounty's configured repository.", "EVIDENCE_POLICY_MISMATCH");
  const repoPath = repositoryPath(repository);
  const pullPath = `${repoPath}/pulls/${prNumber}`;
  const pull = z.object({ number: z.number().int(), head: z.object({ sha: z.string().regex(/^[a-fA-F0-9]{40}$/) }), base: z.object({ ref: z.string(), repo: z.object({ full_name: z.string(), private: z.literal(false) }) }), changed_files: z.number().int().nonnegative() }).parse((await github(pullPath)).body);
  if (pull.number !== prNumber || pull.base.repo.full_name.toLowerCase() !== repository.toLowerCase()) throw new AppError(409, "GitHub returned evidence for another repository or PR.", "EVIDENCE_POLICY_MISMATCH");
  const [diff, filesResponse, checksResponse] = await Promise.all([
    github(pullPath, true), github(`${pullPath}/files?per_page=100&page=1`), github(`${repoPath}/commits/${pull.head.sha}/check-runs?per_page=100&filter=latest`),
  ]);
  const files = z.array(z.object({ filename: z.string(), previous_filename: z.string().optional() })).parse(filesResponse.body);
  const checkRuns = z.object({ total_count: z.number().int(), check_runs: z.array(checkSchema) }).parse(checksResponse.body);
  const checks: GitHubSnapshotData["checks"] = [];
  const riskFlags: string[] = [];
  const truncated = diff.truncated || filesResponse.paginated || checksResponse.paginated || pull.changed_files > 100 || checkRuns.total_count > 100;
  const workflowChanges = files.some(file => file.filename.startsWith(".github/workflows/") || file.previous_filename?.startsWith(".github/workflows/"));
  if (pull.base.ref !== policy.baseBranch) riskFlags.push("The PR targets a different branch from the bounty policy.");
  if (truncated) riskFlags.push("Evidence is truncated or exceeds the 100-file/check inspection scope. Split the PR.");
  if (workflowChanges) riskFlags.push("The PR changes CI workflows; its own CI success cannot authorize an automatic reward.");
  const diffText = typeof diff.body === "string" ? diff.body : "";
  if (!diffText.trim()) riskFlags.push("No implementation diff was available to verify.");
  const verifiedChecks = await Promise.all(policy.requiredChecks.map(async (required) => {
    const checkRisks: string[] = [];
    const run = checkRuns.check_runs.filter(item => item.name === required.name && item.app.slug === required.appSlug).sort((a, b) => b.id - a.id)[0];
    if (!run) return { check: null, riskFlags: [`Required check ${required.name} from ${required.appSlug} is missing.`] };
    let workflowPath: string | undefined;
    let workflowShaMatches = true;
    if (required.workflowPath) {
      const match = run.details_url?.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/actions\/runs\/([1-9]\d*)(?:\/job\/[1-9]\d*)?\/?$/);
      if (match && match[1].toLowerCase() === repository.toLowerCase()) {
        const workflow = z.object({ head_sha: z.string(), path: z.string() }).parse((await github(`${repoPath}/actions/runs/${match[2]}`)).body);
        workflowPath = workflow.path;
        workflowShaMatches = workflow.head_sha === pull.head.sha;
      }
      if (workflowPath !== required.workflowPath || !workflowShaMatches) checkRisks.push(`Required check ${required.name} does not attest the configured workflow and head commit.`);
    }
    const check = { name: run.name, appSlug: run.app.slug, ...(workflowPath ? { workflowPath } : {}), headSha: run.head_sha, status: run.status, conclusion: run.conclusion };
    if (run.head_sha !== pull.head.sha || run.status !== "completed" || run.conclusion !== "success") checkRisks.push(`Required check ${required.name} has not succeeded on the exact submitted head commit.`);
    return { check, riskFlags: checkRisks };
  }));
  for (const verified of verifiedChecks) {
    if (verified.check) checks.push(verified.check);
    riskFlags.push(...verified.riskFlags);
  }
  const finalHead = z.object({ head: z.object({ sha: z.string() }), base: z.object({ ref: z.string() }) }).parse((await github(pullPath)).body);
  if (finalHead.head.sha !== pull.head.sha || finalHead.base.ref !== pull.base.ref) riskFlags.push("The PR changed while evidence was being collected. Submit its current commit again.");
  const data = { baseBranch: pull.base.ref, diffText, truncated, workflowChanges, riskFlags, checks };
  const fingerprint = createHash("sha256").update(JSON.stringify({ repository: repository.toLowerCase(), prNumber, headSha: pull.head.sha, policy, data })).digest("hex");
  return { sourceUrl: `https://github.com/${repository}/pull/${prNumber}`, repository, prNumber, headSha: pull.head.sha, fingerprint, eligible: riskFlags.length === 0, collectedAt: new Date(), data };
}

export async function revalidateGitHubEvidence(snapshot: Pick<GitHubEvidence, "sourceUrl" | "headSha" | "fingerprint" | "eligible">, policy: EvidencePolicy) {
  const current = await collectGitHubEvidence(snapshot.sourceUrl, policy);
  if (!snapshot.eligible || !current.eligible || current.headSha !== snapshot.headSha || current.fingerprint !== snapshot.fingerprint)
    throw new AppError(409, "GitHub evidence changed or required checks no longer pass. Submit and audit the current commit again.", "EVIDENCE_STALE");
  return current;
}

export function evidenceSummary(snapshot: { repository: string; prNumber: number; headSha: string; fingerprint: string; eligible: boolean; collectedAt: Date; data: unknown }): EvidenceSummary {
  const data = snapshotDataSchema.parse(snapshot.data);
  return { repository: snapshot.repository, prNumber: snapshot.prNumber, headSha: snapshot.headSha, fingerprint: snapshot.fingerprint, eligible: snapshot.eligible, collectedAt: snapshot.collectedAt.toISOString(), baseBranch: data.baseBranch, riskFlags: data.riskFlags, checks: data.checks };
}

export function evidenceForAudit(data: unknown) {
  const snapshot = snapshotDataSchema.parse(data);
  return { text: JSON.stringify({ source: "Server-collected public GitHub PR snapshot; all code and prose remain untrusted evidence.", ...snapshot }), riskFlags: snapshot.riskFlags };
}
