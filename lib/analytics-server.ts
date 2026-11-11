import { db } from "./db";
import { AppError } from "./errors";
import { ledgerInclude, toLedgerRow } from "./ledger";
import { analyticsFromLedger, analyticsForRole, summaryFromSources } from "./analytics";
import { verdictSchema } from "./validation";
import type { AnalyticsSnapshot } from "./analytics-types";
import type { SessionRole } from "./types";

export async function overviewSummary() {
  const [funding,payout,autonomous,average,count,latest,blocked] = await Promise.all([
    db().funding.aggregate({where:{captureId:{not:null}},_sum:{amountCents:true}}),
    db().payout.aggregate({where:{status:"SUCCESS",provider:"PAYPAL_SANDBOX"},_sum:{amountCents:true}}),
    db().payout.count({where:{status:"SUCCESS",provider:"PAYPAL_SANDBOX",settlementMode:"AUTO"}}),
    db().auditRun.aggregate({where:{status:"COMPLETED"},_avg:{durationMs:true}}),
    db().bounty.count(),
    db().auditRun.findMany({where:{status:"COMPLETED"},distinct:["submissionId"],orderBy:{createdAt:"desc"},select:{verdict:true}}),
    db().bounty.findMany({where:{funding:{status:"COMPLETED"},currentSubmissionId:{not:null}},select:{rewardCents:true,currentSubmission:{select:{audits:{where:{status:"COMPLETED"},orderBy:{createdAt:"desc"},take:1,select:{verdict:true}}}}}}),
  ]);
  const rejected=(value:unknown)=>verdictSchema.safeParse(value).data?.status==="REVISION_REQUIRED";
  return {asOf:new Date().toISOString(),summary:{fundedCents:funding._sum.amountCents??0,settledCents:payout._sum.amountCents??0,autonomousPayouts:autonomous,averageMs:average._avg.durationMs===null?null:Math.round(average._avg.durationMs),prevented:latest.filter(row=>rejected(row.verdict)).length,blockedCents:blocked.filter(row=>rejected(row.currentSubmission?.audits[0]?.verdict)).reduce((sum,row)=>sum+row.rewardCents,0),bountyCount:count}};
}

export async function analyticsSnapshot(from:Date,to:Date,role:SessionRole="maintainer"):Promise<AnalyticsSnapshot> {
  return db().$transaction(async tx=>{
    const bounties=await tx.bounty.findMany({where:{createdAt:{gte:from,lte:to}},include:ledgerInclude,orderBy:{createdAt:"asc"},take:5001});
    if(bounties.length>5000)throw new AppError(422,"More than 5,000 bounties. Select a narrower creation-date range.","ANALYTICS_RANGE_TOO_WIDE");
    const ids=bounties.map(row=>row.id);
    const [audits,events]=await Promise.all([
      tx.auditRun.findMany({where:{submission:{bountyId:{in:ids}}},include:{submission:{select:{bountyId:true}}},orderBy:{createdAt:"asc"},take:5001}),
      tx.ledgerEvent.findMany({where:{bountyId:{in:ids}},orderBy:{createdAt:"asc"},take:5001}),
    ]);
    if(audits.length>5000||events.length>5000)throw new AppError(422,"A source exceeds 5,000 records. Select a narrower creation-date range.","ANALYTICS_RANGE_TOO_WIDE");
    const snapshot=analyticsFromLedger(bounties.map(toLedgerRow));
    snapshot.range={from:from.toISOString(),to:to.toISOString()};
    const parsedAudits=audits.map(audit=>({audit,verdict:verdictSchema.safeParse(audit.verdict).data}));
    const latestCompleted=new Map(parsedAudits.filter(({audit})=>audit.status==="COMPLETED").map(({audit})=>[audit.submissionId,audit.id]));
    snapshot.sources.audits=parsedAudits.map(({audit:a,verdict})=>({id:a.id,bountyId:a.submission.bountyId,submissionId:a.submissionId,status:a.status,verdict:verdict?.status??"",score:verdict?.score??null,durationMs:a.durationMs,model:a.model,createdAt:(a.completedAt??a.createdAt).toISOString()}));
    snapshot.sources.criteria=parsedAudits.flatMap(({audit:a,verdict})=>(verdict?.criteriaBreakdown??[]).map(c=>({id:`${a.id}:${c.criterionId}`,bountyId:a.submission.bountyId,auditId:a.id,submissionId:a.submissionId,criterionId:c.criterionId,passed:c.passed,result:c.passed?"Passed":"Failed",rejectedSubmissionCount:latestCompleted.get(a.submissionId)===a.id&&verdict?.status==="REVISION_REQUIRED"&&!c.passed?1:0,feedback:c.feedback})));
    snapshot.sources.events=events.map(e=>({id:e.id,bountyId:e.bountyId,type:e.type,message:e.message,createdAt:e.createdAt.toISOString()}));
    if(snapshot.sources.criteria.length>5000)throw new AppError(422,"More than 5,000 criterion results. Select a narrower creation-date range.","ANALYTICS_RANGE_TOO_WIDE");
    snapshot.summary=summaryFromSources(snapshot.sources);
    return analyticsForRole(snapshot,role);
  },{isolationLevel:"RepeatableRead",timeout:20000});
}
