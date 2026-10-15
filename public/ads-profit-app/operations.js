import {date,days} from './core.js';
export function parseOperations(rows){
 const header=rows.findIndex(r=>r.some(c=>/^update time$/i.test(String(c).trim()))&&r.some(c=>/^details$/i.test(String(c).trim())));
 if(header<0)throw Error('未找到 Operation Log 表头。');
 const h=rows[header].map(c=>String(c).trim().toLowerCase()),ti=h.indexOf('update time'),di=h.indexOf('details'),ei=h.indexOf('event type');
 const meta=k=>String(rows.find(r=>String(r[0]).trim().toLowerCase()===k)?.[1]??'');
 const range=meta('date period').match(/\d{2}\/\d{2}\/\d{4}/g)||[],start=date(range[0]),end=date(range[1]);
 if(!days(start,end))throw Error('操作记录缺少有效 Date Period。');
 const events=[];let unsupported=0;
 for(const r of rows.slice(header+1)){const detail=String(r[di]??''),time=String(r[ti]??''),event=String(r[ei]??''),kind=/change target roas/i.test(event)||/(target|custom)\s*roas/i.test(detail)?'target':/change budget/i.test(event)||/daily budget/i.test(detail)?'budget':null;if(!kind)continue;
 const m=detail.match(/:\s*(?:RM\s*)?([\d,.]+)\s*(?:->|→)\s*(?:RM\s*)?([\d,.]+)/i);
 if(!m||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(time)){unsupported++;continue;}
 events.push({kind,time,old:Number(m[1].replace(/,/g,'')),value:Number(m[2].replace(/,/g,''))});}
 events.sort((a,b)=>a.time.localeCompare(b.time));return {start,end,product:meta('product id'),campaign:meta('campaign id'),events,unsupported};
}
export function settingHistory(log,start,end,kind){
 if(!days(start,end))return {summary:'',notes:['请先填写该时期日期。']};
 if(start<log.start||end>log.end)return {summary:'未覆盖',notes:[`记录只覆盖 ${log.start} 至 ${log.end}，请导入完整比较期的日志。`]};
 const all=log.events.filter(e=>e.kind===kind),begin=start+' 00:00:00',finish=end+' 23:59:59';
 const before=all.filter(e=>e.time<begin).at(-1),first=all.find(e=>e.time>=begin),initial=before?.value??first?.old;
 if(initial==null)return {summary:'未知',notes:['记录中没有此设置的变更，无法推断数值。']};
 const changes=all.filter(e=>e.time>=begin&&e.time<=finish),notes=[`期初：${initial}${kind==='budget'?' RM/天':''}${!before?'（由后续变更前值还原）':''}`];
 let current=initial;for(const e of changes){if(e.old!==current)return {summary:'记录不连续',notes:['相邻变更值不一致，请核对完整记录。']};notes.push(`${e.time}：${e.old} → ${e.value}`);current=e.value;}
 if(!changes.length)notes.push('期内无此项变更（以导入记录为准）。');return {summary:[initial,...changes.map(e=>e.value)].join(' → '),notes};
}
