"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { ZodError } from "zod";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Code2,
  ExternalLink,
  Globe2,
  Info,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  ShieldX,
  SlidersHorizontal,
  Sparkles,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import type { GridApi } from "ag-grid-community";
import type { AppMode, LedgerRow } from "@/lib/types";
import {
  completeDemoAudit,
  createDemoRows,
  demoEvent,
  releaseDemo,
} from "@/lib/demo";
import {
  dollarsToCents,
  ledgerKpis,
  isReleased,
  rowRelease,
  rowStatus,
  usd,
} from "@/lib/policy";
import {
  demoLedgerSchema,
  bountySchema,
  submissionSchema,
} from "@/lib/validation";
import { LedgerGrid } from "./ledger-grid";
import { AuditInspector } from "./audit-inspector";
import { Dialog } from "./dialog";

const STORE = "bountyguard-demo-v1";
type Modal =
  | { kind: "create" | "login" | "guide" | "reset" }
  | { kind: "fund" | "submit" | "release"; rowId: string }
  | null;
type View = "all" | "review" | "settled" | "blocked";
type Notice = { tone: "success" | "error" | "info"; text: string } | null;

async function requestJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "The operation could not be completed.");
  return result as T;
}
function readDemo(): LedgerRow[] {
  try {
    const saved = localStorage.getItem(STORE);
    if (saved) {
      const parsed = demoLedgerSchema.safeParse(JSON.parse(saved));
      if (parsed.success)
        return parsed.data.map((row) =>
          row.audit?.status === "RUNNING" ? { ...row, audit: null } : row,
        ) as LedgerRow[];
    }
  } catch {
    /* Browser storage may be unavailable or contain an older fixture version. */
  }
  return createDemoRows();
}
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function CommandCenter() {
  const [mode, setMode] = useState<AppMode>("demo");
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [config, setConfig] = useState<{
    paypalClientId: string | null;
    missing: string[];
  } | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("all");
  const [modal, setModal] = useState<Modal>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState("");
  const [stage, setStage] = useState("");
  const active = useRef(false);
  const grid = useRef<GridApi<LedgerRow> | null>(null);
  const demoRows = useRef<LedgerRow[]>([]);
  const modeRef = useRef<AppMode>("demo");

  useEffect(() => {
    const initial = readDemo();
    demoRows.current = initial;
    setRows(initial);
    setLoading(false);
    const params = new URL(window.location.href).searchParams;
    setSearch(params.get("q") ?? "");
    const selected = params.get("view");
    if (["all", "review", "settled", "blocked"].includes(selected ?? ""))
      setView(selected as View);
    requestJson<{ authenticated: boolean }>("/api/auth/session")
      .then((result) => setAuthenticated(result.authenticated))
      .catch(() => setAuthenticated(false));
  }, []);
  useEffect(() => {
    if (mode !== "demo" || loading) return;
    demoRows.current = rows;
    try {
      localStorage.setItem(STORE, JSON.stringify(rows));
    } catch {
      /* Demo still works without persistent browser storage. */
    }
  }, [rows, mode, loading]);
  useEffect(() => {
    const url = new URL(window.location.href);
    search ? url.searchParams.set("q", search) : url.searchParams.delete("q");
    view !== "all"
      ? url.searchParams.set("view", view)
      : url.searchParams.delete("view");
    window.history.replaceState(null, "", url);
  }, [search, view]);

  const refresh = useCallback(async () => {
    const result = await requestJson<{ rows: LedgerRow[] }>("/api/bounties");
    if (modeRef.current === "connected") setRows(result.rows);
  }, []);
  const operate = useCallback(
    async (label: string, work: () => Promise<void>) => {
      if (active.current) return false;
      active.current = true;
      setBusy(label);
      setNotice(null);
      try {
        await work();
        return true;
      } catch (error) {
        setNotice({
          tone: "error",
          text:
            error instanceof ZodError
              ? error.issues.map((issue) => issue.message).join(" ")
              : error instanceof Error
                ? error.message
                : "Something went wrong. Try again.",
        });
        return false;
      } finally {
        active.current = false;
        setBusy("");
        setStage("");
      }
    },
    [],
  );
  const enterConnected = async () => {
    if (!authenticated) {
      setNotice(null);
      setModal({ kind: "login" });
      return;
    }
    await operate("Loading sandbox ledger", async () => {
      const [ledgerData, setup] = await Promise.all([
        requestJson<{ rows: LedgerRow[] }>("/api/bounties"),
        requestJson<{ paypalClientId: string | null; missing: string[] }>(
          "/api/config",
        ),
      ]);
      setConfig(setup);
      modeRef.current = "connected";
      setMode("connected");
      setRows(ledgerData.rows);
      setInspectId(null);
      setView("all");
      setSearch("");
    });
  };
  const enterDemo = () => {
    if (active.current) return;
    modeRef.current = "demo";
    setMode("demo");
    setRows(demoRows.current);
    setInspectId(null);
    setNotice(null);
    setView("all");
  };
  useEffect(() => {
    if (mode !== "connected" || !authenticated) return;
    let syncing = false;
    const tick = async () => {
      if (syncing || active.current) return;
      const pending = rows.filter(
        (row) =>
          row.payout?.provider === "PAYPAL_SANDBOX" &&
          [
            "PENDING",
            "PROCESSING",
            "REQUESTED",
            "UNKNOWN",
            "UNCLAIMED",
            "ONHOLD",
          ].includes(row.payout.status),
      );
      if (!pending.length) return;
      syncing = true;
      try {
        const results = await Promise.allSettled(
          pending.map((row) =>
            requestJson(`/api/paypal/payout/${row.payout!.id}/sync`, {}),
          ),
        );
        if (results.some((result) => result.status === "fulfilled"))
          await refresh();
      } finally {
        syncing = false;
      }
    };
    const timer = setInterval(() => {
      void tick().catch(() => undefined);
    }, 5000);
    return () => clearInterval(timer);
  }, [mode, authenticated, rows, refresh]);

  const replaceRow = (row: LedgerRow) =>
    setRows((current) =>
      current.map((item) => (item.id === row.id ? row : item)),
    );
  const runAudit = async (row: LedgerRow, scenario?: "A" | "B" | "C") => {
    scenario ??=
      row.id === "BG-1043" ? "B" : row.id === "BG-1044" ? "C" : undefined;
    setView("all");
    setSearch("");
    await operate(
      scenario ? `Running scenario ${scenario}` : "Auditing submission",
      async () => {
        if (mode === "connected") {
          if (!row.submission) throw new Error("Submit a deliverable first.");
          setStage("Evaluating evidence and challenging the verdict");
          try {
            await requestJson("/api/agent/audit", {
              submissionId: row.submission.id,
            });
          } finally {
            await refresh();
          }
          setInspectId(row.id);
          return;
        }
        const prepared = {
          ...row,
          payout: null,
          events: row.events,
          submission: row.submission ?? {
            id: `demo-submission-${row.id}`,
            receiverEmail: "developer@demo.example",
            deliverable:
              "Judge fixture: implementation, regression tests, and documentation are supplied.",
            createdAt: new Date().toISOString(),
          },
        };
        if (scenario === "B")
          prepared.submission = {
            ...prepared.submission,
            deliverable:
              "Incomplete patch: implementation only. No tests or regression coverage included. Documentation is a short setup note.",
          };
        if (prepared.funding?.status !== "COMPLETED")
          throw new Error("Fund this bounty before running its fixture audit.");
        const started = performance.now();
        const running: LedgerRow = {
          ...prepared,
          audit: {
            id: `demo-audit-${row.id}`,
            status: "RUNNING",
            verdict: null,
            steps: [],
            model: "Deterministic judge fixture",
            durationMs: null,
            error: null,
            completedAt: null,
          },
          events: [
            ...prepared.events,
            demoEvent(
              "AUDIT_STARTED",
              "Fixture agent started. No LLM or PayPal API is being called.",
            ),
          ],
        };
        replaceRow(running);
        setStage("1 / 3 · Checking acceptance criteria");
        await sleep(550);
        setStage("2 / 3 · Challenging evidence and checking risks");
        await sleep(550);
        setStage("3 / 3 · Applying the server-equivalent release policy");
        await sleep(450);
        const completed = completeDemoAudit(
          running,
          scenario === "C" ? 92 : scenario === "B" ? 58 : 96,
          scenario === "B",
          Math.round(performance.now() - started),
        );
        replaceRow(completed);
        setInspectId(row.id);
        setNotice({
          tone: scenario === "B" ? "info" : "success",
          text:
            scenario === "B"
              ? "Missing test coverage detected. Payout blocked and revision feedback generated."
              : completed.payout
                ? `${usd(row.rewardCents)} released autonomously. Simulated receipt recorded.`
                : "Deliverable approved. Waiting for a maintainer’s one-click release.",
        });
      },
    );
  };
  const runScenario = (scenario: "A" | "B" | "C") => {
    if (active.current) return;
    const row =
      createDemoRows()[scenario === "A" ? 0 : scenario === "B" ? 1 : 2];
    setRows((current) =>
      current.some((item) => item.id === row.id)
        ? current.map((item) => (item.id === row.id ? row : item))
        : [row, ...current],
    );
    void runAudit(row, scenario);
  };
  const inspect = useCallback((row: LedgerRow) => {
    setInspectId(row.id);
  }, []);
  const release = useCallback((row: LedgerRow) => {
    setNotice(null);
    setInspectId(null);
    setModal({ kind: "release", rowId: row.id });
  }, []);
  const openModal = (value: Modal) => {
    setNotice(null);
    setInspectId(null);
    setModal(value);
  };
  const kpis = useMemo(() => ledgerKpis(rows, mode === "demo"), [rows, mode]);
  const counts = useMemo(
    () => ({
      all: rows.length,
      review: rows.filter((row) => rowStatus(row) === "AWAITING_APPROVAL")
        .length,
      settled: rows.filter((row) => isReleased(row, mode === "demo")).length,
      blocked: rows.filter((row) =>
        ["REVISION_REQUIRED", "FAILED", "AUDIT_FAILED", "BLOCKED"].includes(
          rowStatus(row),
        ),
      ).length,
    }),
    [rows, mode],
  );
  const filteredRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          view === "all" ||
          (view === "review"
            ? rowStatus(row) === "AWAITING_APPROVAL"
            : view === "settled"
              ? isReleased(row, mode === "demo")
              : [
                  "REVISION_REQUIRED",
                  "FAILED",
                  "AUDIT_FAILED",
                  "BLOCKED",
                ].includes(rowStatus(row))),
      ),
    [rows, view, mode],
  );
  const inspected = rows.find((row) => row.id === inspectId);
  const modalRow =
    modal && "rowId" in modal
      ? rows.find((row) => row.id === modal.rowId)
      : undefined;
  const activity = useMemo(
    () =>
      rows
        .flatMap((row) =>
          row.events.map((event) => ({ ...event, bountyId: row.id })),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 4),
    [rows],
  );
  const formError =
    notice?.tone === "error" ? (
      <p className="form-error" role="alert">
        {notice.text}
      </p>
    ) : null;

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await operate("Creating bounty", async () => {
      const parsed = bountySchema.parse({
        title: data.get("title"),
        reward: data.get("reward"),
        autoMaxReward: data.get("autoMaxReward"),
        autoMinScore: Number(data.get("autoMinScore")),
        criteria: String(data.get("criteria"))
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((text, index) => ({ id: `criterion-${index + 1}`, text })),
      });
      if (mode === "connected") {
        await requestJson("/api/bounties", parsed);
        await refresh();
      } else {
        const row: LedgerRow = {
          id: `BG-${crypto.randomUUID().slice(0, 8)}`,
          title: parsed.title,
          criteria: parsed.criteria,
          rewardCents: dollarsToCents(parsed.reward),
          autoMinScore: parsed.autoMinScore,
          autoMaxCents: dollarsToCents(parsed.autoMaxReward),
          createdAt: new Date().toISOString(),
          submission: null,
          audit: null,
          funding: null,
          payout: null,
          events: [
            demoEvent(
              "BOUNTY_CREATED",
              "Demo bounty created. Fund it with a simulated capture to begin.",
            ),
          ],
        };
        setRows((current) => [row, ...current]);
        setInspectId(row.id);
      }
      setModal(null);
      setNotice({
        tone: "success",
        text: "Bounty created. Fund it before accepting a submission.",
      });
    });
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modalRow) return;
    const data = new FormData(event.currentTarget);
    const row = modalRow;
    const success = await operate("Saving submission", async () => {
      const parsed = submissionSchema.parse({
        receiverEmail: data.get("receiverEmail"),
        deliverable: data.get("deliverable"),
      });
      if (mode === "connected") {
        await requestJson(`/api/bounties/${row.id}/submissions`, parsed);
        await refresh();
      } else
        replaceRow({
          ...row,
          submission: {
            id: `demo-submission-${crypto.randomUUID()}`,
            ...parsed,
            createdAt: new Date().toISOString(),
          },
          audit: null,
          events: [
            ...row.events,
            demoEvent(
              "SUBMISSION_RECEIVED",
              "New demo submission received. Run a fixture audit to preview the workflow.",
            ),
          ],
        });
      setModal(null);
      setInspectId(row.id);
      setNotice({
        tone: "success",
        text: "Submission saved. Run its audit from the inspector.",
      });
    });
    return success;
  }
  const approveRelease = () => {
    if (!modalRow?.submission) return;
    const row = modalRow;
    void operate("Releasing reward", async () => {
      if (mode === "connected") {
        try {
          await requestJson("/api/paypal/payout", {
            bountyId: row.id,
            submissionId: row.submission!.id,
          });
        } finally {
          await refresh();
        }
      } else replaceRow(releaseDemo(row, "HUMAN"));
      setModal(null);
      setInspectId(row.id);
      setNotice({
        tone: "success",
        text:
          mode === "demo"
            ? "Maintainer approved the simulated release. Receipt recorded."
            : "Release submitted. The ledger will show settled only after PayPal reports item-level success.",
      });
    });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <a href="/" className="wordmark" aria-label="BountyGuard home">
            <span className="brand-mark">
              <ShieldCheck size={23} strokeWidth={1.8} />
            </span>
            BountyGuard
          </a>
          <span className="nav-divider" />
          <span className="workspace-label">
            Workspace <ChevronDown size={13} />
          </span>
          <nav className="top-nav" aria-label="Main navigation">
            <a href="#main" className="nav-active">
              Command center
            </a>
            <button onClick={() => openModal({ kind: "guide" })}>
              How it works <ExternalLink size={12} />
            </button>
          </nav>
          <div className="topbar-right">
            <span className="sandbox-label">
              <ShieldCheck size={13} />
              Sandbox only
            </span>
            <a
              href="https://github.com/ralvyathaya/bountyguard"
              target="_blank"
              rel="noreferrer"
              className="icon-button"
              aria-label="View source on GitHub"
            >
              <Code2 size={19} />
            </a>
            <button
              className="avatar"
              aria-label={
                authenticated
                  ? "Sign out maintainer"
                  : "Unlock maintainer access"
              }
              onClick={() => {
                if (authenticated)
                  void operate("Signing out", async () => {
                    await requestJson("/api/auth/logout", {});
                    setAuthenticated(false);
                    modeRef.current = "demo";
                    setMode("demo");
                    setRows(demoRows.current);
                    setConfig(null);
                  });
                else openModal({ kind: "login" });
              }}
            >
              {authenticated ? "M" : "BG"}
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="main-content">
        <div className="page-heading">
          <div>
            <div className="breadcrumb">
              Workspace <span>/</span> Overview
            </div>
            <h1>Bounty command center</h1>
            <p>Verify the work. Release the reward. Keep the proof.</p>
          </div>
          <div className="heading-actions">
            <div className="mode-switch" aria-label="Application mode">
              <button
                aria-pressed={mode === "demo"}
                disabled={!!busy}
                onClick={enterDemo}
              >
                <Sparkles size={14} />
                Judge demo
              </button>
              <button
                aria-pressed={mode === "connected"}
                disabled={!!busy}
                onClick={() => void enterConnected()}
              >
                <LockKeyhole size={13} />
                Sandbox connected
              </button>
            </div>
            <button
              className="button primary"
              onClick={() => openModal({ kind: "create" })}
              disabled={!!busy || loading}
            >
              <Plus size={16} />
              Create bounty
            </button>
          </div>
        </div>
        <div
          className={`mode-notice ${mode === "connected" ? "connected-notice" : ""}`}
        >
          <Info size={15} />
          <p>
            {mode === "demo" ? (
              <>
                <strong>You’re in judge demo.</strong> Seeded evidence, fixed AI
                verdicts, simulated payments. No credentials needed.
              </>
            ) : (
              <>
                <strong>PayPal Sandbox connected.</strong> Real custom LLM calls
                and sandbox API operations. No live money.
              </>
            )}
          </p>
          {mode === "demo" ? (
            <button
              onClick={() => openModal({ kind: "reset" })}
              disabled={!!busy}
            >
              <RotateCcw size={13} />
              Reset demo
            </button>
          ) : (
            <button
              onClick={() => void operate("Refreshing ledger", refresh)}
              disabled={!!busy}
            >
              <RefreshCw size={13} />
              Refresh ledger
            </button>
          )}
        </div>
        {mode === "connected" && !!config?.missing.length && (
          <div className="notice info">
            <Info size={16} />
            <span>
              Setup required: {config.missing.join(", ")}. Add these server
              environment variables to enable connected operations.
            </span>
          </div>
        )}
        {notice && !modal && (
          <div
            className={`notice ${notice.tone}`}
            role={notice.tone === "error" ? "alert" : "status"}
          >
            {notice.tone === "success" ? (
              <Check size={16} />
            ) : (
              <Info size={16} />
            )}
            <span>{notice.text}</span>
            <button
              className="icon-button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss notification"
            >
              <X size={15} />
            </button>
          </div>
        )}
        <section className="kpi-strip" aria-label="Financial overview">
          <div className="kpi">
            <span>Total escrow funded</span>
            <strong>{loading ? "—" : usd(kpis.fundedCents)}</strong>
            <p>Verified USD captures{mode === "demo" ? " / simulated" : ""}</p>
          </div>
          <div className="kpi">
            <span>Autonomous payouts</span>
            <strong>
              {loading ? "—" : kpis.autonomousPayouts}
              <span className="kpi-unit">executed</span>
            </strong>
            <p>
              {mode === "demo"
                ? "Completed in the judge simulation"
                : "Confirmed PayPal item successes"}
            </p>
          </div>
          <div className="kpi">
            <span>Average verification time</span>
            <strong>
              {kpis.averageMs == null
                ? "—"
                : (kpis.averageMs / 1000).toFixed(1)}
              <span className="kpi-unit">seconds</span>
            </strong>
            <p>Across completed {mode === "demo" ? "fixture" : "AI"} audits</p>
          </div>
          <div className="kpi">
            <span>Prevented bad payouts</span>
            <strong>
              {loading ? "—" : kpis.prevented}
              <span className="kpi-unit">blocked</span>
            </strong>
            <p>Incomplete work caught before release</p>
          </div>
        </section>
        <section className="judge-section" aria-label="Judge scenarios">
          <div className="section-heading">
            <div>
              <h2>
                <Zap size={16} />
                The 30-second judge path
              </h2>
              <span>Three outcomes. One accountable agent.</span>
            </div>
            <span className="small muted">
              {mode === "demo"
                ? "Click a scenario to run it"
                : "Switch to judge demo to run presets"}
            </span>
          </div>
          <div className="scenario-grid">
            <button
              className="scenario"
              disabled={!!busy || mode !== "demo"}
              onClick={() => runScenario("A")}
            >
              <span className="scenario-letter positive">A</span>
              <div>
                <h3>Good work. Instant reward.</h3>
                <p>Bugfix → 96% verified → auto-release</p>
              </div>
              <div className="scenario-end">
                <strong>$35</strong>
                <ArrowUpRight size={16} />
              </div>
            </button>
            <button
              className="scenario"
              disabled={!!busy || mode !== "demo"}
              onClick={() => runScenario("B")}
            >
              <span className="scenario-letter negative">B</span>
              <div>
                <h3>No tests. No payout.</h3>
                <p>Missing coverage → revision required</p>
              </div>
              <div className="scenario-end">
                <ShieldX size={20} />
              </div>
            </button>
            <button
              className="scenario"
              disabled={!!busy || mode !== "demo"}
              onClick={() => runScenario("C")}
            >
              <span className="scenario-letter warning">C</span>
              <div>
                <h3>Big reward. Human decision.</h3>
                <p>Architecture → 92% → maintainer approval</p>
              </div>
              <div className="scenario-end">
                <strong>$250</strong>
                <ArrowUpRight size={16} />
              </div>
            </button>
          </div>
        </section>
        {busy && (
          <div className="agent-working" role="status">
            <LoaderCircle className="spin" size={17} />
            <strong>{busy}</strong>
            <span>{stage || "Updating the ledger…"}</span>
          </div>
        )}
        <section className="ledger-panel" aria-labelledby="ledger-heading">
          <div className="ledger-title-row">
            <div className="ledger-title">
              <h2 id="ledger-heading">Financial & agent ledger</h2>
              <span className="record-count">{rows.length} bounties</span>
            </div>
            <div className="ledger-tools">
              <span className="grid-brand">
                Powered by <strong>AG Grid</strong>
              </span>
              <button
                className="button compact"
                onClick={() => grid.current?.exportDataAsCsv()}
                disabled={loading || !rows.length}
              >
                <ArrowDownToLine size={15} />
                Export CSV
              </button>
            </div>
          </div>
          <div className="ledger-toolbar">
            <div className="filter-tabs" aria-label="Filter bounties">
              {(
                [
                  ["all", "All bounties"],
                  ["review", "Needs review"],
                  ["settled", mode === "demo" ? "Released" : "Settled"],
                  ["blocked", "Blocked"],
                ] as [View, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={view === key}
                  onClick={() => setView(key)}
                >
                  {label}
                  <span>{counts[key]}</span>
                </button>
              ))}
            </div>
            <label className="search-input">
              <Search size={15} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search bounties, contributors…"
                aria-label="Search ledger"
              />
              {search && (
                <button onClick={() => setSearch("")} aria-label="Clear search">
                  <X size={13} />
                </button>
              )}
            </label>
            <span
              className="filter-hint"
              title="Use the menu in any column header to filter"
            >
              <SlidersHorizontal size={15} />
            </span>
          </div>
          {loading ? (
            <div className="ledger-skeleton" aria-label="Loading ledger">
              <div />
              <div />
              <div />
              <div />
              <div />
            </div>
          ) : !rows.length ? (
            <div className="empty-state">
              <Workflow size={30} />
              <h3>Your first bounty starts here.</h3>
              <p>
                Create a task, define the proof, and fund its reward with PayPal
                Sandbox.
              </p>
              <button
                className="button primary"
                onClick={() => openModal({ kind: "create" })}
              >
                <Plus size={16} />
                Create bounty
              </button>
            </div>
          ) : (
            <LedgerGrid
              rows={filteredRows}
              search={search}
              busy={!!busy}
              onInspect={inspect}
              onRelease={release}
              onReady={(api) => {
                grid.current = api;
              }}
            />
          )}
          <div className="ledger-footnote">
            <span>
              <ShieldCheck size={13} />
              Every release follows a verified audit and funding check.
            </span>
            <span>
              USD ledger <span className="footnote-slash">/</span>{" "}
              {mode === "demo" ? "Simulated receipts" : "PayPal Sandbox"}
            </span>
          </div>
        </section>
        <div className="bottom-grid">
          <section className="activity-panel">
            <div className="section-heading">
              <h2>
                <Activity size={16} />
                Agent activity
              </h2>
              <span className="small muted">Latest ledger events</span>
            </div>
            {activity.length ? (
              <ol className="activity-list">
                {activity.map((event) => (
                  <li key={event.id}>
                    <span
                      className={`event-symbol ${event.type.includes("BLOCK") || event.type.includes("REVISION") ? "negative-text" : "positive-text"}`}
                    >
                      {event.type.includes("BLOCK") ||
                      event.type.includes("REVISION") ? (
                        <ShieldX size={15} />
                      ) : (
                        <CheckCheck size={15} />
                      )}
                    </span>
                    <div>
                      <button onClick={() => setInspectId(event.bountyId)}>
                        {event.bountyId}
                      </button>
                      <p>{event.message}</p>
                    </div>
                    <time>
                      {new Date(event.createdAt).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">
                Audit and payment events will appear here.
              </p>
            )}
          </section>
          <aside className="policy-panel">
            <div className="section-heading">
              <h2>
                <ShieldCheck size={16} />
                Trust, with guardrails.
              </h2>
              <button
                className="icon-button"
                onClick={() => openModal({ kind: "guide" })}
                aria-label="Learn about release guardrails"
              >
                <CircleHelp size={16} />
              </button>
            </div>
            <p>
              The agent moves the money only when the evidence and the rules
              agree.
            </p>
            <dl>
              <div>
                <dt>Default auto-release</dt>
                <dd>
                  ≥ 90% <span>and</span> ≤ $50
                </dd>
              </div>
              <div>
                <dt>Above the threshold</dt>
                <dd>Maintainer approval</dd>
              </div>
              <div>
                <dt>Incomplete evidence</dt>
                <dd className="negative-text">Always blocked</dd>
              </div>
            </dl>
            <div className="policy-bottom">
              <LockKeyhole size={13} />
              Server-verified. Idempotent. Auditable.
            </div>
          </aside>
        </div>
        <footer className="page-footer">
          <span>
            <Globe2 size={14} />
            Built for builders, wherever they build.
          </span>
          <span>
            PayPal Sandbox <span>/</span> Custom AI <span>/</span> AG Grid
            Community
          </span>
        </footer>
      </main>

      {inspected && !modal && (
        <AuditInspector
          row={inspected}
          demo={mode === "demo"}
          busy={!!busy}
          onClose={() => setInspectId(null)}
          onFund={() => openModal({ kind: "fund", rowId: inspected.id })}
          onSubmit={() => openModal({ kind: "submit", rowId: inspected.id })}
          onAudit={() => void runAudit(inspected)}
          onRelease={() => release(inspected)}
          onSync={() =>
            void operate("Refreshing payout", async () => {
              await requestJson(
                `/api/paypal/payout/${inspected.payout!.id}/sync`,
                {},
              );
              await refresh();
            })
          }
        />
      )}
      {modal?.kind === "create" && (
        <Dialog
          title="Create a bounty"
          subtitle="Define the work and the proof before funding."
          onClose={() => !busy && setModal(null)}
        >
          <form className="form-stack" onSubmit={handleCreate}>
            <label>
              Task title
              <input
                name="title"
                required
                minLength={3}
                maxLength={160}
                placeholder="Fix duplicate webhook delivery"
              />
            </label>
            <label>
              Acceptance criteria
              <span className="field-help">
                One measurable criterion per line. These lock after funding.
              </span>
              <textarea
                name="criteria"
                required
                rows={4}
                placeholder={
                  "Deduplicate events using their provider event ID\nInclude tests for repeated and concurrent requests\nDocument the retry behavior"
                }
              />
            </label>
            <div className="form-columns">
              <label>
                Reward (USD)
                <input
                  name="reward"
                  inputMode="decimal"
                  required
                  pattern="[0-9]+(\.[0-9]{1,2})?"
                  defaultValue="35.00"
                />
              </label>
              <label>
                Auto-release up to (USD)
                <input
                  name="autoMaxReward"
                  inputMode="decimal"
                  required
                  pattern="[0-9]+(\.[0-9]{1,2})?"
                  defaultValue="50.00"
                />
              </label>
            </div>
            <label>
              Minimum score for auto-release
              <input
                name="autoMinScore"
                type="number"
                min="0"
                max="100"
                required
                defaultValue="90"
              />
            </label>
            {formError}
            <div className="form-actions">
              <span>
                {mode === "demo"
                  ? "Creates a browser-only demo bounty."
                  : "Creates an unfunded sandbox bounty."}
              </span>
              <button
                className="button primary"
                disabled={!!busy}
                type="submit"
              >
                {busy ? "Creating…" : "Create bounty"}
                <ArrowRight size={15} />
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {modal?.kind === "login" && (
        <Dialog
          title="Unlock Sandbox Connected"
          subtitle="Public judge demos never need credentials."
          onClose={() => !busy && setModal(null)}
        >
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void operate("Unlocking maintainer access", async () => {
                await requestJson("/api/auth/login", {
                  password: String(data.get("password")),
                });
                setAuthenticated(true);
                const [ledgerData, setup] = await Promise.all([
                  requestJson<{ rows: LedgerRow[] }>("/api/bounties"),
                  requestJson<{
                    paypalClientId: string | null;
                    missing: string[];
                  }>("/api/config"),
                ]);
                setConfig(setup);
                modeRef.current = "connected";
                setMode("connected");
                setRows(ledgerData.rows);
                setModal(null);
                setInspectId(null);
                setView("all");
                setSearch("");
              });
            }}
          >
            <div className="callout">
              <LockKeyhole size={19} />
              <p>
                Connected mode calls your custom LLM and PayPal Sandbox. Only
                the maintainer can fund tasks or approve releases.
              </p>
            </div>
            <label>
              Maintainer password
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="Configured in your server environment"
              />
            </label>
            <p className="small muted">
              Server setup: Neon connection, MAINTAINER_PASSWORD (16+
              characters), and SESSION_SECRET (32+ characters).
            </p>
            {formError}
            <button
              className="button primary full-width"
              disabled={!!busy}
              type="submit"
            >
              {busy ? "Unlocking…" : "Unlock connected workspace"}
              <ArrowRight size={16} />
            </button>
          </form>
        </Dialog>
      )}
      {modal?.kind === "submit" && modalRow && (
        <Dialog
          title="Submit deliverable"
          subtitle={`${modalRow.id} / ${modalRow.title}`}
          onClose={() => !busy && setModal(null)}
        >
          <form
            className="form-stack"
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
          >
            <label>
              PayPal Sandbox receiver email
              <input
                name="receiverEmail"
                type="email"
                required
                maxLength={127}
                defaultValue={modalRow.submission?.receiverEmail}
                placeholder="contributor@your-sandbox-account.com"
              />
            </label>
            <label>
              Deliverable evidence
              <span className="field-help">
                Paste a code diff, Markdown, tests, or structured text. A link
                alone cannot be verified.
              </span>
              <textarea
                name="deliverable"
                required
                minLength={20}
                maxLength={80000}
                rows={9}
                defaultValue={modalRow.submission?.deliverable}
                placeholder="Implementation diff, regression tests, and verification notes…"
              />
            </label>
            {mode === "demo" && (
              <p className="small warning-text">
                Demo audits replay fixture verdicts. Use Sandbox Connected to
                evaluate this evidence with your custom LLM.
              </p>
            )}
            {formError}
            <button className="button primary" type="submit" disabled={!!busy}>
              Save submission
              <ArrowRight size={15} />
            </button>
          </form>
        </Dialog>
      )}
      {modal?.kind === "fund" && modalRow && (
        <Dialog
          title="Fund bounty"
          subtitle={`${modalRow.id} / PayPal Sandbox Checkout`}
          onClose={() => !busy && setModal(null)}
        >
          <div className="form-stack">
            <div className="checkout-summary">
              <span>{modalRow.title}</span>
              <strong>
                {usd(modalRow.rewardCents)}
                <small>USD</small>
              </strong>
            </div>
            <p className="small muted">
              The server verifies the capture before reserving funds. This is an
              application ledger reserve in a sandbox merchant account.
            </p>
            {mode === "demo" ? (
              <>
                <div className="callout">
                  <Info size={18} />
                  <p>
                    Judge simulation. This button records a simulated capture
                    without contacting PayPal.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => {
                    replaceRow({
                      ...modalRow,
                      funding: {
                        status: "COMPLETED",
                        orderId: `SIM-ORDER-${modalRow.id}`,
                        captureId: `SIM-CAPTURE-${modalRow.id}`,
                        amountCents: modalRow.rewardCents,
                      },
                      events: [
                        ...modalRow.events,
                        demoEvent(
                          "DEMO_FUNDED",
                          "Simulated capture verified. Demo funds reserved.",
                        ),
                      ],
                    });
                    setModal(null);
                    setInspectId(modalRow.id);
                  }}
                >
                  Simulate funding {usd(modalRow.rewardCents)}
                </button>
              </>
            ) : config?.paypalClientId ? (
              <PayPalScriptProvider
                options={{
                  clientId: config.paypalClientId,
                  currency: "USD",
                  intent: "capture",
                }}
              >
                <PayPalButtons
                  style={{ layout: "vertical", shape: "rect", label: "pay" }}
                  createOrder={async () =>
                    (
                      await requestJson<{ orderId: string }>(
                        "/api/paypal/orders",
                        { bountyId: modalRow.id },
                      )
                    ).orderId
                  }
                  onApprove={async (data) => {
                    await operate("Verifying capture", async () => {
                      await requestJson(
                        `/api/paypal/orders/${data.orderID}/capture`,
                        {},
                      );
                      await refresh();
                      setModal(null);
                      setInspectId(modalRow.id);
                      setNotice({
                        tone: "success",
                        text: "PayPal Sandbox capture verified. Bounty funded.",
                      });
                    });
                  }}
                  onCancel={() =>
                    setNotice({
                      tone: "info",
                      text: "Checkout canceled. No funding has been recorded.",
                    })
                  }
                  onError={() =>
                    setNotice({
                      tone: "error",
                      text: "PayPal Checkout could not complete. Check your sandbox credentials and retry. No funding has been assumed.",
                    })
                  }
                />
              </PayPalScriptProvider>
            ) : (
              <p className="form-error">
                Configure PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET on the
                server to enable checkout.
              </p>
            )}
            {notice && (
              <p
                className={
                  notice.tone === "error" ? "form-error" : "small muted"
                }
                role="status"
              >
                {notice.text}
              </p>
            )}
          </div>
        </Dialog>
      )}
      {modal?.kind === "release" && modalRow && (
        <Dialog
          title="Approve reward release"
          subtitle="Your approval is recorded in the audit trail."
          onClose={() => !busy && setModal(null)}
        >
          <div className="form-stack">
            <div className="checkout-summary">
              <span>{modalRow.title}</span>
              <strong>
                {usd(modalRow.rewardCents)}
                <small>USD</small>
              </strong>
            </div>
            <div className="release-details">
              <p>
                <span>Receiver</span>
                <strong>{modalRow.submission?.receiverEmail}</strong>
              </p>
              <p>
                <span>AI verification</span>
                <strong>
                  {modalRow.audit?.verdict?.score}% / all criteria passed
                </strong>
              </p>
              <p>
                <span>Settlement</span>
                <strong>
                  {mode === "demo"
                    ? "Simulated receipt"
                    : "PayPal Sandbox Payouts"}
                </strong>
              </p>
            </div>
            <div className="callout">
              <ShieldCheck size={19} />
              <p>
                {mode === "demo"
                  ? "This creates a clearly labeled simulation receipt. No funds are sent."
                  : "The server rechecks funding, the latest audit, and the recipient before submitting one idempotent payout."}
              </p>
            </div>
            {formError}
            <button
              className="button primary full-width"
              onClick={approveRelease}
              disabled={!!busy || rowRelease(modalRow) === "BLOCKED"}
            >
              {busy
                ? "Submitting release…"
                : `Approve release ${usd(modalRow.rewardCents)}`}
              <ArrowUpRight size={16} />
            </button>
          </div>
        </Dialog>
      )}
      {modal?.kind === "reset" && (
        <Dialog
          title="Reset judge demo?"
          subtitle="Restore the original seeded scenarios in this browser."
          onClose={() => setModal(null)}
        >
          <div className="form-stack">
            <p>
              Your browser’s demo bounties and simulation receipts will be
              replaced. The connected sandbox ledger is unaffected.
            </p>
            <div className="form-actions">
              <button className="button" onClick={() => setModal(null)}>
                Keep demo
              </button>
              <button
                className="button primary"
                onClick={() => {
                  setRows(createDemoRows());
                  setModal(null);
                  setInspectId(null);
                  setView("all");
                  setSearch("");
                  setNotice({
                    tone: "info",
                    text: "Judge demo reset. Pick a scenario to begin.",
                  });
                }}
              >
                Reset demo
                <RotateCcw size={15} />
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {modal?.kind === "guide" && (
        <Dialog
          title="From proof to payout"
          subtitle="An autonomous workflow with explicit financial guardrails."
          onClose={() => setModal(null)}
        >
          <div className="guide-steps">
            <section>
              <span>01</span>
              <div>
                <h3>Define and fund</h3>
                <p>
                  Create measurable criteria and a USD reward. PayPal Sandbox
                  Checkout captures the funding; the server verifies every
                  amount and bounty reference.
                </p>
              </div>
            </section>
            <section>
              <span>02</span>
              <div>
                <h3>Evaluate and challenge</h3>
                <p>
                  Your custom OpenAI-compatible model evaluates pasted evidence,
                  then performs an adversarial review. Every criterion needs
                  proof. Failed or invalid audits block payments.
                </p>
              </div>
            </section>
            <section>
              <span>03</span>
              <div>
                <h3>Apply the release policy</h3>
                <p>
                  Approved work at ≥ 90% and ≤ $50 releases automatically by
                  default. Other approved work requires a maintainer click.
                  PayPal item-level success is required before showing settled.
                </p>
              </div>
            </section>
            <section>
              <span>04</span>
              <div>
                <h3>Keep an honest ledger</h3>
                <p>
                  AG Grid exposes audits, scores, policy decisions, and
                  receipts. Demo presets and payout-permission fallbacks are
                  labeled simulations and never counted as real payouts.
                </p>
              </div>
            </section>
          </div>
          <p className="small muted">
            M1 evaluates supplied text evidence. It does not execute code,
            browse submission links, or provide regulated escrow.
          </p>
        </Dialog>
      )}
    </div>
  );
}
