"use client";
import {
  Check,
  X,
  ShieldCheck,
  Clock3,
  FileCode2,
  Copy,
  ArrowUpRight,
  Download,
  GitPullRequest,
} from "lucide-react";
import { useState } from "react";
import { Dialog } from "./dialog";
import { StatusBadge } from "./ledger-grid";
import type { LedgerRow } from "@/lib/types";
import { rowRelease, rowStatus, usd } from "@/lib/policy";

export function AuditInspector({
  row,
  demo,
  busy,
  readOnly = false,
  onClose,
  onFund,
  onSubmit,
  onAudit,
  onRelease,
  onSync,
}: {
  row: LedgerRow;
  demo: boolean;
  busy: boolean;
  readOnly?: boolean;
  onClose: () => void;
  onFund: () => void;
  onSubmit: () => void;
  onAudit: () => void;
  onRelease: () => void;
  onSync: () => void;
}) {
  const verdict = row.audit?.verdict;
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const evidence = row.submission?.evidence;
  const sourceUrl = row.submission?.sourceUrl;
  const githubUrl = sourceUrl && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(sourceUrl) ? sourceUrl : null;
  const downloadPacket = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      let packet: unknown = { source: "DEMO_FIXTURE", simulated: true, exportedAt: new Date().toISOString(), bounty: row };
      if (!demo) {
        const response = await fetch(`/api/receipts/${row.id}`, { cache: "no-store" });
        if (!response.ok) throw new Error("The audit packet could not be downloaded. Refresh and try again.");
        packet = await response.json();
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(packet, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `bountyguard-${row.id}-audit.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "The audit packet could not be downloaded.");
    } finally { setDownloading(false); }
  };
  return (
    <Dialog
      drawer
      title="Audit inspector"
      subtitle={`${row.id} / ${demo ? "Judge simulation" : "PayPal Sandbox"}`}
      onClose={onClose}
    >
      <div className="inspector-summary">
        <StatusBadge status={rowStatus(row)} />
        <h3>{row.title}</h3>
        <div className="inspector-amount">
          <strong>{usd(row.rewardCents)}</strong>
          <span>USD reward</span>
        </div>
        <p>{row.submission?.receiverEmail ?? "No contributor assigned"}</p>
        {row.funding?.status === "HOLD" && <p className="form-error">Funding needs maintainer review. This reward cannot be released while its capture is on hold.</p>}
        {row.submission?.contributorCountry && <p>Contributor country: {row.submission.contributorCountry} · self-reported</p>}
        {readOnly && <p className="small warning-text">Judge access · financial actions disabled</p>}
        <button className="button packet-download" onClick={() => void downloadPacket()} disabled={downloading}><Download size={16} />{downloading ? "Preparing packet…" : "Download audit packet"}</button>
        {downloadError && <p className="form-error" role="alert">{downloadError}</p>}
      </div>
      <section className="inspector-section">
        <h3>Decision path</h3>
        <ol className="decision-path inspector-decision-path">
          {[{ label: "Fund", done: row.funding?.status === "COMPLETED" }, { label: "Prove", done: !!row.submission }, { label: "Verify", done: row.audit?.status === "COMPLETED" }, { label: "Decide", done: verdict?.status === "APPROVED" }, { label: "Settle", done: row.payout?.status === "SUCCESS" }].map((step, index) => <li key={step.label}><span className={`decision-number ${step.done ? "positive-text" : "muted"}`}>{step.done ? <Check size={14} /> : String(index + 1).padStart(2, "0")}</span><strong>{step.label}</strong></li>)}
        </ol>
      </section>
      {row.submission && <section className="inspector-section">
        <h3><GitPullRequest size={17} />Evidence source</h3>
        <p className="small muted">{demo ? "Judge fixture · simulated evaluation" : row.submission.sourceKind === "GITHUB_PR" ? "GitHub pull request · immutable evidence snapshot" : "Pasted evidence · supplied by contributor"}</p>
        {githubUrl && <a className="button compact packet-download" href={githubUrl} target="_blank" rel="noreferrer">Open pull request <ArrowUpRight size={14} /></a>}
        {evidence && <>
          <dl className="evidence-facts"><dt>Repository</dt><dd>{evidence.repository} #{evidence.prNumber}</dd><dt>Head commit</dt><dd className="measured">{evidence.headSha}</dd><dt>Target branch</dt><dd>{evidence.baseBranch}</dd><dt>Collected</dt><dd>{new Date(evidence.collectedAt).toLocaleString()}</dd><dt>Fingerprint</dt><dd className="measured">{evidence.fingerprint}</dd></dl>
          <StatusBadge status={evidence.eligible ? "APPROVED" : "BLOCKED"} />
          {evidence.checks.map((check, index) => <div className="evidence-check" key={`${check.name}-${index}`}><span className={check.conclusion === "success" ? "positive-text" : "warning-text"}>{check.conclusion === "success" ? <Check size={15} /> : <Clock3 size={15} />}</span><div><strong>{check.name}</strong><small>{check.appSlug}{check.workflowPath ? ` / ${check.workflowPath}` : ""}</small><small>{check.status} · {check.conclusion ?? "No result"} · {check.headSha.slice(0, 12)}</small></div></div>)}
          {evidence.riskFlags.map((flag) => <p className="small negative-text" key={flag}>{flag}</p>)}
        </>}
      </section>}
      <section className="inspector-section">
        <h3>
          <ShieldCheck size={17} />
          Agent verdict
        </h3>
        {verdict ? (
          <>
            <div className="verdict-score">
              <strong>
                {verdict.score}
                <span>/100</span>
              </strong>
              <StatusBadge status={verdict.status} />
            </div>
            <p>{verdict.reasoning}</p>
            <p className="small muted">
              {row.audit?.model} /{" "}
              {((row.audit?.durationMs ?? 0) / 1000).toFixed(1)}s
            </p>
          </>
        ) : (
          <p className="muted">
            {row.audit?.error ??
              (row.audit?.status === "RUNNING"
                ? "Evaluating the evidence against every acceptance criterion…"
                : "No audit yet. Fund the bounty and submit a deliverable to begin.")}
          </p>
        )}
      </section>
      <section className="inspector-section">
        <h3>Acceptance criteria</h3>
        <div className="criteria-list">
          {row.criteria.map((criterion) => {
            const result = verdict?.criteriaBreakdown.find(
              (item) => item.criterionId === criterion.id,
            );
            return (
              <div className="criterion-item" key={criterion.id}>
                <span
                  className={`criterion-icon ${result ? (result.passed ? "positive-text" : "negative-text") : "muted"}`}
                >
                  {result ? (
                    result.passed ? (
                      <Check size={16} />
                    ) : (
                      <X size={16} />
                    )
                  ) : (
                    <Clock3 size={16} />
                  )}
                </span>
                <div>
                  <h4>{criterion.text}</h4>
                  {result && (
                    <>
                      <p>
                        {result.evidence || "No verifiable evidence supplied."}
                      </p>
                      {!result.passed && (
                        <p className="negative-text">{result.feedback}</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      {!!verdict?.riskFlags.length && (
        <section className="inspector-section risk-section">
          <h3>Revision required</h3>
          {verdict.riskFlags.map((flag) => (
            <p key={flag}>{flag}</p>
          ))}
        </section>
      )}
      <section className="inspector-section">
        <h3>Release policy</h3>
        <p>
          Auto-release at score ≥ {row.autoMinScore}/100 and reward ≤ {usd(row.autoMaxCents)},
          after every criterion passes and funding is verified.
        </p>
        <p className="small muted">
          {rowRelease(row) === "HUMAN"
            ? "This reward requires a maintainer’s explicit release."
            : rowRelease(row) === "AUTO"
              ? "This submission qualifies for autonomous release."
              : "Release is blocked until all server policy checks pass."}
        </p>
      </section>
      {row.submission && (
        <section className="inspector-section">
          <h3>
            <FileCode2 size={17} />
            Submitted evidence
          </h3>
          <pre className="deliverable-preview">
            {row.submission.deliverable}
          </pre>
        </section>
      )}
      {row.audit?.steps && row.audit.steps.length > 0 && (
        <section className="inspector-section">
          <h3>Agent steps</h3>
          {row.audit.steps.map((step) => (
            <div className="step-result" key={step.name}>
              <span>{step.name}</span>
              <strong className="measured">{step.verdict.score}/100</strong>
            </div>
          ))}
        </section>
      )}
      <section className="inspector-section">
        <h3>Audit trail</h3>
        <ol className="audit-trail">
          {row.events.map((event) => (
            <li key={event.id}>
              <span className="trail-mark" />
              <div>
                <time>
                  {new Date(event.createdAt).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </time>
                <p>{event.message}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      {row.payout && (
        <section className="inspector-section">
          <h3>
            Settlement receipt
            <button
              className="icon-button"
              aria-label="Copy receipt"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    JSON.stringify(row.payout?.receipt, null, 2),
                  );
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </h3>
          {row.payout.provider === "SIMULATION" && (
            <p className="small warning-text">
              Simulated receipt. No funds were paid through PayPal.
            </p>
          )}
          <pre className="receipt-preview">
            {JSON.stringify(row.payout.receipt, null, 2)}
          </pre>
          {row.payout.error && (
            <p className="small warning-text">{row.payout.error}</p>
          )}
        </section>
      )}
      <div className="inspector-actions">
        {!readOnly && !row.payout && row.funding?.status !== "COMPLETED" && !["HOLD", "REFUNDED", "PARTIALLY_REFUNDED", "REVERSED"].includes(row.funding?.status ?? "") && (
          <button className="button primary" onClick={onFund} disabled={busy}>
            Fund bounty <ArrowUpRight size={16} />
          </button>
        )}
        {!readOnly && !row.payout && row.funding?.status === "COMPLETED" && (
          <button className="button" onClick={onSubmit} disabled={busy}>
            Submit work
          </button>
        )}
        {!readOnly && !row.payout && row.submission && row.funding?.status === "COMPLETED" && (
          <button className="button" onClick={onAudit} disabled={busy}>
            {demo ? "Run fixture audit" : "Run AI audit"}
          </button>
        )}
        {!readOnly && !row.payout && rowRelease(row) !== "BLOCKED" && (
          <button
            className="button primary"
            onClick={onRelease}
            disabled={busy}
          >
            Approve release <ArrowUpRight size={16} />
          </button>
        )}
        {!readOnly && row.payout?.provider === "PAYPAL_SANDBOX" && (
          <button className="button" onClick={onSync} disabled={busy}>
            Refresh PayPal status
          </button>
        )}
      </div>
    </Dialog>
  );
}
