import type { AgPanelConfig } from "ag-studio";
export type StudioPanelSelection = {
    left: "data" | "edit" | null;
    right: "ai" | "filters" | null;
};
export type StudioPanelId = "data" | "edit" | "ai" | "filters";
export const defaultStudioPanels = (mobile: boolean): StudioPanelSelection => ({ left: null, right: mobile ? null : "ai" });
export function toggleStudioPanel(current: StudioPanelSelection, panel: StudioPanelId, mobile: boolean): StudioPanelSelection {
    if (panel === "data" || panel === "edit")
        return { left: current.left === panel ? null : panel, right: mobile ? null : current.right };
    return { left: mobile ? null : current.left, right: current.right === panel ? null : panel };
}
export function studioPanelConfig(selection: StudioPanelSelection): AgPanelConfig {
    return { edit: { left: selection.left ? [selection.left] : [], right: selection.right ? [selection.right] : [] }, view: { left: [], right: selection.right === "filters" ? ["filters"] : [] } };
}
