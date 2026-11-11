import { api } from "@/lib/api";
import { analyticsSnapshot, overviewSummary } from "@/lib/analytics-server";
import { AppError } from "@/lib/errors";
import { analyticsFromLedger } from "@/lib/analytics";
import { createDemoRows } from "@/lib/demo";
import { requireViewer } from "@/lib/auth";
export const runtime="nodejs";
export const GET=api(async request=>{
  const params=new URL(request.url).searchParams;
  if(params.get("summary")==="1")return overviewSummary();
  const to=params.get("to")?new Date(params.get("to")!):new Date();
  const from=params.get("from")?new Date(params.get("from")!):new Date(to.getTime()-90*86400000);
  if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>to)throw new AppError(400,"Choose a valid creation-date range.");
  if(params.get("mode")==="demo")return analyticsFromLedger(createDemoRows(),true,{from,to});
  return analyticsSnapshot(from,to,requireViewer(request).role);
},"viewer");
