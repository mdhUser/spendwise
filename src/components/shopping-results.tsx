import {money} from '@/lib/domain';
import {platformNames,statusLabels,type SearchOutcome,type PricedCandidate} from '@/lib/shopping/contracts';
export function ShoppingResults({outcome}:{outcome:SearchOutcome}){
 const chosen=outcome.decision.map(d=>({decision:d,candidate:outcome.candidates.find(c=>c.id===d.candidateId)})).filter(x=>x.candidate);
 const pending=outcome.candidates.filter(c=>c.totalFen===null).filter((c,i,list)=>list.findIndex(x=>x.offer.ref.platform===c.offer.ref.platform&&x.offer.ref.productId===c.offer.ref.productId&&x.offer.ref.skuId===c.offer.ref.skuId)===i).slice(0,3);
 return <section className="results" aria-label="官方搜索结果">
  <div className="section-heading"><h2>官方平台搜索</h2><span>{outcome.mode==='model'?'AI 比较已完成':'规则比较'}</span></div>
  <div className="source-status-grid">{outcome.platformResults.map(r=><div className="panel" key={r.platform}><strong>{platformNames[r.platform]}</strong><p>{statusLabels[r.status]}</p><small>{r.sanitizedErrorCode==='protocol_unverified'?'接口协议仍待核验':r.sanitizedErrorCode==='access_review_required'?'应用权限和数据使用条件待确认':`${r.offers.length} 个候选商品`}</small></div>)}</div>
  {outcome.warnings.map(w=><p className="muted" key={w}>{w}</p>)}
  <div className="quote-grid">{chosen.map(({decision:d,candidate:c})=><OfficialCard key={d.candidateId} candidate={c!} title={{lowest_spend:'本次支出最低',lowest_unit:'同规格单位成本最低',best_match:'偏好匹配方案'}[d.kind]} reason={d.reason}/>)}</div>
  {!chosen.length&&<div className="empty-state"><h3>暂无可确认的购买方案</h3><p>可调整需求后重试，或选择手动比较并填写你看到的商品报价。</p></div>}
  {pending.length>0&&<><h3>待确认商品</h3><p className="muted">以下商品未计入最优方案；需确认规格、运费或优惠资格。</p><div className="quote-grid">{pending.map(c=><OfficialCard key={c.id} candidate={c} title="条件待确认"/>)}</div></>}
  <details className="advanced"><summary>查看取数依据与时间</summary>{outcome.platformResults.map(r=><div key={r.platform}><p>{platformNames[r.platform]} · {new Date(r.fetchedAt).toLocaleString('zh-CN')}</p>{r.evidence.slice(0,20).map(e=><p key={e.id}><a href={e.sourceUrl} target="_blank" rel="noopener noreferrer">查看平台来源 ↗</a> · {e.field} · {new Date(e.fetchedAt).toLocaleString('zh-CN')}</p>)}</div>)}</details>
 </section>;
}
function OfficialCard({candidate:c,title,reason}:{candidate:PricedCandidate;title:string;reason?:string}){
 return <article className="quote-card"><span className="tag">{title}</span><h3>{c.offer.name}</h3><p>{platformNames[c.offer.ref.platform]} · {c.offer.specs.pack??'包装规格待确认'} × {c.packs}</p>
 <div className="price"><span>¥</span>{money(c.totalFen??c.knownCostFen)}<small>{c.totalFen===null?'已知报价，非确定到手价':'已确认条件下的预计总价'}</small></div>
 {c.unitPriceFen!==null&&<p>约 ¥{money(c.unitPriceFen)} / {c.offer.specs.unit==='draw'?'100 抽':c.offer.category==='toilet'?'100 克':c.offer.specs.unit==='g'?'千克':'升'}</p>}
 {reason&&<p>{reason}</p>}{c.pending.map(p=><p className="discount-note" key={p}>{p}</p>)}
 <div className="source"><span>{new Date(c.offer.fetchedAt).toLocaleString('zh-CN')}</span><a href={c.offer.sourceUrl} target="_blank" rel="noopener noreferrer">查看来源 ↗</a></div></article>;
}
