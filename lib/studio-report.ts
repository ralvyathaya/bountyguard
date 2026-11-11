import { z } from "zod";
import { STUDIO_WIDGET_TYPES } from "./studio-tools";

export const reportStateSchema = z.object({
  pages:z.array(z.object({
    id:z.string().min(1).max(128),
    widgets:z.record(z.string(),z.object({type:z.enum(STUDIO_WIDGET_TYPES)}).passthrough()).refine(widgets=>Object.keys(widgets).length<=80,"A page supports at most 80 widgets."),
  }).passthrough()).min(1).max(12),
}).passthrough().superRefine((state,ctx)=>{
  const visit=(value:unknown,depth:number):boolean=>{
    if(depth>30)return false;
    if(typeof value==="string")return value.length<=16000;
    if(value===null||typeof value==="boolean"||typeof value==="number")return typeof value!=="number"||Number.isFinite(value);
    if(Array.isArray(value))return value.length<=2000&&value.every(item=>visit(item,depth+1));
    if(typeof value!=="object")return false;
    return Object.entries(value).every(([key,item])=>!["__proto__","prototype","constructor","access_token","apiKey","clientSecret","sources","rows"].includes(key)&&visit(item,depth+1));
  };
  if(!visit(state,0))ctx.addIssue({code:"custom",message:"Report contains unsupported content. Save layout and widget configuration only."});
});
