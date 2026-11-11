import { api, readBody } from "@/lib/api";
import { studioTurn, studioTurnSchema } from "@/lib/studio-agent";
export const runtime="nodejs";
export const maxDuration=120;
export const POST=api(async request=>{
  const events=await studioTurn(request,await readBody(request,studioTurnSchema));
  return new Response(events.map(event=>JSON.stringify(event)).join("\n")+"\n",{headers:{"Content-Type":"application/x-ndjson","Cache-Control":"no-store"}});
},"viewer");
