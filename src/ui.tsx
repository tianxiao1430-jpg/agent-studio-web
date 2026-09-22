import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
export function Icon({name,size=21}:{name:string;size?:number}) { return <span className="material-symbols-rounded" style={{fontSize:size}} aria-hidden="true">{name}</span> }
export function Badge({children,tone='neutral'}:{children:ReactNode;tone?:string}) { return <span className={`badge ${tone}`}>{children}</span> }
export function Button({children,icon,variant='',...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{icon?:string;variant?:string}) { return <button className={`button ${variant}`} {...props}>{icon&&<Icon name={icon}/>} {children}</button> }
export function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}) { return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label> }
export function Empty({icon='inbox',title,children}:{icon?:string;title:string;children?:ReactNode}) {return <div className="empty"><Icon name={icon} size={36}/><h3>{title}</h3><p>{children}</p></div>}
export function Modal({title,children,onClose,wide=false}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean}) {
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement;ref.current?.showModal();return()=>{ref.current?.close();previous?.focus()}},[]);
 return <dialog ref={ref} className={`modal ${wide?'wide':''}`} onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose()}} aria-label={title}><div className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label="关闭弹窗" onClick={onClose}><Icon name="close"/></button></div>{children}</dialog>
}
export const statusLabels:Record<string,string>={completed:'执行完成',running:'运行中',waiting_approval:'等待人工',cancelled:'已取消',failed:'失败',passed:'通过',insufficient_evidence:'证据不足',not_evaluated:'未评价',error:'评估器错误',budget_exhausted:'预算耗尽',loop_limit:'循环达上限',incomplete:'追踪不完整',unconnected:'未接入',unknown:'未知',pending:'待运行',disagreement:'评价分歧'};
export function Status({value}:{value:string}) {return <Badge tone={['passed','completed'].includes(value)?'success':['failed','error'].includes(value)?'danger':['running','waiting_approval','disagreement'].includes(value)?'warning':'neutral'}>{statusLabels[value]||value}</Badge>}
