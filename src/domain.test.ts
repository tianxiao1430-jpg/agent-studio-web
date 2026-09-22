import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seedDraft,initialState,makeRun,restoreState,checkDraft,fixtureVersionFor,getRunSpans,formatMetric,validateState,createSnapshot,replaceDraft} from './domain';
test('run snapshot is immutable when draft changes',()=>{const d=seedDraft();const r=makeRun(d,'normal','task');d.configs['agent-researcher'].instructions.system='changed';d.nodes[0].label='changed';assert.notEqual(r.snapshot!.draft.configs['agent-researcher'].instructions.system,'changed');assert.notEqual(r.snapshot!.draft.nodes[0].label,'changed');assert.equal(r.model_called,false);});
test('layout changes retain fixture match; semantic changes do not',()=>{const d=seedDraft();d.nodes[0].position.x+=30;assert.equal(fixtureVersionFor(d),'team-v2-candidate');d.configs['agent-researcher'].grounding.require_citations=false;assert.equal(fixtureVersionFor(d),null);});
test('corrupt and incompatible storage safely recovers',()=>{assert.ok(restoreState('{broken').error);assert.ok(restoreState('{"schemaVersion":1}').error);assert.equal(restoreState(JSON.stringify(initialState())).error,null)});
test('refresh cancels event playback without background restart',()=>{const s=initialState();s.runs.push(makeRun(s.draft));const restored=restoreState(JSON.stringify(s)).state;assert.equal(restored.runs.at(-1)?.execution_status,'cancelled');assert.equal(restored.runs.at(-1)?.quality_status,'not_evaluated');});
test('validation catches dangling graph, unsupported model and missing loop stop',()=>{const d=seedDraft();d.nodes=d.nodes.filter(n=>n.kind!=='input');d.configs['agent-researcher'].model.temperature=.5;d.configs['agent-researcher'].loop.stop_when='';const issues=checkDraft(d);for(const id of ['input','params-node-researcher','loop-node-researcher'])assert.ok(issues.some(i=>i.id===id));});
test('trace contains only played events and keeps actual version',()=>{const r=makeRun(seedDraft());r.playedEvents=3;const spans=getRunSpans(r,true);assert.equal(spans.length,3);assert.ok(spans.every(s=>s.run_id===r.id&&s.config_version===r.config_version));});
test('missing metrics are not zero; pristine historical fixture untouched',()=>{assert.equal(formatMetric(null),'未采集');assert.equal(formatMetric(0),'0');const s=initialState();s.draft.name='edit';assert.equal(s.runs[0].config_version,'team-v1');});
test('backup validation accepts fixture state and new runs with nullable metrics',()=>{
 const state=initialState();const run=makeRun(state.draft);state.runs.push(run);
 state.manualReviews.push({runId:run.id,spanId:'',verdict:'passed',note:'本地人工复核',createdAt:new Date().toISOString()});
 state.customCases.push({id:'case-local',title:'缺少任务输入',layer:'agent_task',input:{},expected:'请求补充输入'});
 assert.equal(validateState(state),true);assert.equal(restoreState(JSON.stringify(state)).error,null);
});
test('backup validation rejects missing and malformed nested config fields without throwing',()=>{
 const changes:((s:ReturnType<typeof initialState>)=>void)[]=[
  s=>{s.draft.configs['agent-researcher'].input={} as never},
  s=>{s.draft.configs['agent-researcher'].tools.allowed_ids='tool-search-http' as never},
  s=>{s.draft.configs['agent-researcher'].input.fields=[] as never},
  s=>{s.draft.configs['agent-researcher'].context.shared_write_scope=[null] as never},
  s=>{s.draft.configs['agent-researcher'].model.reasoning_effort={} as never},
  s=>{s.draft.configs['agent-researcher'].grounding.require_citations='true' as never},
  s=>{s.draft.configs['agent-researcher'].output.fields=undefined as never},
  s=>{s.savedDraft.configs['agent-writer'].loop.max_steps=NaN},
  s=>{s.versions[0].draft.configs['agent-researcher'].instructions.skill_ids=[42] as never},
 ];
 for(const change of changes){const state=initialState();change(state);assert.doesNotThrow(()=>validateState(state));assert.equal(validateState(state),false);assert.ok(restoreState(JSON.stringify(state)).error)}
});
test('backup validation covers all requirement fields, graph structures and version snapshots',()=>{
 const changes:((s:ReturnType<typeof initialState>)=>void)[]=[
  s=>{delete (s.draft.requirements as Partial<typeof s.draft.requirements>).acceptance},
  s=>{s.draft.requirements.audience=null as never},
  s=>{s.draft.budget.maxSeconds='60' as never},
  s=>{s.draft.viewport.zoom=0},
  s=>{s.draft.nodes.push({...s.draft.nodes[0]})},
  s=>{s.draft.nodes[0].position.x=Infinity},
  s=>{s.draft.edges[0].mapping={task:42} as never},
  s=>{s.versions[0].createdAt=null as never},
  s=>{s.versions[0].draft=null as never},
  s=>{s.defaultVersion='missing-version'},
 ];
 for(const change of changes){const state=initialState();change(state);assert.doesNotThrow(()=>validateState(state));assert.equal(validateState(state),false)}
});
test('backup validation rejects malformed runs, nullable metrics, reviews and custom cases',()=>{
 const changes:((s:ReturnType<typeof initialState>)=>void)[]=[
  s=>{s.runs[0].metrics.duration.value='14.8' as never},
  s=>{s.runs[0].metrics.tokens=null as never},
  s=>{s.runs[0].output.claim_evidence=[{claim_id:'x',claim:'y',evidence_ids:null}] as never},
  s=>{s.runs[0].output.uncertainties={} as never},
  s=>{s.runs[0].input=[] as never},
  s=>{s.runs[0].model_called=true},
  s=>{s.runs[0].playedEvents=-1},
  s=>{s.runs[0].snapshot={id:'v',name:'bad',createdAt:'now',draft:{}} as never},
  s=>{s.manualReviews=[{runId:'run-baseline',spanId:'',verdict:'failed',note:null,createdAt:'now'}] as never},
  s=>{s.customCases=[{id:'case-local',title:'case',layer:'agent_task',input:{task:5},expected:'pass'}] as never},
 ];
 for(const change of changes){const state=initialState();change(state);assert.doesNotThrow(()=>validateState(state));assert.equal(validateState(state),false)}
});
test('structurally valid incomplete configurations stay editable after restore',()=>{
 const state=initialState();state.draft.requirements.purpose='';state.draft.configs['agent-researcher'].loop.max_steps=0;state.draft.configs['agent-researcher'].model.temperature=.5;
 assert.equal(validateState(state),true);assert.equal(restoreState(JSON.stringify(state)).error,null);assert.ok(checkDraft(state.draft).some(i=>i.id==='purpose'));
});

test("custom input does not inherit fixture dataset membership",()=>{const r=makeRun(seedDraft(),"normal","my own task");assert.equal(r.case_id,"custom-input");assert.equal(r.dataset_id,"unassigned");assert.equal(r.suite_id,"unassigned");});

test('reopened local baseline keeps baseline events rather than candidate events',()=>{const d=seedDraft('team-v1');const snap=createSnapshot(d);d.sourceVersion=snap.id;assert.equal(fixtureVersionFor(d),'team-v1');assert.equal(makeRun(d).fixtureSource,'run-baseline');});
test('switching versions preserves unsaved configuration as recoverable snapshot',()=>{const s=initialState();s.draft.configs['agent-researcher'].instructions.system='my unsaved instruction';const after=replaceDraft(s,seedDraft('team-v1'));assert.equal(after.versions.at(-1)!.draft.configs['agent-researcher'].instructions.system,'my unsaved instruction');assert.equal(after.draft.sourceVersion,'team-v1');});
