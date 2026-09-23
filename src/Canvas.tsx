import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Background, BackgroundVariant, Controls, Handle, MarkerType, MiniMap, Panel, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Connection, type NodeProps, type Node, type NodeChange, type EdgeChange, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Draft, GraphEdge, GraphNode, StudioApi } from './types';
import { Badge, Button, Field, Icon, Status } from './ui';
import { behaviorSignature, getRunSpans } from './domain';
import './canvas.css';

type CanvasData = Record<string, unknown> & { label: string; kind: string; subtitle: string; detail: string; execution: boolean; visited: boolean; issue: boolean; steps: number; };
type CanvasNode = Node<CanvasData, 'studio'>;
const library = [
 {kind:'input',label:'输入',icon:'input',detail:'任务与输入契约'},
 {kind:'preprocess',label:'预处理',icon:'tune',detail:'解析与标准化'},
 {kind:'condition',label:'条件分支',icon:'call_split',detail:'证据与分支判断'},
 {kind:'retrieval',label:'检索',icon:'manage_search',detail:'关联知识与证据'},
 {kind:'agent',label:'智能体',icon:'smart_toy',detail:'独立成员与脚手架'},
 {kind:'tool',label:'工具',icon:'construction',detail:'函数、MCP 或 API'},
 {kind:'parallel',label:'并行',icon:'account_tree',detail:'并发执行路径'},
 {kind:'join',label:'汇合',icon:'merge',detail:'等待上游结果'},
 {kind:'human_approval',label:'人工确认',icon:'person_check',detail:'等待人工判断'},
 {kind:'validation',label:'校验',icon:'verified',detail:'结构与内容检查'},
 {kind:'output',label:'输出',icon:'output',detail:'最终交付内容'},
];
const kindNames:Record<string,string> = Object.fromEntries(library.map(item=>[item.kind,item.label]));
const conditionNames:Record<string,string> = {required_input_valid:'输入有效',research_complete:'研究完成 · 委派核验',verification_complete:'核验结果',evidence_sufficient:'证据充分',evidence_sufficient_or_advisory_warning:'充分或仅标记告警',evidence_insufficient_and_returns_lt_1:'证据不足 · 补查一次',return_limit_reached:'已达退回上限',output_schema_valid:'输出校验通过',always:'始终'};
const edgeKinds:Record<string,string> = {sequence:'顺序传递',handoff:'交接控制权',delegate_and_return:'委派并返回',conditional:'条件分支',return:'退回补查'};
const short = (value:string,max=27)=>value.length>max?`${value.slice(0,max)}…`:value;

function StudioNode({data,selected}:NodeProps<CanvasNode>) {
 const item = library.find(item=>item.kind===data.kind);
 return <div className={`graph-card kind-${data.kind} ${selected?'selected':''} ${data.execution&&!data.visited?'unvisited':''} ${data.issue?'has-issue':''}`}>
  <Handle type="target" position={Position.Top} id="in-top" aria-label={`${data.label} 输入端口`}/>
  <Handle type="target" position={Position.Left} id="in-left" aria-label={`${data.label} 左侧输入端口`}/>
  <Handle type="target" position={Position.Bottom} id="in-bottom" style={{left:'30%'}} aria-label={`${data.label} 下侧输入端口`}/>
  <div className="graph-card-head"><span className="graph-node-icon"><Icon name={item?.icon||'widgets'} size={21}/></span><span className="graph-kind">{kindNames[data.kind]||data.kind}</span>{data.execution?<span className={`graph-indicator ${data.visited?'visited':''}`} title={data.visited?'有模拟记录':'未经过 / 未采集'}>{data.visited?'已记录':'未经过'}</span>:data.issue?<span className="graph-indicator warning" title="有配置提示">!</span>:<span className="graph-node-menu"><Icon name="more_horiz" size={17}/></span>}</div>
  <strong>{data.label}</strong><p>{data.subtitle}</p>
  <div className="graph-card-foot"><span>{data.detail}</span>{data.execution&&data.steps>0&&<span>{data.steps} 步</span>}</div>
  <Handle type="source" position={Position.Bottom} id="out-bottom" aria-label={`${data.label} 输出端口`}/>
  <Handle type="source" position={Position.Top} id="out-top" style={{left:'70%'}} aria-label={`${data.label} 上侧输出端口`}/>
  <Handle type="source" position={Position.Right} id="out-right" aria-label={`${data.label} 右侧输出端口`}/>
  <Handle type="source" position={Position.Left} id="out-left" style={{top:'75%'}} aria-label={`${data.label} 退回端口`}/>
 </div>;
}
const nodeTypes = { studio: StudioNode };

export function Canvas({api}:{api:StudioApi}) { return <ReactFlowProvider><CanvasEditor api={api}/></ReactFlowProvider>; }

function CanvasEditor({api}:{api:StudioApi}) {
 const {draft,setDraft}=api;
 const flow=useReactFlow<CanvasNode>();
 const [libraryOpen,setLibraryOpen]=useState(true);
 const [inspectorOpen,setInspectorOpen]=useState(!!api.selectedNode);
 const [expanded,setExpanded]=useState(false);
 const panelsBeforeExpand=useRef({library:true,inspector:!!api.selectedNode});
 const [execution,setExecution]=useState(false);
 const [selectedEdge,setSelectedEdge]=useState<string|null>(null);
 const [selectedIds,setSelectedIds]=useState<string[]>([]);
 const [nodeDimensions,setNodeDimensions]=useState<Record<string,{width:number;height:number}>>({});
 const [debugOpen,setDebugOpen]=useState(false);
 const [libraryTab,setLibraryTab]=useState<'library'|'outline'>('library');
 const [undoStack,setUndoStack]=useState<Draft[]>([]);
 const [mappingText,setMappingText]=useState('');
 const [mappingError,setMappingError]=useState('');
 const [connectionSource,setConnectionSource]=useState('');
 const [connectionTarget,setConnectionTarget]=useState('');
 const [connectionKind,setConnectionKind]=useState('sequence');
 const [connectionError,setConnectionError]=useState('');
 const [search,setSearch]=useState('');
 const host=useRef<HTMLDivElement>(null);
 const dragCheckpoint=useRef(false);
 const run=api.state.runs.find(run=>run.id===api.selectedRun);
 const runSnapshot=run?.snapshot?.draft||api.state.versions.find(version=>version.id===run?.config_version)?.draft;
 const graph=execution&&runSnapshot?runSnapshot:draft;
 const spans=useMemo(()=>run?getRunSpans(run,true):[],[run]);
 const visited=useMemo(()=>new Set(spans.map(span=>span.attributes['agent_studio.node.id'])),[spans]);
 const activeNode=graph.nodes.find(node=>node.id===api.selectedNode);
 const activeEdge=graph.edges.find(edge=>edge.id===selectedEdge);
 const activeConfig=activeNode?.agent_id?graph.configs[activeNode.agent_id]:null;
 const hasHistoricalChanges=!!runSnapshot&&behaviorSignature(runSnapshot)!==behaviorSignature(draft);
 const pushUndo=useCallback(()=>setUndoStack(stack=>[...stack.slice(-19),structuredClone(draft)]),[draft]);
 const setNode=(id:string)=>{api.selectNode(id);setSelectedIds([id]);setSelectedEdge(null);setInspectorOpen(true);};
 const setEdge=(id:string)=>{setSelectedEdge(id);api.selectNode(null);setSelectedIds([]);setInspectorOpen(true);};
 useEffect(()=>{if(api.selectedNode)setSelectedIds(current=>current.includes(api.selectedNode!)?current:[api.selectedNode!]);},[api.selectedNode]);
 useEffect(()=>{setMappingText(JSON.stringify(activeEdge?.mapping||{},null,2));setMappingError('');},[activeEdge?.id,activeEdge?.mapping]);
 useEffect(()=>{setSelectedEdge(null);setSelectedIds(api.selectedNode?[api.selectedNode]:[]);setUndoStack([]);},[draft.id]);
 const nodes=useMemo<CanvasNode[]>(()=>graph.nodes.map(node=>{
  const config=node.agent_id?graph.configs[node.agent_id]:null;
  const records=spans.filter(span=>span.attributes['agent_studio.node.id']===node.id);
  const subtitle=config?config.model.model_id:node.kind==='condition'?(node.enforcement==='required'?'阻断未验证的事实':'仅提示 · 仍继续执行'):node.kind==='input'?'task · sources · language':node.kind==='output'?'Markdown + evidence.json':node.kind==='human_approval'?'退回耗尽时由你决定':'双击或选中编辑';
  const detail=config?`${config.loop.strategy} · 最多 ${config.loop.max_steps} 步`:node.kind==='condition'?`团队最多退回 ${graph.budget.maxReturns} 次`:node.kind==='output'?'结构与内容校验':node.kind==='human_approval'?'需要明确确认':'数据与控制流';
  return {id:node.id,type:'studio',position:node.position,measured:nodeDimensions[node.id],selected:selectedIds.includes(node.id),data:{label:node.label,kind:node.kind,subtitle,detail,execution,visited:visited.has(node.id),issue:api.issues.some(issue=>issue.nodeId===node.id),steps:records.length},ariaLabel:`${node.label}，${kindNames[node.kind]||node.kind}节点`,focusable:true};
 }),[graph,spans,selectedIds,execution,visited,api.issues,nodeDimensions]);
 const edges=useMemo<Edge[]>(()=>graph.edges.map(edge=>{
  const from=graph.nodes.find(node=>node.id===edge.source),to=graph.nodes.find(node=>node.id===edge.target);
  const horizontal=from&&to&&Math.abs(to.position.x-from.position.x)>Math.abs(to.position.y-from.position.y);
  const upward=from&&to&&!horizontal&&to.position.y<from.position.y;
  const isReturn=edge.kind==='return';
  const isHuman=edge.target.includes('human');
  const tookReturn=spans.some(span=>span.name.includes('补查')||span.name.includes('退回'));
  const isVisited=execution&&(isReturn?tookReturn:isHuman?visited.has(edge.target):visited.has(edge.source)&&visited.has(edge.target));
  return {...edge,type:'smoothstep',sourceHandle:isReturn?'out-left':horizontal&&to!.position.x>from!.position.x?'out-right':upward?'out-top':'out-bottom',targetHandle:isReturn?'in-left':horizontal&&to!.position.x>from!.position.x?'in-left':upward?'in-bottom':'in-top',animated:isVisited,selected:edge.id===selectedEdge,label:short(conditionNames[edge.condition]||edge.condition||edgeKinds[edge.kind]),style:{stroke:isVisited?'#6750a4':isReturn?'#b08a55':edge.id===selectedEdge?'#6750a4':'#b4a9c2',strokeWidth:edge.id===selectedEdge?2.8:1.7,strokeDasharray:isReturn?'6 5':undefined,opacity:execution&&!isVisited ? .32 : 1},markerEnd:{type:MarkerType.ArrowClosed,width:17,height:17,color:isVisited?'#6750a4':isReturn?'#b08a55':'#a79abb'},labelStyle:{fontSize:11,fontWeight:600,fill:'#625571'},labelBgStyle:{fill:isReturn?'#fff7e8':'#fcfaff',fillOpacity:1},labelBgPadding:[7,4],labelBgBorderRadius:6,interactionWidth:22,ariaLabel:`${from?.label||edge.source} 到 ${to?.label||edge.target}：${conditionNames[edge.condition]||edge.condition}`};
 }),[graph,execution,spans,visited,selectedEdge]);

 const changeNodes=useCallback((changes:NodeChange<CanvasNode>[])=>{
  const dimensions=changes.flatMap(change=>change.type==='dimensions'&&change.dimensions?[{id:change.id,...change.dimensions}]:[]);
  if(dimensions.length)setNodeDimensions(current=>{let updated=false;const next={...current};for(const item of dimensions){if(current[item.id]?.width!==item.width||current[item.id]?.height!==item.height){next[item.id]={width:item.width,height:item.height};updated=true}}return updated?next:current});
  if(execution)return;
  const positions=changes.filter(change=>change.type==='position'&&change.position);
  if(positions.length)setDraft(current=>({...current,nodes:current.nodes.map(node=>{const change=positions.find(item=>'id' in item&&item.id===node.id);return change&&change.type==='position'&&change.position?{...node,position:change.position}:node})}));
  const selections=changes.filter(change=>change.type==='select');
  if(selections.length)setSelectedIds(current=>{const next=new Set(current);for(const change of selections){if(change.type==='select'){if(change.selected)next.add(change.id);else next.delete(change.id)}}return [...next]});
 },[execution,setDraft]);
 const changeEdges=useCallback((changes:EdgeChange[])=>{for(const change of changes)if(change.type==='select'&&change.selected)setSelectedEdge(change.id);},[]);
 const connect=useCallback((connection:Connection|{source:string;target:string})=>{
  if(execution)return false;
  if(!connection.source||!connection.target){setConnectionError('请选择上游和下游节点。');return false}
  if(connection.source===connection.target){setConnectionError('同一节点不能连接自身；请通过条件节点设置有上限的循环。');api.notify('同一节点不能连接自身');return false}
  if(draft.edges.some(edge=>edge.source===connection.source&&edge.target===connection.target)){setConnectionError('这两个节点之间已经存在连线，请选中连线编辑。');api.notify('连线已存在');return false}
  pushUndo();const id=`edge-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
  setDraft(current=>({...current,edges:[...current.edges,{id,source:connection.source!,target:connection.target!,kind:connectionKind,mapping:{},condition:'always',maxReturns:connectionKind==='return'?1:undefined}]}));setConnectionError('');setEdge(id);api.notify('已创建连线；请配置传递字段和条件');return true;
 },[execution,draft.edges,connectionKind,pushUndo,setDraft,api]);
 const addNode=(kind:string,position?:{x:number;y:number})=>{
  if(execution)return;
  const item=library.find(item=>item.kind===kind);if(!item)return;
  pushUndo();const id=`node-${kind}-${Date.now()}`;
  const bounds=host.current?.getBoundingClientRect();
  const point=position||flow.screenToFlowPosition({x:(bounds?.left||0)+(bounds?.width||900)*.5,y:(bounds?.top||0)+(bounds?.height||600)*.4});
  const agentId=kind==='agent'?`agent-${Date.now()}`:undefined;
  const node:GraphNode={id,kind,label:kind==='agent'?'新智能体':item.label,position:point,...(agentId?{agent_id:agentId}:{}),...(kind==='condition'?{enforcement:'required'}:{})};
  setDraft(current=>({...current,nodes:[...current.nodes,node],configs:agentId?{...current.configs,[agentId]:structuredClone(current.configs['agent-researcher']||Object.values(current.configs)[0])}:current.configs}));setNode(id);api.notify(`已添加${item.label}`);
 };
 const removeSelection=()=>{
  if(execution)return;
  const ids=selectedIds.length?selectedIds:api.selectedNode?[api.selectedNode]:[];
  if(!ids.length&&!selectedEdge)return;
  pushUndo();setDraft(current=>({...current,nodes:current.nodes.filter(node=>!ids.includes(node.id)),edges:current.edges.filter(edge=>edge.id!==selectedEdge&&!ids.includes(edge.source)&&!ids.includes(edge.target))}));setSelectedIds([]);api.selectNode(null);setSelectedEdge(null);api.notify('已删除选中项，可撤销');
 };
 const undo=()=>{const previous=undoStack.at(-1);if(!previous)return;setDraft(previous);setUndoStack(stack=>stack.slice(0,-1));api.notify('已撤销画布操作');};
 const updateNode=(patch:Partial<GraphNode>)=>{if(!activeNode||execution)return;setDraft(current=>({...current,nodes:current.nodes.map(node=>node.id===activeNode.id?{...node,...patch}:node)}));};
 const updateEdge=(patch:Partial<GraphEdge>)=>{if(!activeEdge||execution)return;setDraft(current=>({...current,edges:current.edges.map(edge=>edge.id===activeEdge.id?{...edge,...patch}:edge)}));};
 const openScaffold=()=>{if(!activeNode)return;if(execution){api.notify('当前查看历史快照；返回设计结构后可编辑草稿');return}api.selectNode(activeNode.id);api.navigate('scaffold');};
 const enterExecution=()=>{if(!runSnapshot){api.notify('当前记录没有可用配置快照');return}setExecution(true);setSelectedEdge(null);api.selectNode(null);setSelectedIds([]);requestAnimationFrame(()=>flow.fitView({padding:.22,duration:250}));};
 const relevantIssues=activeNode?api.issues.filter(issue=>issue.nodeId===activeNode.id):api.issues;
 const toggleExpanded=()=>{if(expanded){setLibraryOpen(panelsBeforeExpand.current.library);setInspectorOpen(panelsBeforeExpand.current.inspector)}else{panelsBeforeExpand.current={library:libraryOpen,inspector:inspectorOpen};setLibraryOpen(false);setInspectorOpen(false)}setExpanded(value=>!value);requestAnimationFrame(()=>requestAnimationFrame(()=>flow.fitView({padding:.12,maxZoom:1,duration:250})))};
 return <div className="studio-canvas" onKeyDown={event=>{const target=event.target as HTMLElement;if(target.closest('input,textarea,select'))return;if(!execution&&(event.key==='Delete'||event.key==='Backspace')){event.preventDefault();removeSelection()}if(!execution&&(event.metaKey||event.ctrlKey)&&event.key==='z'){event.preventDefault();undo()}}}>
  <div className="canvas-commandbar">
   <div className="canvas-mode-wrap">
    <div className="canvas-mode" role="tablist" aria-label="画布视图切换">
     <button role="tab" aria-selected={!execution} className={!execution?'active':''} onClick={()=>{setExecution(false);setSelectedEdge(null);setSelectedIds([]);api.selectNode(null)}}><Icon name="account_tree" size={18}/>设计结构</button>
     <button role="tab" aria-selected={execution} className={execution?'active':''} onClick={enterExecution}><Icon name="route" size={18}/>本次执行路径</button>
    </div>
    <p className="canvas-mode-hint">{execution?'只读视图 · 叠加显示所选运行走过的节点；不能编辑':'编辑视图 · 可拖拽节点、连线和修改配置'}</p>
   </div>
   <div className="canvas-command-meta">{execution?<Badge tone="warning">模拟 · 历史快照</Badge>:<><span className="canvas-dot"/>本地草稿 <span className="canvas-muted">· {graph.nodes.length} 节点 · {graph.edges.length} 连线</span></>}</div>
   <div className="canvas-command-actions"><button className={`icon-button ${expanded?'is-active':''}`} title={expanded?'恢复侧栏':'专注画布'} aria-label={expanded?'退出专注画布':'专注画布'} onClick={toggleExpanded}><Icon name={expanded?'fullscreen_exit':'fullscreen'}/></button><button className="icon-button" title="撤销画布删除、新增或移动" aria-label="撤销画布操作" disabled={execution||!undoStack.length} onClick={undo}><Icon name="undo"/></button><button className="icon-button" title="删除选中项" aria-label="删除选中节点或连线" disabled={execution||(!selectedIds.length&&!selectedEdge)} onClick={removeSelection}><Icon name="delete"/></button><span className="canvas-toolbar-divider"/><button className={`icon-button ${libraryOpen?'is-active':''}`} title="切换节点库" aria-label="切换节点库" onClick={()=>setLibraryOpen(open=>!open)}><Icon name="view_sidebar"/></button><button className={`icon-button ${inspectorOpen?'is-active':''}`} title="切换详情面板" aria-label="切换详情面板" onClick={()=>setInspectorOpen(open=>!open)}><Icon name="side_navigation"/></button></div>
  </div>
  {execution&&<div className="canvas-runbar"><span><Icon name="history" size={18}/><b>{run?.config_version}</b> · 只读执行快照</span><select aria-label="选择模拟运行快照" value={api.selectedRun ?? ''} onChange={event=>{api.selectRun(event.target.value);api.selectNode(null);setSelectedEdge(null)}}>{api.state.runs.filter(item=>item.snapshot||api.state.versions.some(version=>version.id===item.config_version)).map(item=><option key={item.id} value={item.id}>{item.title} · {item.config_version}</option>)}</select><Button icon="receipt_long" onClick={()=>api.navigate('trace')}>查看 Trace</Button></div>}
  {execution&&hasHistoricalChanges&&<div className="canvas-snapshot-note">当前显示这次运行保存的配置，不包含草稿中的新修改。连线高亮根据模拟记录推导；没有记录的步骤不代表执行成功。</div>}
  <div className="canvas-workspace">
   {libraryOpen&&<aside className="canvas-library" aria-label="节点库"><div className="canvas-sidebar-head"><strong>构建流程</strong><button className="icon-button" aria-label="收起节点库" onClick={()=>setLibraryOpen(false)}><Icon name="left_panel_close" size={19}/></button></div><div className="canvas-library-tabs"><button className={libraryTab==='library'?'active':''} onClick={()=>setLibraryTab('library')}>节点库</button><button className={libraryTab==='outline'?'active':''} onClick={()=>setLibraryTab('outline')}>流程列表</button></div>
    {libraryTab==='library'?<><label className="canvas-search"><Icon name="search" size={18}/><input aria-label="搜索节点类型" placeholder="搜索节点…" value={search} onChange={event=>setSearch(event.target.value)}/></label><p className="canvas-sidebar-hint">拖到画布，或点击添加</p><div className="canvas-library-items">{library.filter(item=>`${item.label}${item.detail}`.includes(search)).map(item=><button key={item.kind} className="canvas-library-item" draggable={!execution} disabled={execution} onDragStart={event=>{event.dataTransfer.setData('application/agent-studio-node',item.kind);event.dataTransfer.effectAllowed='move'}} onClick={()=>addNode(item.kind)}><span className={`library-kind-icon ${item.kind}`}><Icon name={item.icon} size={21}/></span><span><b>{item.label}</b><small>{item.detail}</small></span><Icon name="add" size={16}/></button>)}</div><div className="canvas-library-footer"><Icon name="info" size={17}/><span>节点可编辑；执行引擎尚未接入</span></div></>:<div className="canvas-outline"><p className="canvas-sidebar-hint">键盘可选择节点与连接</p>{graph.nodes.map((node,index)=><button key={node.id} className={api.selectedNode===node.id?'active':''} onClick={()=>{setNode(node.id);flow.setCenter(node.position.x+108,node.position.y+65,{zoom:1,duration:300})}}><span>{String(index+1).padStart(2,'0')}</span><Icon name={library.find(item=>item.kind===node.kind)?.icon||'widgets'} size={18}/>{node.label}</button>)}<h4>连线</h4>{graph.edges.map(edge=><button key={edge.id} className={selectedEdge===edge.id?'active':''} onClick={()=>setEdge(edge.id)}><Icon name="arrow_right_alt" size={18}/><span>{graph.nodes.find(node=>node.id===edge.source)?.label} → {graph.nodes.find(node=>node.id===edge.target)?.label}</span></button>)}</div>}
   </aside>}
   <div className="canvas-flow" ref={host} aria-label="智能体编排画布" onDrop={event=>{event.preventDefault();const kind=event.dataTransfer.getData('application/agent-studio-node');if(kind)addNode(kind,flow.screenToFlowPosition({x:event.clientX,y:event.clientY}))}} onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect='move'}}>
    <ReactFlow<CanvasNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={changeNodes} onEdgesChange={changeEdges} onConnect={connect} onNodeClick={(event,node)=>{if(event.shiftKey){api.selectNode(node.id);setSelectedIds(current=>current.includes(node.id)?current:[...current,node.id]);setSelectedEdge(null);setInspectorOpen(true)}else setNode(node.id)}} onNodeDoubleClick={(_event,node)=>{setNode(node.id);if(node.data.kind==='agent'&&!execution)api.navigate('scaffold')}} onEdgeClick={(_event,edge)=>setEdge(edge.id)} onPaneClick={()=>{api.selectNode(null);setSelectedIds([]);setSelectedEdge(null)}} onNodeDragStart={()=>{if(!dragCheckpoint.current){pushUndo();dragCheckpoint.current=true}}} onNodeDragStop={()=>{dragCheckpoint.current=false}} onMoveEnd={(_event,viewport)=>{if(!execution)setDraft(current=>({...current,viewport}))}} nodesDraggable={!execution} nodesConnectable={!execution} edgesReconnectable={false} elementsSelectable selectionOnDrag panOnDrag={[1,2]} panOnScroll zoomOnScroll={false} zoomOnPinch zoomOnDoubleClick={false} minZoom={.3} maxZoom={1.6} fitView={draft.viewport.x===0&&draft.viewport.y===0&&draft.viewport.zoom===1} fitViewOptions={{padding:.08,maxZoom:1}} defaultViewport={draft.viewport} deleteKeyCode={null} selectionKeyCode="Shift" multiSelectionKeyCode="Shift" >
     <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#d9d0e4"/>
     <Controls position="bottom-left" showInteractive={false} fitViewOptions={{padding:.08,maxZoom:1}}/>
     <MiniMap position="top-right" style={{width:118,height:78}} pannable zoomable nodeColor={node=>node.data.kind==='agent'?'#a798cc':node.data.kind==='condition'?'#d9b774':'#d7cedf'} maskColor="rgba(243,238,248,.7)" ariaLabel="流程小地图"/>
     
     {!libraryOpen&&<Panel position="top-left"><Button icon="add" onClick={()=>setLibraryOpen(true)}>添加节点</Button></Panel>}
    </ReactFlow>
   </div>
   {inspectorOpen&&<aside className="canvas-inspector" aria-label="选中项详情"><div className="canvas-sidebar-head"><strong>{activeEdge?'连线设置':activeNode?'节点详情':'流程设置'}</strong><button className="icon-button" aria-label="收起详情面板" onClick={()=>setInspectorOpen(false)}><Icon name="right_panel_close" size={19}/></button></div>
    {activeNode?<><div className="canvas-inspector-title"><span className={`library-kind-icon ${activeNode.kind}`}><Icon name={library.find(item=>item.kind===activeNode.kind)?.icon||'widgets'}/></span><div><h3>{activeNode.label}</h3><span>{kindNames[activeNode.kind]} {execution?'· 历史只读':'· 草稿'}</span></div></div><Field label="节点名称"><input value={activeNode.label} disabled={execution} onChange={event=>updateNode({label:event.target.value})}/></Field><p className="canvas-record-id">{activeNode.id}</p>
     {activeConfig&&<><div className="canvas-config-summary"><div><span>模型</span><b>{activeConfig.model.model_id}</b></div><div><span>连接</span><Badge tone="warning">未接入</Badge></div><div><span>执行循环</span><b>{activeConfig.loop.strategy} · {activeConfig.loop.max_steps} 步</b></div><div><span>允许工具</span><b>{activeConfig.tools.allowed_ids.length} 项</b></div><div><span>输出</span><b>{activeConfig.output.format.toUpperCase()}</b></div></div><p className="canvas-quote">{activeConfig.instructions.system}</p><Button variant="primary" icon="tune" disabled={execution} onClick={openScaffold}>编辑成员脚手架</Button><p className="canvas-sidebar-hint">模型、工具、输入输出、记忆与循环</p></>}
     {activeNode.kind==='condition'&&<><Field label="证据门禁" hint="阻断模式下，缺证据的结果需补查或转人工。"><select disabled={execution} value={activeNode.enforcement||'required'} onChange={event=>updateNode({enforcement:event.target.value})}><option value="advisory">仅提示，仍继续执行</option><option value="required">证据充分才继续</option></select></Field><div className="canvas-node-branches"><h4>出口与条件</h4>{graph.edges.filter(edge=>edge.source===activeNode.id).map(edge=><button key={edge.id} onClick={()=>setEdge(edge.id)}><Icon name="call_split" size={16}/><span>{conditionNames[edge.condition]||edge.condition}<small>→ {graph.nodes.find(node=>node.id===edge.target)?.label}</small></span><Icon name="chevron_right" size={16}/></button>)}</div></>}
     {activeNode.kind==='input'&&<div className="canvas-config-summary"><div><span>必填</span><b>task · string</b></div><div><span>可选</span><b>sources · array</b></div><p>输入契约在团队要件中维护。</p><Button icon="description" onClick={()=>api.navigate('requirements')}>查看要件</Button></div>}
     {!activeConfig&&!['condition','input'].includes(activeNode.kind)&&<div className="canvas-info-callout"><Icon name="info" size={20}/><p>可配置名称和连接关系。{['output','human_approval'].includes(activeNode.kind)?'执行过程使用内置模拟案例。':'此节点尚未接入执行器；试运行不会实际调用它。'}</p></div>}
     {execution&&<div className="canvas-node-branches"><h4>此节点的模拟记录</h4>{spans.filter(span=>span.attributes['agent_studio.node.id']===activeNode.id).map(span=><button key={span.span_id} onClick={()=>{api.selectSpan(span.span_id);api.navigate('trace')}}><Icon name="receipt_long" size={17}/><span>{span.name}<small>{span.metrics.duration.value??'未采集'} 秒 · 模拟</small></span><Icon name="chevron_right" size={16}/></button>)}{!visited.has(activeNode.id)&&<p className="canvas-sidebar-hint">该节点没有对应记录；不能推断为成功。</p>}</div>}
     {!!relevantIssues.length&&!execution&&<div className="canvas-node-issues">{relevantIssues.map(issue=><p key={issue.id}><Icon name={issue.severity==='error'?'error':'warning'} size={17}/>{issue.title}</p>)}</div>}
    </>:activeEdge?<><div className="canvas-edge-heading"><Badge>{edgeKinds[activeEdge.kind]||activeEdge.kind}</Badge><h3>{graph.nodes.find(node=>node.id===activeEdge.source)?.label}<Icon name="arrow_downward" size={18}/>{graph.nodes.find(node=>node.id===activeEdge.target)?.label}</h3></div><Field label="传递方式"><select value={activeEdge.kind} disabled={execution} onChange={event=>updateEdge({kind:event.target.value})}>{Object.entries(edgeKinds).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></Field><Field label="继续条件" hint={conditionNames[activeEdge.condition]||'保留为条件表达式；真实执行器尚未接入。'}><input value={activeEdge.condition} disabled={execution} onChange={event=>updateEdge({condition:event.target.value})}/></Field>{activeEdge.kind==='return'&&<Field label="最大退回次数"><input type="number" min="0" max="20" disabled={execution} value={activeEdge.maxReturns??graph.budget.maxReturns} onChange={event=>updateEdge({maxReturns:Math.max(0,Number(event.target.value))})}/></Field>}<Field label="字段映射（上游 → 下游）" hint="JSON 对象。字段类型由检查配置核对。"><textarea className="canvas-mapping" rows={6} disabled={execution} value={mappingText} onChange={event=>{setMappingText(event.target.value);setMappingError('')}}/></Field>{mappingError&&<p className="canvas-error" role="alert">{mappingError}</p>}<Button icon="check" disabled={execution} onClick={()=>{try{const value:unknown=JSON.parse(mappingText);if(!value||Array.isArray(value)||typeof value!=='object'||Object.values(value).some(item=>typeof item!=='string')||Object.entries(value).some(([key,item])=>!key.trim()||!(item as string).trim()))throw Error('请填写非空字段名对应的字符串对象，例如 {"claims":"claims"}');updateEdge({mapping:value as Record<string,string>});api.notify('字段映射已更新')}catch(error){setMappingError(error instanceof Error?error.message:'JSON 格式无效')}}}>应用映射</Button><p className="canvas-sidebar-hint">委派：下游处理后返回；交接：下游接管控制权。退回路径必须有次数上限。</p></>:<><div className="canvas-empty-inspector"><Icon name="touch_app" size={32}/><h3>选中节点或连线</h3><p>查看配置、字段映射和交接条件。双击智能体可进入完整脚手架。</p></div><div className="canvas-config-summary"><h4>团队运行边界</h4>{execution?<><div><span>并发上限</span><b>{graph.budget.concurrency}</b></div><div><span>退回上限</span><b>{graph.budget.maxReturns} 次</b></div><div><span>运行时限</span><b>{graph.budget.maxSeconds} 秒</b></div><div><span>模拟预算</span><b>${graph.budget.maxCost}</b></div></>:<><Field label="并发上限"><input type="number" min="1" max="20" value={draft.budget.concurrency} onChange={event=>setDraft(current=>({...current,budget:{...current.budget,concurrency:Number(event.target.value)}}))}/></Field><Field label="团队最大退回次数"><input type="number" min="0" max="20" value={draft.budget.maxReturns} onChange={event=>setDraft(current=>({...current,budget:{...current.budget,maxReturns:Number(event.target.value)}}))}/></Field><Field label="总时限（秒）"><input type="number" min="1" value={draft.budget.maxSeconds} onChange={event=>setDraft(current=>({...current,budget:{...current.budget,maxSeconds:Number(event.target.value)}}))}/></Field><Field label="费用上限（USD，模拟）"><input type="number" min="0.001" step="0.01" value={draft.budget.maxCost} onChange={event=>setDraft(current=>({...current,budget:{...current.budget,maxCost:Number(event.target.value)}}))}/></Field></>}</div></>}
    {!execution&&<details className="canvas-connect-form"><summary><Icon name="add_link" size={19}/>用表单建立连线</summary><Field label="上游节点"><select value={connectionSource} onChange={event=>setConnectionSource(event.target.value)}><option value="">选择上游</option>{draft.nodes.map(node=><option key={node.id} value={node.id}>{node.label}</option>)}</select></Field><Field label="下游节点"><select value={connectionTarget} onChange={event=>setConnectionTarget(event.target.value)}><option value="">选择下游</option>{draft.nodes.map(node=><option key={node.id} value={node.id}>{node.label}</option>)}</select></Field><Field label="连线类型"><select value={connectionKind} onChange={event=>setConnectionKind(event.target.value)}>{Object.entries(edgeKinds).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></Field>{connectionError&&<p className="canvas-error" role="alert">{connectionError}</p>}<Button icon="add_link" onClick={()=>connect({source:connectionSource,target:connectionTarget})}>建立连线</Button></details>}
   </aside>}
  </div>
  <div className={`canvas-debug ${debugOpen?'expanded':''}`}><button className="canvas-debug-toggle" onClick={()=>setDebugOpen(open=>!open)} aria-expanded={debugOpen}><Icon name={debugOpen?'expand_more':'expand_less'} size={20}/><strong>{execution?'运行事件':'配置检查'}</strong>{execution?<Badge tone="warning">模拟记录 {spans.length}</Badge>:<span className="canvas-debug-count">{api.issues.length} 项提示</span>}<span className="canvas-debug-status">{execution?'紫色：有模拟记录 · 未经过不等于执行成功':'Shift 框选 · 方向键微调节点 · 中键 / 右键平移 · 拖动端口连线'}</span><Icon name="terminal" size={18}/></button>{debugOpen&&<div className="canvas-debug-body">{execution?<><div className="canvas-debug-run"><b>{run?.title}</b><Status value={run?.execution_status||'unknown'}/><Status value={run?.quality_status||'unknown'}/><span>执行状态和质量评价独立</span></div>{spans.slice(0,12).map(span=><button key={span.span_id} onClick={()=>{api.selectSpan(span.span_id);api.navigate('trace')}}><Icon name="receipt_long" size={15}/><span>{span.name}</span><code>{span.span_id}</code><small>{span.metrics.duration.value??'未采集'} 秒 · 模拟</small></button>)}</>:<>{!api.issues.length?<p>未发现静态配置问题。真实模型与工具仍未接入。</p>:api.issues.map(issue=><button key={issue.id} onClick={()=>{if(issue.nodeId)setNode(issue.nodeId)}}><Icon name={issue.severity==='error'?'error':'warning'} size={17}/><b>{issue.title}</b><span>{issue.detail}</span>{issue.nodeId&&<Icon name="north_east" size={16}/>}</button>)}</>}</div>}</div>
 </div>;
}
