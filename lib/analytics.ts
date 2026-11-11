import type { AnalyticsRecord, AnalyticsSnapshot } from "./analytics-types";
import type { LedgerRow, SessionRole } from "./types";
import { rowRelease, rowStatus } from "./policy";

export function analyticsFromLedger(rows: LedgerRow[], demo = false, range?: { from: Date; to: Date }): AnalyticsSnapshot {
  if(range) rows=rows.filter(row=>new Date(row.createdAt)>=range.from&&new Date(row.createdAt)<=range.to);
  const sources: AnalyticsSnapshot["sources"] = {bounties:[],audits:[],criteria:[],funding:[],payouts:[],events:[]};
  for (const row of rows) {
    const verdict=row.audit?.verdict;
    const funded=row.funding?.status==="COMPLETED";
    const captured=funded||!!row.funding?.captureId;
    const settled=row.payout?.status==="SUCCESS" && row.payout.provider==="PAYPAL_SANDBOX";
    const simulated=demo && row.payout?.status==="SIMULATED";
    const failed=verdict?.criteriaBreakdown.filter(item=>!item.passed).map(item=>item.criterionId)??[];
    sources.bounties.push({id:row.id,bountyId:row.id,title:row.title,rewardCents:row.rewardCents,rewardUsd:row.rewardCents/100,createdAt:row.createdAt,status:rowStatus(row),releaseMode:rowRelease(row),auditScore:verdict?.score??null,criteriaPassed:verdict?.criteriaBreakdown.filter(item=>item.passed).length??0,criteriaTotal:row.criteria.length,failedCriteria:failed.join(", "),country:row.submission?.contributorCountry??"Not provided",sourceKind:row.submission?.sourceKind??"TEXT",headSha:row.submission?.evidence?.headSha??null,fundedCents:captured?row.funding!.amountCents:0,fundedUsd:captured?row.funding!.amountCents/100:0,payoutCents:settled||simulated?row.rewardCents:0,payoutUsd:settled||simulated?row.rewardCents/100:0,blockedCents:funded&&verdict?.status==="REVISION_REQUIRED"?row.rewardCents:0,blockedUsd:funded&&verdict?.status==="REVISION_REQUIRED"?row.rewardCents/100:0,durationMs:row.audit?.durationMs??null,autoMinScore:row.autoMinScore,autoMaxCents:row.autoMaxCents,funded,approved:verdict?.status==="APPROVED",riskCount:verdict?.riskFlags.length??0});
    if(row.audit) sources.audits.push({id:row.audit.id,bountyId:row.id,submissionId:row.submission?.id??"",status:row.audit.status,verdict:verdict?.status??"",score:verdict?.score??null,durationMs:row.audit.durationMs,createdAt:row.audit.completedAt??row.createdAt,model:row.audit.model});
    for(const item of verdict?.criteriaBreakdown??[]) sources.criteria.push({id:`${row.audit!.id}:${item.criterionId}`,bountyId:row.id,auditId:row.audit!.id,submissionId:row.submission?.id??"",criterionId:item.criterionId,passed:item.passed,result:item.passed?"Passed":"Failed",rejectedSubmissionCount:verdict?.status==="REVISION_REQUIRED"&&!item.passed?1:0,feedback:item.feedback});
    if(row.funding) sources.funding.push({id:row.funding.orderId??`fund-${row.id}`,bountyId:row.id,status:row.funding.status,amountCents:row.funding.amountCents,amountUsd:row.funding.amountCents/100,orderId:row.funding.orderId,captureId:row.funding.captureId,createdAt:row.createdAt});
    if(row.payout) sources.payouts.push({id:row.payout.id,bountyId:row.id,status:row.payout.status,provider:row.payout.provider,settlementMode:row.payout.settlementMode,amountCents:row.rewardCents,amountUsd:row.rewardCents/100,batchId:row.payout.batchId,transactionId:row.payout.transactionId,createdAt:row.createdAt});
    for(const event of row.events) sources.events.push({id:event.id,bountyId:row.id,type:event.type,message:event.message,createdAt:event.createdAt});
  }
  return {asOf:new Date().toISOString(),range:{from:range?.from.toISOString()??null,to:range?.to.toISOString()??null},sources,summary:summaryFromSources(sources,demo)};
}

export function analyticsForRole(snapshot: AnalyticsSnapshot, role: SessionRole): AnalyticsSnapshot {
  if(role!=="judge") return snapshot;
  return {...snapshot,sources:{...snapshot.sources,
    criteria:snapshot.sources.criteria.map(row=>({...row,feedback:"Maintainer-only audit feedback."})),
    events:snapshot.sources.events.map(row=>({...row,message:"Maintainer-only event details."})),
  }};
}

export function summaryFromSources(sources: AnalyticsSnapshot["sources"], demo=false): AnalyticsSnapshot["summary"] {
  const sum=(rows:AnalyticsRecord[],key:string)=>rows.reduce((total,row)=>total+(typeof row[key]==="number"?row[key] as number:0),0);
  const completed=sources.audits.filter(row=>row.status==="COMPLETED"&&typeof row.durationMs==="number");
  const latest=new Map<string,AnalyticsRecord>();
  for(const row of sources.audits) if(row.status==="COMPLETED") {
    const key=String(row.submissionId||row.bountyId);const previous=latest.get(key);
    if(!previous||String(row.createdAt)>String(previous.createdAt))latest.set(key,row);
  }
  const actual=sources.payouts.filter(row=>row.status==="SUCCESS"&&row.provider==="PAYPAL_SANDBOX"||demo&&row.status==="SIMULATED");
  return {fundedCents:sum(sources.funding.filter(row=>row.status==="COMPLETED"||!!row.captureId),"amountCents"),settledCents:sum(actual,"amountCents"),autonomousPayouts:actual.filter(row=>row.settlementMode==="AUTO").length,averageMs:completed.length?Math.round(sum(completed,"durationMs")/completed.length):null,prevented:[...latest.values()].filter(row=>row.verdict==="REVISION_REQUIRED").length,blockedCents:sum(sources.bounties,"blockedCents"),bountyCount:sources.bounties.length};
}
