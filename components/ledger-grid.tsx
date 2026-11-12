"use client";
import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type GridApi,
  type ICellRendererParams,
} from "ag-grid-community";
import { ArrowUpRight, ScanLine } from "lucide-react";
import type { LedgerRow } from "@/lib/types";
import {
  rowRelease,
  rowStatus,
  safeCsvValue,
  statusLabel,
  usd,
} from "@/lib/policy";

ModuleRegistry.registerModules([AllCommunityModule]);
const gridTheme = themeQuartz.withParams({
  browserColorScheme: "light",
  backgroundColor: "var(--color-paper)",
  foregroundColor: "var(--color-ink-2)",
  headerBackgroundColor: "var(--color-paper-2)",
  headerTextColor: "var(--color-muted)",
  borderColor: "var(--color-rule)",
  rowBorder: { color: "var(--color-rule)", width: 1 },
  accentColor: "var(--color-accent)",
  fontFamily: "var(--font-body)",
  fontSize: 13,
  headerFontSize: 12,
  headerFontWeight: 500,
  spacing: 8,
  wrapperBorderRadius: 0,
  rowHoverColor: "var(--color-hover)",
  selectedRowBackgroundColor: "var(--color-accent-soft)",
});
export function StatusBadge({ status }: { status: string }) {
  const tone = [
    "SETTLED",
    "SUCCESS",
    "FUNDED",
    "COMPLETED",
    "APPROVED",
  ].includes(status)
    ? "positive"
    : [
          "REVISION_REQUIRED",
          "FAILED",
          "AUDIT_FAILED",
          "DENIED",
          "RETURNED",
          "BLOCKED",
          "REVERSED",
        ].includes(status)
      ? "negative"
      : ["AWAITING_APPROVAL", "UNKNOWN", "ONHOLD", "FUNDING_HOLD", "HOLD", "REFUNDED", "PARTIALLY_REFUNDED", "UNCLAIMED"].includes(status)
        ? "warning"
        : [
              "AUDITING",
              "SIMULATED",
              "SUBMITTED",
              "PENDING",
              "REQUESTED",
              "PROCESSING",
            ].includes(status)
          ? "cool"
          : "neutral";
  return <span className={`status-badge ${tone}`}>{statusLabel(status)}</span>;
}
export function LedgerGrid({
  rows,
  search,
  busy,
  readOnly = false,
  onInspect,
  onRelease,
  onReady,
}: {
  rows: LedgerRow[];
  search: string;
  busy: boolean;
  readOnly?: boolean;
  onInspect: (row: LedgerRow) => void;
  onRelease: (row: LedgerRow) => void;
  onReady: (api: GridApi<LedgerRow>) => void;
}) {
  const columns = useMemo<ColDef<LedgerRow>[]>(
    () => [
      {
        field: "id",
        headerName: "Bounty ID",
        width: 110,
        pinned: "left",
        cellClass: "id-cell",
      },
      {
        field: "title",
        headerName: "Task",
        width: 270,
        minWidth: 210,
        pinned: "left",
        cellClass: "task-cell",
        cellRenderer: (p: ICellRendererParams<LedgerRow>) => (
          <button
            className="task-link"
            onClick={() => p.data && onInspect(p.data)}
            title={p.value}
          >
            {p.value}
          </button>
        ),
      },
      {
        colId: "contributor",
        headerName: "Contributor",
        width: 205,
        valueGetter: (p) => p.data?.submission?.receiverEmail ?? "Unassigned",
      },
      {
        field: "rewardCents",
        headerName: "Reward",
        width: 110,
        filter: "agNumberColumnFilter",
        valueFormatter: (p) => usd(p.value ?? 0),
        cellClass: "money-cell",
        type: "numericColumn",
      },
      {
        colId: "score",
        headerName: "AI audit score",
        width: 145,
        filter: "agNumberColumnFilter",
        valueGetter: (p) => p.data?.audit?.verdict?.score ?? null,
        cellRenderer: (p: ICellRendererParams<LedgerRow, number | null>) =>
          p.value == null ? (
            <span className="muted">
              {p.data?.audit?.status === "RUNNING"
                ? "Verifying…"
                : "Not audited"}
            </span>
          ) : (
            <div
              className={`score-cell ${p.data?.audit?.verdict?.status === "REVISION_REQUIRED" ? "rejected" : ""}`}
            >
              <span className="score-track">
                <span style={{ transform: `scaleX(${p.value / 100})` }} />
              </span>
              <span>
                {p.value}
                <span className="muted">/100</span>
              </span>
            </div>
          ),
      },
      {
        colId: "criteria",
        headerName: "Criteria",
        width: 95,
        valueGetter: (p) =>
          p.data?.audit?.verdict
            ? `${p.data.audit.verdict.criteriaBreakdown.filter((v) => v.passed).length}/${p.data.criteria.length}`
            : "—",
        cellClass: "measured",
      },
      {
        colId: "status",
        headerName: "Settlement",
        width: 175,
        valueGetter: (p) => (p.data ? rowStatus(p.data) : ""),
        cellRenderer: (p: ICellRendererParams<LedgerRow, string>) => (
          <StatusBadge status={p.value ?? "UNFUNDED"} />
        ),
      },
      {
        colId: "mode",
        headerName: "Release mode",
        width: 140,
        valueGetter: (p) =>
          p.data?.payout?.settlementMode === "AUTO" ||
          (p.data && rowRelease(p.data) === "AUTO")
            ? "Auto-agent"
            : "Human-gated",
      },
      {
        colId: "funding",
        headerName: "Funding",
        width: 125,
        valueGetter: (p) => p.data?.funding?.status ?? "UNFUNDED",
        cellRenderer: (p: ICellRendererParams<LedgerRow, string>) => (
          <StatusBadge
            status={
              p.value === "COMPLETED" ? "FUNDED" : (p.value ?? "UNFUNDED")
            }
          />
        ),
      },
      {
        colId: "transaction",
        headerName: "PayPal transaction ID",
        width: 220,
        valueGetter: (p) => p.data?.payout?.transactionId ?? "—",
        cellClass: "id-cell",
      },
      {
        colId: "actions",
        headerName: "Actions",
        width: 110,
        pinned: "right",
        sortable: false,
        filter: false,
        cellRenderer: (p: ICellRendererParams<LedgerRow>) => (
          <div className="row-actions">
            <button
              className="icon-button"
              onClick={() => p.data && onInspect(p.data)}
              aria-label={`Inspect audit for ${p.data?.id}`}
              title="Inspect audit"
            >
              <ScanLine size={17} />
            </button>
            {!readOnly && p.data && !p.data.payout && rowRelease(p.data) !== "BLOCKED" && (
              <button
                className="icon-button release-action"
                disabled={busy}
                onClick={() => p.data && onRelease(p.data)}
                aria-label={`Release reward for ${p.data.id}`}
                title="Release reward"
              >
                <ArrowUpRight size={17} />
              </button>
            )}
          </div>
        ),
      },
    ],
    [onInspect, onRelease, busy, readOnly],
  );
  return (
    <div className="grid-frame" aria-label="Bounty financial and agent ledger">
      <AgGridReact<LedgerRow>
        theme={gridTheme}
        rowData={rows}
        columnDefs={columns}
        defaultColDef={{
          sortable: true,
          filter: "agTextColumnFilter",
          resizable: true,
        }}
        getRowId={(p) => p.data.id}
        rowHeight={61}
        headerHeight={45}
        quickFilterText={search}
        pagination
        paginationPageSize={8}
        paginationPageSizeSelector={[8, 20, 50]}
        suppressCellFocus={false}
        enableCellTextSelection
        animateRows={false}
        suppressDragLeaveHidesColumns
        overlayNoRowsTemplate='<span class="grid-empty">No bounties match this view. Clear filters or create a bounty.</span>'
        onGridReady={(event) => onReady(event.api)}
        onGridSizeChanged={(event) =>
          event.api.applyColumnState({
            state: [
              {
                colId: "id",
                pinned: event.clientWidth >= 1000 ? "left" : null,
              },
              {
                colId: "title",
                pinned: event.clientWidth >= 1000 ? "left" : null,
              },
              { colId: "actions", pinned: "right" },
            ],
          })
        }
        defaultCsvExportParams={{
          fileName: "bountyguard-ledger.csv",
          columnKeys: [
            "id",
            "title",
            "contributor",
            "rewardCents",
            "score",
            "criteria",
            "status",
            "mode",
            "funding",
            "transaction",
          ],
          processCellCallback: (p) =>
            safeCsvValue(
              p.column.getColId() === "rewardCents"
                ? usd(Number(p.value))
                : p.value,
            ),
        }}
      />
    </div>
  );
}
