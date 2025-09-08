import React,{useState} from 'react';
import './CommonAccordion.css';

export default function Accordion({
    title, defaultOpen=true, children, span='full', className=''
    }: {
    title:string; defaultOpen?:boolean; children:React.ReactNode;
    span?: 'full'|'half'; className?: string;
    }) {
    const [open,setOpen]=useState(defaultOpen);
    return (
        <div className={`section ${span==='half'?'section--half':''} ${className}`}>
        <button type="button" onClick={()=>setOpen(o=>!o)} aria-expanded={open}
            style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                    width:'100%',background:'transparent',border:0,cursor:'pointer',padding:0,margin:0}}>
            <h4 style={{margin:0}}>{title}</h4>
            <span aria-hidden style={{fontSize:12,color:'#64748b',border:'1px solid #cbd5e1',
                borderRadius:9999,padding:'2px 8px'}}>{open?'閉じる':'開く'}</span>
        </button>
        {open && <div style={{marginTop:10}}>{children}</div>}
        </div>
    );
}