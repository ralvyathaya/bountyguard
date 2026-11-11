import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { collectGitHubEvidence, parseGitHubPullUrl, revalidateGitHubEvidence } from "../lib/github-evidence";
import type { EvidencePolicy } from "../lib/types";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const sha = "a".repeat(40);
const policy: EvidencePolicy = { repository: "owner/project", baseBranch: "main", requiredChecks: [{ name: "verify", appSlug: "github-actions", workflowPath: ".github/workflows/verify.yml" }] };
function mockGitHub(options: { sha?: string; checkSha?: string; publisher?: string; conclusion?: string; workflow?: string; files?: number; changedWorkflow?: boolean; renamedWorkflow?: boolean; largeDiff?: boolean; racedHead?: boolean } = {}) {
  let pullReads = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.github.com");
    assert.equal(init?.redirect, "error");
    if (url.pathname.endsWith("/actions/runs/123")) return Response.json({ head_sha: options.checkSha ?? sha, path: options.workflow ?? ".github/workflows/verify.yml" });
    if (url.pathname.endsWith("/check-runs")) return Response.json({ total_count: 1, check_runs: [{ id: 1, name: "verify", app: { slug: options.publisher ?? "github-actions" }, head_sha: options.checkSha ?? sha, status: "completed", conclusion: options.conclusion ?? "success", details_url: "https://github.com/owner/project/actions/runs/123/job/456" }] });
    if (url.pathname.endsWith("/files")) return Response.json([{ filename: options.changedWorkflow ? ".github/workflows/verify.yml" : "src/add.ts", previous_filename: options.renamedWorkflow ? ".github/workflows/verify.yml" : undefined, status: "modified" }]);
    if (new Headers(init?.headers).get("Accept") === "application/vnd.github.diff") return new Response(options.largeDiff ? "x".repeat(64001) : "diff --git a/src/add.ts b/src/add.ts\n+export const add = (a, b) => a + b;\n");
    pullReads++;
    return Response.json({ number: 7, head: { sha: options.racedHead && pullReads > 1 ? "b".repeat(40) : options.sha ?? sha }, base: { ref: "main", repo: { full_name: "owner/project", private: false } }, changed_files: options.files ?? 1 });
  };
}
test("only public GitHub PR URLs can select the fixed API endpoint", () => {
  assert.deepEqual(parseGitHubPullUrl("https://github.com/owner/project/pull/7"), { repository: "owner/project", prNumber: 7 });
  for (const url of ["http://github.com/owner/project/pull/7", "https://evil.test/owner/project/pull/7", "https://github.com/owner/project/pull/7?redirect=x", "https://github.com/owner/project/issues/7"]) assert.throws(() => parseGitHubPullUrl(url));
});
test("snapshot binds successful checks, publisher, workflow and exact head SHA", async () => {
  mockGitHub();
  const snapshot = await collectGitHubEvidence("https://github.com/owner/project/pull/7", policy);
  assert.equal(snapshot.eligible, true);
  assert.equal(snapshot.headSha, sha);
  assert.equal(snapshot.data.checks[0].workflowPath, ".github/workflows/verify.yml");
  assert.equal(snapshot.fingerprint.length, 64);
  assert.match(snapshot.data.diffText, /export const add/);
});
test("wrong SHA, publisher, workflow or non-success CI cannot authorize release", async () => {
  for (const options of [{ checkSha: "b".repeat(40) }, { publisher: "untrusted" }, { workflow: ".github/workflows/other.yml" }, { conclusion: "skipped" }, { conclusion: "failure" }]) {
    mockGitHub(options);
    const snapshot = await collectGitHubEvidence("https://github.com/owner/project/pull/7", policy);
    assert.equal(snapshot.eligible, false);
    assert.ok(snapshot.data.riskFlags.length > 0);
  }
});
test("truncated diff scope and workflow changes block release", async () => {
  for (const options of [{ files: 101 }, { changedWorkflow: true }, { renamedWorkflow: true }, { largeDiff: true }, { racedHead: true }]) {
    mockGitHub(options);
    assert.equal((await collectGitHubEvidence("https://github.com/owner/project/pull/7", policy)).eligible, false);
  }
});
test("changed PR head invalidates the immutable audited snapshot", async () => {
  mockGitHub();
  const snapshot = await collectGitHubEvidence("https://github.com/owner/project/pull/7", policy);
  mockGitHub({ sha: "b".repeat(40) });
  await assert.rejects(revalidateGitHubEvidence(snapshot, policy), (error: unknown) => error instanceof Error && "code" in error && error.code === "EVIDENCE_STALE");
});
test("GitHub rate limits and timeouts remain visible errors", async () => {
  globalThis.fetch = async () => Response.json({ message: "rate limited" }, { status: 403 });
  await assert.rejects(collectGitHubEvidence("https://github.com/owner/project/pull/7", policy), /GitHub/);
  globalThis.fetch = async () => { throw new DOMException("timeout", "TimeoutError"); };
  await assert.rejects(collectGitHubEvidence("https://github.com/owner/project/pull/7", policy), /GitHub/);
});
