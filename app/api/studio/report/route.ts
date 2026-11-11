import { z } from "zod";
import { api, readBody } from "@/lib/api";
import { requireMaintainer } from "@/lib/auth";
import { db, json } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { reportStateSchema } from "@/lib/studio-report";
export const runtime="nodejs";
export const GET=api(async()=>{
  const report=await db().savedDashboard.findUnique({where:{id:"workspace"}});
  return {state:report?.state??null,version:report?.version??0};
},"viewer");
export const PUT=api(async request=>{
  requireMaintainer(request);
  const {state,version}=await readBody(request,z.object({state:reportStateSchema,version:z.number().int().min(0)}).strict());
  if(version===0){
    try{const report=await db().savedDashboard.create({data:{id:"workspace",state:json(state)}});return {state:report.state,version:report.version};}
    catch(error){if(error&&typeof error==="object"&&"code" in error&&error.code==="P2002")throw new AppError(409,"A dashboard was saved elsewhere. Reload before saving.","REPORT_CONFLICT");throw error;}
  }
  const changed=await db().savedDashboard.updateMany({where:{id:"workspace",version},data:{state:json(state),version:{increment:1}}});
  if(!changed.count)throw new AppError(409,"The dashboard changed in another session. Reload before saving.","REPORT_CONFLICT");
  return {state,version:version+1};
});
