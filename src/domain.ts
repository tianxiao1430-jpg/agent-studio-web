import data from './data/demo-data.json';
import type { Draft, State, Snapshot, Run, Span, Issue, AgentConfig } from './types';
export const fixture = data;
export const clone = <T,>(value:T):T => structuredClone(value);
export const uid = (prefix:string) => `${prefix}-${crypto.randomUUID().slice(0,8)}`;
export const STORAGE_KEY = 'agent-studio-web.v1';
export function seedDraft(version='team-v2-candidate'):Draft {
 const v=fixture.team_versions.find(v=>v.id===version)||fixture.team_versions[1];
 const req=fixture.teams[0].requirements;
 const positions:Record<string,{x:number;y:number}>={ 'node-input':{x:70,y:0},'node-researcher':{x:70,y:170},'node-verifier':{x:70,y:340},'node-evidence-gate':{x:380,y:340},'node-writer':{x:380,y:170},'node-output':{x:380,y:0},'node-human':{x:690,y:340} };
 const configs:Record<string,AgentConfig>={};
 for(const [id,versionId] of Object.entries(v.member_versions))configs[id]=clone(fixture.agent_versions.find(a=>a.id===versionId)!.config) as unknown as AgentConfig;
 return {id:uid('draft'),name:fixture.teams[0].name,sourceVersion:v.id,nodes:v.nodes.map(n=>({...n,position:positions[n.id]||n.position})),edges:v.edges.map(e=>({...clone(e),mapping:Object.fromEntries(Object.entries(e.mapping).filter((pair):pair is [string,string]=>typeof pair[1]==='string'))})),configs,
 requirements:{purpose:req.purpose,audience:req.audience,scope:`负责：${req.in_scope.join('、')}\n不负责：${req.out_of_scope.join('、')}`,input:'task：研究问题（必填）\nsources：参考链接（可选）\nlanguage：中文 / 英文 / 日文',actions:'读取公开文档和提供的附件；只写入本地草稿，不执行外部发布。',output:'Markdown 研究简报 + 证据 JSON。包含结论、证据、不确定性和来源。',acceptance:req.acceptance.map(a=>a.condition).join('\n'),failure:'证据不足补查一次；仍不足转人工。预算耗尽停止并交付已有结果。'},
 budget:{maxSeconds:v.budget.max_seconds,maxCost:v.budget.max_cost_usd,maxReturns:v.budget.max_team_returns,concurrency:v.budget.max_concurrency},viewport:{x:0,y:0,zoom:1}};
}
export function createSnapshot(draft:Draft):Snapshot {return {id:uid('version'),name:draft.name,createdAt:new Date().toISOString(),draft:clone(draft)}}
export function initialState():State {
 const draft=seedDraft();
 return {schemaVersion:1,draft,savedDraft:clone(draft),savedAt:null,versions:fixture.team_versions.map(v=>({id:v.id,name:v.id==='team-v1'?'基线 v1':'候选 v2',createdAt:'2026-09-20T00:00:00Z',draft:seedDraft(v.id)})),defaultVersion:'team-v1',runs:clone(fixture.runs),customCases:[],manualReviews:[]};
}
export function validateState(value:unknown):value is State {
 // Imported JSON is untrusted. Validate every nested field read by the UI before
 // accepting it; semantic configuration errors remain editable via checkDraft.
 type RecordValue=Record<string,unknown>;
 const record=(v:unknown):v is RecordValue=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const string=(v:unknown):v is string=>typeof v==='string';
 const number=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
 const boolean=(v:unknown):v is boolean=>typeof v==='boolean';
 const nullableString=(v:unknown)=>v===null||string(v);
 const nullableNumber=(v:unknown)=>v===null||number(v);
 const list=(v:unknown,test:(item:unknown)=>boolean):v is unknown[]=>Array.isArray(v)&&v.every(test);
 const strings=(v:unknown)=>list(v,string);
 const fields=(v:unknown,keys:string[],test:(item:unknown)=>boolean)=>record(v)&&keys.every(k=>test(v[k]));
 const optional=(v:RecordValue,key:string,test:(item:unknown)=>boolean)=>v[key]===undefined||test(v[key]);
 const stringMap=(v:unknown)=>record(v)&&Object.values(v).every(string);
 const identified=(v:unknown):v is RecordValue=>record(v)&&string(v.id)&&v.id.length>0;
 const uniqueIds=(v:unknown[])=>new Set(v.map(x=>(x as RecordValue).id)).size===v.length;
 const input=(v:unknown)=>record(v)&&optional(v,'task',string);
 function config(v:unknown):boolean {
  if(!record(v))return false;
  const i=v.input,g=v.guardrails,k=v.grounding,p=v.instructions,c=v.context,m=v.model,t=v.tools,l=v.loop,o=v.output;
  return record(i)&&strings(i.required_fields)&&strings(i.normalization)&&string(i.missing_fields)&&stringMap(i.fields)
   &&fields(g,['input','tool_arguments','tool_results','output','on_failure'],string)
   &&record(k)&&strings(k.source_ids)&&fields(k,['retrieval','rerank','on_insufficient_evidence'],string)&&number(k.freshness_days)&&boolean(k.require_citations)
   &&record(p)&&fields(p,['system','task_template'],string)&&strings(p.skill_ids)&&boolean(p.effective_preview_available)
   &&record(c)&&fields(c,['history','compression','private_memory','shared_memory'],string)&&number(c.budget_tokens)&&strings(c.shared_write_scope)
   &&record(m)&&fields(m,['provider_id','model_id','capabilities_source','connection_status'],string)&&nullableString(m.reasoning_effort)&&nullableNumber(m.temperature)&&nullableString(m.fallback_model_id)&&strings(m.unsupported_parameters)&&fields(m,['max_output_tokens','timeout_seconds'],number)
   &&record(t)&&strings(t.allowed_ids)&&string(t.approval)&&fields(t,['retry_count','default_timeout_seconds'],number)
   &&record(l)&&fields(l,['strategy','continue_when','stop_when'],string)&&fields(l,['max_steps','timeout_seconds','cost_limit_usd','no_progress_limit'],number)&&boolean(l.observable_only)
   &&record(o)&&fields(o,['format','content_validation','repair_action','on_exhausted'],string)&&strings(o.fields)&&boolean(o.schema_validation)&&number(o.repair_limit);
 }
 const node=(v:unknown)=>identified(v)&&fields(v,['kind','label'],string)&&fields(v.position,['x','y'],number)&&optional(v,'agent_id',string)&&optional(v,'enforcement',string);
 const edge=(v:unknown)=>identified(v)&&fields(v,['source','target','kind','condition'],string)&&stringMap(v.mapping)&&optional(v,'timeout',number)&&optional(v,'maxReturns',number);
 function draft(v:unknown):boolean {
  return identified(v)&&fields(v,['name','sourceVersion'],string)&&list(v.nodes,node)&&uniqueIds(v.nodes)&&list(v.edges,edge)&&uniqueIds(v.edges)
   &&record(v.configs)&&Object.values(v.configs).every(config)
   &&fields(v.requirements,['purpose','audience','scope','input','actions','output','acceptance','failure'],string)
   &&fields(v.budget,['maxSeconds','maxCost','maxReturns','concurrency'],number)&&record(v.viewport)&&fields(v.viewport,['x','y','zoom'],number)&&(v.viewport.zoom as number)>0;
 }
 const snapshot=(v:unknown)=>identified(v)&&fields(v,['name','createdAt'],string)&&draft(v.draft);
 const metric=(v:unknown)=>record(v)&&nullableNumber(v.value)&&fields(v,['unit','provenance'],string);
 const evidence=(v:unknown)=>fields(v,['claim_id','claim'],string)&&record(v)&&strings(v.evidence_ids);
 function run(v:unknown):boolean {
  return identified(v)&&v.synthetic===true&&v.model_called===false&&v.execution_mode==='mock_tools'
   &&fields(v,['title','team_id','config_version','config_snapshot_ref','case_id','dataset_id','suite_id','execution_status','quality_status','started_at','ended_at','trace_id','trace_completeness','decision_summary'],string)
   &&fields(v.metrics,['duration','tokens','cost'],metric)&&input(v.input)&&record(v.output)&&string(v.output.report)&&list(v.output.claim_evidence,evidence)&&strings(v.output.uncertainties)
   &&optional(v,'snapshot',snapshot)&&optional(v,'scenario',string)&&optional(v,'fixtureSource',string)&&optional(v,'playedEvents',n=>number(n)&&Number.isInteger(n)&&n>=0);
 }
 const testCase=(v:unknown)=>identified(v)&&fields(v,['title','layer','expected'],string)&&input(v.input)&&optional(v,'origin_run_id',string)&&optional(v,'origin_span_id',string);
 const review=(v:unknown)=>fields(v,['runId','spanId','verdict','note','createdAt'],string);
 return record(value)&&value.schemaVersion===1&&draft(value.draft)&&draft(value.savedDraft)&&nullableString(value.savedAt)
  &&list(value.versions,snapshot)&&uniqueIds(value.versions)&&list(value.runs,run)&&uniqueIds(value.runs)
  &&list(value.customCases,testCase)&&uniqueIds(value.customCases)&&list(value.manualReviews,review)&&string(value.defaultVersion)
  &&value.versions.some(v=>(v as RecordValue).id===value.defaultVersion);
}
export function restoreState(raw:string|null):{state:State;error:string|null} {
 if(!raw)return {state:initialState(),error:null};
 try {const state:unknown=JSON.parse(raw);if(!validateState(state))throw Error('数据结构不兼容');
 // A browser refresh interrupts the local event player, never resumes a fake background engine.
 const recovered:State=clone(state);recovered.runs=recovered.runs.map(r=>['running','waiting_approval'].includes(r.execution_status)?{...r,execution_status:'cancelled',quality_status:'not_evaluated',ended_at:new Date().toISOString(),decision_summary:'页面关闭或刷新，模拟播放已停止。'}:r);
 return {state:recovered,error:null};}catch{return {state:initialState(),error:'本地数据无法读取，已使用示例恢复。原始备份未覆盖，可下载恢复文件。'}}
}
export function checkDraft(draft:Draft):Issue[] {
 const out:Issue[]=[];const add=(id:string,severity:Issue['severity'],title:string,detail:string,nodeId?:string)=>out.push({id,severity,title,detail,nodeId});
 if(!draft.requirements.purpose.trim())add('purpose','error','缺少智能体目的','在要件定义中补充它需要完成什么。');
 for(const kind of ['input','output'])if(!draft.nodes.some(n=>n.kind===kind))add(kind,'error',`缺少${kind==='input'?'输入':'输出'}节点`,'流程必须有可识别的入口和出口。');
 for(const n of draft.nodes){
  if(n.kind!=='input'&&!draft.edges.some(e=>e.target===n.id))add(`incoming-${n.id}`,'error',`${n.label}尚未连接`,'从上游输出端口连接到它的输入端口。',n.id);
  if(!['output','human_approval'].includes(n.kind)&&!draft.edges.some(e=>e.source===n.id))add(`outgoing-${n.id}`,'error',`${n.label}没有后续步骤`,'添加后续连接或明确结束节点。',n.id);
  if(n.agent_id){const c=draft.configs[n.agent_id];if(!c){add(`config-${n.id}`,'error','成员配置缺失','先创建该成员的脚手架。',n.id);continue}
   const model=fixture.resources.models.find(m=>m.id===c.model.model_id);
   if(!model)add(`model-${n.id}`,'error','未知模型能力','请选择演示目录中的模型。',n.id);
   else if((c.model.temperature!==null&&!model.capabilities.temperature)||(c.model.reasoning_effort&&!model.capabilities.reasoning_efforts.includes(c.model.reasoning_effort)))add(`params-${n.id}`,'error',`${n.label}模型参数不受支持`,'选择该模型支持的推理强度或采样参数。',n.id);
   if(c.loop.max_steps<=0||c.loop.timeout_seconds<=0||!c.loop.stop_when.trim())add(`loop-${n.id}`,'error',`${n.label}缺少循环边界`,'步数和总时限必须大于零，并填写结束条件。',n.id);
   if(c.tools.allowed_ids.length)add(`tools-${n.id}`,'warning',`${n.label}的工具未接入`,'目前仅使用模拟数据，不能执行真实工具。',n.id);
  }
 }
 for(const e of draft.edges){const a=draft.nodes.find(n=>n.id===e.source),b=draft.nodes.find(n=>n.id===e.target);if(!a||!b){add(e.id,'error','连接指向缺失节点','删除或重新连接这条边。');continue}
  const keys=Object.keys(e.mapping);if(!keys.length||Object.values(e.mapping).some(v=>!v.trim()))add(e.id,'error','字段映射为空','填写传递的源字段和目标字段。',b.id);
  const src=a.agent_id?draft.configs[a.agent_id]:null;
  const dst=b.agent_id?draft.configs[b.agent_id]:null;
  if(src&&keys.some(k=>!src.output.fields.includes(k)))add(`mapping-source-${e.id}`,'error',`${a.label}没有声明源字段`,'请让映射字段与上游输出契约一致。',a.id);
  if(dst&&Object.values(e.mapping).some(k=>!(k in dst.input.fields)))add(`mapping-target-${e.id}`,'error',`${b.label}没有声明接收字段`,'请让映射字段与下游输入契约一致。',b.id);
 }
 if(draft.budget.maxReturns<0||draft.budget.maxSeconds<=0||draft.budget.maxCost<=0)add('team-budget','error','团队终止条件无效','设置有效退回次数、总时限和费用上限。');
 return out;
}
// Presentation layout does not alter executable configuration; semantic changes do.
export function behaviorSignature(d:Draft):string {return JSON.stringify({requirements:d.requirements,configs:d.configs,nodes:d.nodes.map(({position,...n})=>n),edges:d.edges,budget:d.budget});}
export function fixtureVersionFor(draft:Draft):string|null {for(const id of ['team-v1','team-v2-candidate'])if(behaviorSignature(draft)===behaviorSignature(seedDraft(id)))return id;return null}
export function replaceDraft(state:State,draft:Draft):State {const changed=JSON.stringify({...state.draft,viewport:null})!==JSON.stringify({...state.savedDraft,viewport:null});return {...state,versions:changed?[...state.versions,{...createSnapshot(state.draft),name:state.draft.name+' · 切换前草稿'}]:state.versions,draft:clone(draft)};}
export function makeRun(draft:Draft,scenario='normal',input:Record<string,unknown>|string={}):Run {
 const baseline=fixtureVersionFor(draft)==='team-v1'||draft.nodes.some(n=>n.kind==='condition'&&n.enforcement==='advisory');const template=fixture.runs[baseline?0:1];const snapshot=createSnapshot(draft);
 const id=uid('run');const compatible=fixtureVersionFor(draft);const task=typeof input==='string'?input:input.task;const sameCase=task===template.input.task;
 return {...clone(template),id,title:`${draft.name} · 模拟运行`,config_version:snapshot.id,config_snapshot_ref:snapshot.id,snapshot,fixtureSource:template.id,case_id:sameCase?template.case_id:'custom-input',dataset_id:sameCase?template.dataset_id:'unassigned',suite_id:sameCase?template.suite_id:'unassigned',scenario,playedEvents:0,trace_id:crypto.randomUUID().replaceAll('-',''),input:(typeof input==='string'?{task:input}:clone(input)) as Run['input'],started_at:new Date().toISOString(),ended_at:'',execution_status:'running',quality_status:'not_evaluated',output:{report:'',claim_evidence:[],uncertainties:[]},decision_summary:compatible?'播放预置事件；所有结果为模拟。':'自定义配置仅演示事件播放，不评价修改效果。',metrics:{duration:{value:null,unit:'seconds',provenance:'synthetic_fixture'},tokens:{value:null,unit:'tokens',provenance:'synthetic_fixture'},cost:{value:null,unit:'USD',provenance:'synthetic_fixture'}},synthetic:true,model_called:false};
}
export function getRunSpans(run:Run,playedOnly=false):Span[] {
 const source=run.fixtureSource||run.id;let spans=clone(fixture.spans.filter(s=>s.run_id===source));
 if(playedOnly&&run.playedEvents!==undefined)spans=spans.slice(0,run.playedEvents);
 return spans.map(s=>({...s,run_id:run.id,trace_id:run.trace_id,config_version:run.config_version}));
}
export function formatMetric(value:number|null|undefined,suffix='') {return value==null?'未采集':`${value}${suffix}`;}
