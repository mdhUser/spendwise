"use client";
import Link from "next/link";
import { ShoppingResults } from './shopping-results';
import { ShoppingPreferences } from './shopping-preferences';
import { platforms, type SearchOutcome, type ShoppingNeeds } from '@/lib/shopping/contracts';
import { selectFormOverrides } from "@/lib/form";
import { useEffect, useState, type FormEvent } from "react";
import { categoryNames, money, type Category, type Needs, type Offer, type Recommendation, type Quote } from "@/lib/domain";

type HistoryItem = { id: string; title: string; updatedAt: string };
type ChatMessage = { role: string; content: string };
type Saved = { id: string; payload: Recommendation | SearchOutcome; feedback: { helpful: boolean } | null };
type ConversationData = { messages: ChatMessage[]; snapshots: Saved[]; items: { payload: Offer }[]; needs: Record<string, unknown> };
class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
async function request<T>(path: string, method = "GET", payload?: unknown): Promise<T> {
  const response = await fetch(path, { method, headers: payload ? { "Content-Type": "application/json" } : undefined, body: payload ? JSON.stringify(payload) : undefined });
  const result = await response.json();
  if (!response.ok) throw new RequestError(result.error ?? "请求失败", response.status);
  return result;
}
const fen = (value: FormDataEntryValue | null) => Math.round(Number(value) * 100);
const yesNo = (value: FormDataEntryValue | null) => value === "yes" ? true : value === "no" ? false : null;

export default function Workspace({ demo }: { demo: boolean }) {
  const [access, setAccess] = useState<"loading" | "locked" | "ready">("loading");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [result, setResult] = useState<Recommendation | null>(null);
  const [shopping, setShopping] = useState<SearchOutcome | null>(null);
  const [sourceMode, setSourceMode] = useState<'official'|'manual'>('official');
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [items, setItems] = useState<Offer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("");
  const [feedback, setFeedback] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [budget, setBudget] = useState("");
  const [message, setMessage] = useState("");
  const [draftNeeds, setDraftNeeds] = useState<Partial<Needs> & Partial<ShoppingNeeds>>({});
  const [touched, setTouched] = useState<string[]>([]);
  const [formKey, setFormKey] = useState(0);

  async function refresh() {
    const data = await request<{ conversations: HistoryItem[] }>("/api/conversations");
    setHistory(data.conversations);
    setAccess("ready");
  }
  useEffect(() => {
    request<{ conversations: HistoryItem[] }>("/api/conversations").then(data => {
      setHistory(data.conversations); setAccess("ready");
    }).catch((e: RequestError) => { setAccess("locked"); if (e.status !== 401) setError(e.message); });
  }, []);
  function report(e: unknown) {
    setError(e instanceof Error ? e.message : "操作失败，请重试");
    if (e instanceof RequestError && e.status === 401) setAccess("locked");
  }
  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { await request("/api/access", "POST", { code: new FormData(event.currentTarget).get("code") }); await refresh(); }
    catch (e) { report(e); } finally { setBusy(false); }
  }
  function reset() {
    setShopping(null); setSourceMode('official'); setActive(null); setMessages([]); setResult(null); setSnapshotId(null); setItems([]);
    setDraftNeeds({}); setFeedback(""); setMode(""); setError(""); setCategory(""); setBudget(""); setMessage(""); setTouched([]); setFormKey(k => k + 1);
  }
  async function ensureConversation() {
    if (active) return active;
    const created = await request<{ id: string }>("/api/conversations", "POST");
    setActive(created.id); return created.id;
  }
  async function load(id: string) {
    setBusy(true); setError("");
    try {
      const { conversation } = await request<{ conversation: ConversationData }>(`/api/conversations/${id}`);
      setTouched([]); setMessage(""); setActive(id); setDraftNeeds(conversation.needs); setMessages(conversation.messages); setItems(conversation.items.map(i => i.payload));
      const saved = conversation.snapshots[0]?.payload;
      const official = saved && 'version' in saved && saved.version === 2 ? saved as SearchOutcome : null;
      setShopping(official); setSourceMode(official ? 'official' : 'manual');
      setResult(official ? null : saved as Recommendation ?? null); setSnapshotId(conversation.snapshots[0]?.id ?? null);
      setFeedback(conversation.snapshots[0]?.feedback ? "此方案已提交反馈，可再次更新。" : "");
      setCategory((conversation.needs.category as Category) ?? "");
      setBudget(conversation.needs.budgetFen ? String(Number(conversation.needs.budgetFen) / 100) : "");
      setMode("已恢复历史记录；下方展示的是当时的价格快照"); setFormKey(k => k + 1);
    } catch (e) { report(e); } finally { setBusy(false); }
  }
  async function compare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    setBusy(true); setError(""); setFeedback("");
    try {
      const id = await ensureConversation();
      const needs = {
        ...(category ? { category } : {}), ...(budget ? { budgetFen: fen(budget) } : {}),
        quantity: Number(data.get("quantity") || 1),
        minLayers: data.get("minLayers") ? Number(data.get("minLayers")) : null,
        fragranceFree: data.get("fragranceFree") === "on",
        member: yesNo(data.get("member")), firstOrder: yesNo(data.get("firstOrder")),
        baselineId: data.get("baselineId") ? String(data.get("baselineId")) : null,
      };
      const base = selectFormOverrides(needs, message, touched);
      const officialNeeds: Record<string, unknown> = Object.fromEntries(Object.entries(base).filter(([k]) => !['member','firstOrder','baselineId'].includes(k)));
      const include = (name:string) => !message.trim() || touched.includes(name);
      if (include('brands')) officialNeeds.brands = String(data.get('brands')??'').split(/[、,，]/).map(s=>s.trim()).filter(Boolean);
      if (include('regionCode')) officialNeeds.regionCode = data.get('regionCode') || null;
      if (include('allowStockpile')) officialNeeds.allowStockpile = data.get('allowStockpile') === 'on';
      if (include('maxPacks')) officialNeeds.maxPacks = data.get('maxPacks') ? Number(data.get('maxPacks')) : null;
      if (include('targetValue') || include('targetUnit')) officialNeeds.targetAmount = data.get('targetValue') ? {value:Number(data.get('targetValue')),unit:data.get('targetUnit')} : null;
      if (!message.trim() || touched.some(k=>platforms.some(p=>k.startsWith(p+'_')))) officialNeeds.eligibility = Object.fromEntries(platforms.map(p=>[p,{member:yesNo(data.get(p+'_member')),firstOrder:yesNo(data.get(p+'_firstOrder'))}]));
      const response = await request<{ recommendation?: Recommendation; shopping?:SearchOutcome; snapshotId?: string; clarification?: string; mode: string; needs?: Record<string, unknown> }>(`/api/conversations/${id}/recommend`, 'POST', { message, sourceMode, needs: sourceMode === 'official' ? officialNeeds : base });
      setMode(response.mode);
      setMessages(previous => [...previous, { role: 'user', content: message || '根据表单比较方案' }, { role: 'assistant', content: response.clarification ?? response.shopping?.warnings.join(' ') ?? response.recommendation?.explanation ?? '' }]);
      setShopping(response.shopping ?? null); setResult(response.recommendation ?? null); setSnapshotId(response.snapshotId ?? null);
      const updated = response.shopping?.needs ?? response.recommendation?.needs ?? response.needs ?? {};
      setDraftNeeds(updated);
      if (updated.category) setCategory(updated.category as Category);
      if (updated.budgetFen) setBudget(String(Number(updated.budgetFen) / 100));
      setMessage(""); setTouched([]); setFormKey(k => k + 1); await refresh();
    } catch (e) { report(e); } finally { setBusy(false); }
  }
  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setBusy(true); setError("");
    try {
      const id = await ensureConversation();
      const c = data.get("category") as Category;
      const payload = {
        name: data.get("name"), category: c, priceFen: fen(data.get("price")), shippingFen: data.get("shipping") === "" ? null : fen(data.get("shipping")),
        sourceUrl: data.get("sourceUrl"), sourceLabel: "用户提供的链接", discount: null,
        specs: { amount: Number(data.get("amount")), unit: c === "tissue" ? "draw" : c === "toilet" ? "g" : data.get("unit"),
          pack: data.get("pack"), layers: data.get("layers") ? Number(data.get("layers")) : null,
          widthMm: data.get("width") ? Number(data.get("width")) : null, heightMm: data.get("height") ? Number(data.get("height")) : null,
          concentrated: yesNo(data.get("concentrated")), fragranceFree: yesNo(data.get("fragrance")),
        },
      };
      const response = await request<{ offer: Offer }>(`/api/conversations/${id}/items`, "POST", payload);
      setItems(old => [...old, response.offer]); setMode("商品已添加，请点击「帮我选一选」重新比较。"); form.reset(); await refresh();
    } catch (e) { report(e); } finally { setBusy(false); }
  }
  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError("");
    try {
      await request(`/api/conversations/${active}/feedback`, "POST", {
        snapshotId, helpful: data.get("helpful") === "yes", reason: data.get("reason") || undefined,
        chosenId: data.get("chosenId") || undefined, paidFen: data.get("paid") ? fen(data.get("paid")) : undefined,
      });
      setFeedback("反馈已保存，谢谢你帮助我们改进。");
    } catch (e) { report(e); } finally { setBusy(false); }
  }
  async function remove(all: boolean) {
    if (!window.confirm(all ? "删除这个浏览器下的全部选购记录？此操作无法撤销。" : "删除本次选购记录？此操作无法撤销。")) return;
    setBusy(true);
    try { await request(all ? "/api/conversations" : `/api/conversations/${active}`, "DELETE"); reset(); await refresh(); }
    catch (e) { report(e); } finally { setBusy(false); }
  }
  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/"><span className="brand-mark">省</span><span>帮你省<small>SPENDWISE AI</small></span></Link>
      <span className="beta-label"><span className="dot" /> 邀请试用 · 0.1</span>
      <button className="new-chat" disabled={busy || access !== "ready"} onClick={reset}>＋ 开始新的选购</button>
      <div className="sidebar-caption">你的选购记录</div>
      <nav aria-label="选购历史" className="history">
        {history.length ? history.map(h => <button key={h.id} disabled={busy} className={active === h.id ? "selected" : ""} onClick={() => load(h.id)}><span>◷</span>{h.title}</button>) : <p>从一次小小的选择开始。</p>}
      </nav>
      <div className="sidebar-bottom"><div className="privacy-icon">◇</div><strong>好建议，也可以是暂时不买。</strong><p>优先考虑真实需求，<br />不为了凑单而多花钱。</p>
        {access === "ready" && <button className="text-button muted" disabled={busy || !history.length} onClick={() => remove(true)}>删除全部历史</button>}
      </div>
    </aside>
    <main>
      <header className="topbar"><span>你的日常消费助手</span><span className="topbar-right">透明比较 <i /> 理性消费</span></header>
      <div className="content">
        {demo && <div className="demo-banner" role="note">演示模式 · 手动比较中的示例商品不是真实报价；官方搜索不会使用示例商品补齐结果。</div>}
        {error && <div className="error" role="alert">{error}</div>}
        {access === "loading" ? <div className="loading">正在准备你的选购空间…</div> : access === "locked" ? <section className="welcome">
          <div className="eyebrow">少一点纠结，多一点值得</div><h1>把钱花在<br /><em>真正需要</em>的地方。</h1>
          <p className="lead">告诉我们你想买什么，让规格、价格和优惠变得清楚。<br />从抽纸、卷纸和洗衣液开始，把日常的小钱花明白。</p>
          <form className="access-card" onSubmit={unlock}><label htmlFor="code">输入邀请码，开启精明消费</label><div className="inline"><input id="code" name="code" autoComplete="off" placeholder="你的试用邀请码" required maxLength={100} /><button className="primary" disabled={busy}>{busy ? "验证中…" : "开始体验 →"}</button></div>
            <small>无需手机号 · 记录保留 30 天 · 仅当前浏览器可恢复</small></form>
          <div className="intro-grid">{[["01", "先问需求", "预算与偏好，决定什么适合你。"], ["02", "算清价格", "看清包装、单位价和优惠条件。"], ["03", "把选择留给你", "每个建议都有依据，不替你下单。"]].map(([n,t,d]) => <div key={n}><span>{n}</span><h3>{t}</h3><p>{d}</p></div>)}</div>
        </section> : <>
          <section className="hero"><div className="eyebrow">每一笔日常开销，都值得认真对待</div><h1>今天，想省着买点什么？</h1><p>告诉我你的需求和预算，我们一起选得更明白。</p></section>
          <div className="category-grid">{(["tissue", "toilet", "detergent"] as Category[]).map((c, index) => <button disabled={busy} key={c} className={`category ${category === c ? "active" : ""}`} onClick={() => { setCategory(c); setTouched(t => [...t, "category"]); }}>
            <span className={`product-icon icon-${c}`}>{["▤", "◉", "◧"][index]}</span><span><strong>{categoryNames[c]}</strong><small>{["每一抽都算清楚", "包装不同，也能看明白", "看规格，也看使用需求"][index]}</small></span><span className="arrow">↗</span>
          </button>)}</div>
          <section className="panel planner">
            <div className="section-heading"><h2><span className="spark">✦</span> 你的选购需求</h2><span>从需要出发</span></div>
            <form key={formKey} onSubmit={compare} onChange={e => { const target = e.target; const name = target instanceof HTMLInputElement || target instanceof HTMLSelectElement ? target.name : ""; if (name) setTouched(t => [...t, name]); }}>
              <label>比较数据来源<select aria-label="比较数据来源" value={sourceMode} onChange={e=>setSourceMode(e.target.value as 'official'|'manual')} disabled={busy}><option value="official">官方平台搜索（淘宝 / 京东 / 拼多多）</option><option value="manual">手动比较（录入报价 / 演示商品）</option></select></label>
              <label className="sr-only" htmlFor="message">描述选购需求</label>
              <textarea id="message" value={message} onChange={e => setMessage(e.target.value)} maxLength={2000} placeholder="例如：想买家里用的抽纸，预算 50 元，希望至少 3 层。" rows={3} disabled={busy} />
              <div className="form-grid">
                <label>商品品类<select aria-label="商品品类" name="category" value={category} onChange={e => setCategory(e.target.value as Category | "")}><option value="">让 AI 从描述中理解</option>{Object.entries(categoryNames).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label>总预算（元）<input aria-label="总预算（元）" name="budgetFen" type="number" min="0.01" max="10000" step="0.01" value={budget} onChange={e => setBudget(e.target.value)} placeholder="例如 50" /></label>
                <label>购买数量（整包／套）<input name="quantity" type="number" min="1" max="50" defaultValue={draftNeeds.quantity ?? 1} required /></label>
              </div>
              <details className="advanced"><summary>规格偏好与优惠资格 <span>可选</span></summary><div className="form-grid">
                <label>纸品最低层数<select name="minLayers" defaultValue={draftNeeds.minLayers ?? ""}><option value="">不限</option>{[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n} 层</option>)}</select></label>
                {sourceMode === 'manual' && <><label>已确认适用会员价<select name="member" defaultValue={draftNeeds.member === true ? "yes" : draftNeeds.member === false ? "no" : "unknown"}><option value="unknown">不确定</option><option value="yes">是</option><option value="no">否</option></select></label>
                <label>已确认适用首购价<select name="firstOrder" defaultValue={draftNeeds.firstOrder === true ? "yes" : draftNeeds.firstOrder === false ? "no" : "unknown"}><option value="unknown">不确定</option><option value="yes">是</option><option value="no">否</option></select></label>
                </>}<label className="checkbox"><input name="fragranceFree" type="checkbox" defaultChecked={draftNeeds.fragranceFree} /> 只看已明确无香的商品</label>
                <label>比较基准<select name="baselineId" defaultValue={draftNeeds.baselineId ?? ""}><option value="">不计算预计节省</option>{[...new Map([...(result?.quotes.map(q => q.offer) ?? []), ...items].map(o => [o.id, o])).values()].map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
              </div>{sourceMode === 'official' && <ShoppingPreferences needs={draftNeeds}/>}</details>
              <div className="form-footer"><span>✧ AI 理解需求，程序核算价格</span><button className="primary" disabled={busy}>{busy ? "正在处理…" : "帮我选一选 →"}</button></div>
            </form>
          </section>
          {mode && <div className="mode" role="status">{mode}</div>}
          {messages.length > 0 && <details className="conversation"><summary>查看本次对话 · {messages.length} 条</summary>{messages.map((m,i) => <div key={i} className={`chat ${m.role}`}><strong>{m.role === "user" ? "你" : "帮你省"}</strong><p>{m.content}</p></div>)}</details>}
          {!result && !shopping && messages.at(-1)?.role === "assistant" && <div className="clarification">{messages.at(-1)?.content}</div>}
          {shopping && <><ShoppingResults outcome={shopping}/><form className="panel feedback" onSubmit={submitFeedback}><h3>本次搜索对你有帮助吗？</h3><label>你的评价<select name="helpful"><option value="yes">有帮助</option><option value="no">没帮助</option></select></label><label>原因或建议<input name="reason" maxLength={500}/></label><div className="form-footer"><span role="status">{feedback}</span><button className="secondary" disabled={busy}>提交反馈</button></div></form></>}
          {result && <section className="results" aria-label="比较结果"><div className="section-heading"><h2>把选择摆在一起看</h2><span>{result.quotes.length} 个方案 · {new Date(result.createdAt).toLocaleDateString("zh-CN")}</span></div>
            <p className="result-intro">{result.explanation}</p>
            {result.quotes.length === 0 ? <div className="empty-state"><span>⌕</span><h3>暂时没有合适的方案</h3><p>保留你的标准，调整预算或补充商品后再试。</p></div> : <div className="quote-grid">{result.quotes.map((q,i) => <QuoteCard key={q.offer.id} quote={q} index={i} />)}</div>}
            {result.baseline && <p className="muted">比较基准：{result.baseline.name}。只有同规格、同含量且已核验的近期报价会显示预计节省；不代表实际支出减少。</p>}
            <form className="panel feedback" onSubmit={submitFeedback}><h3>这些建议，对你有帮助吗？</h3><div className="form-grid">
              <label>你的评价<select name="helpful"><option value="yes">有帮助</option><option value="no">没帮助</option></select></label>
              <label>最终选择（可选）<select name="chosenId"><option value="">尚未决定／暂时不买</option>{result.quotes.map(q => <option key={q.offer.id} value={q.offer.id}>{q.offer.name}</option>)}</select></label>
              <label>实际支付（元，可选）<input name="paid" type="number" min="0" max="10000" step="0.01" placeholder="购买后自愿填写" /></label>
            </div><label>原因或建议（可选）<input name="reason" maxLength={500} placeholder="有哪些信息还不够清楚？" /></label><div className="form-footer"><span role="status">{feedback}</span><button className="secondary" disabled={busy}>提交反馈</button></div></form>
          </section>}
          <details className="panel add-item"><summary>＋ 补充你正在考虑的商品 <span>链接与价格由你提供，仅用于本次选购</span></summary>
            <p className="muted">不会自动打开或抓取链接。请填写完整包装的总含量和当前所见价格；暂不录入自定义优惠，商品按所填价格比较。</p>
            <form onSubmit={addItem}><div className="form-grid">
              <label>商品名称<input name="name" required maxLength={120} placeholder="品牌与商品名称" /></label>
              <label>商品类别<select name="category">{Object.entries(categoryNames).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label>包装说明<input name="pack" required maxLength={100} placeholder="例如 100 抽 × 6 包" /></label>
              <label>包装总含量<input name="amount" type="number" min="0.01" max="1000000" step="0.01" required placeholder="如 100 抽 × 6 包填 600" /></label>
              <label>洗衣液含量单位<select name="unit"><option value="g">克（抽纸固定用抽，卷纸用克）</option><option value="ml">毫升</option></select></label>
              <label>每包／套价格（元）<input name="price" type="number" min="0.01" max="10000" step="0.01" required /></label>
              <label>整单运费（元）<input name="shipping" type="number" min="0" max="1000" step="0.01" placeholder="未知留空，包邮填 0" /></label>
              <label>纸品层数<input name="layers" type="number" min="1" max="8" placeholder="未知留空" /></label>
              <label>单张宽（毫米）<input name="width" type="number" min="1" max="1000" placeholder="未知留空" /></label>
              <label>单张长（毫米）<input name="height" type="number" min="1" max="1000" placeholder="未知留空" /></label>
              <label>浓缩洗衣液<select name="concentrated"><option value="">不确定／不适用</option><option value="yes">是</option><option value="no">否</option></select></label>
              <label>是否无香<select name="fragrance"><option value="">不确定</option><option value="yes">是</option><option value="no">否</option></select></label>
            </div><label>商品链接<input name="sourceUrl" type="url" required maxLength={2000} placeholder="https://…" /></label>
              <div className="form-footer"><span>{items.length} / 10 个补充商品 · 未经核验</span><button className="secondary" disabled={busy || items.length >= 10}>添加商品</button></div>
            </form>{items.map(o => <div className="user-item" key={o.id}>{o.name}<span>¥{money(o.priceFen)} · {o.specs.pack}</span></div>)}
          </details>
          {active && <button className="text-button muted delete-current" disabled={busy} onClick={() => remove(false)}>删除本次选购记录</button>}
          <footer>价格以购买页面为准。记录保留 30 天，可随时删除。<br />帮你省不会替你下单，也不会因为你暂时不买而少帮一点忙。</footer>
        </>}
      </div>
    </main>
  </div>;
}
function QuoteCard({ quote: q, index }: { quote: Quote; index: number }) {
  const o = q.offer;
  return <article className={`quote-card ${index === 0 ? "first" : ""}`}>
    <div className="quote-top"><span className="tag">{q.totalFen === null ? "条件待确认" : q.stale ? "报价待复核" : index === 0 ? "优先看看" : "备选方案"}</span><span className="quote-number">0{index + 1}</span></div>
    <div className={`quote-illustration ${o.category}`} aria-hidden="true">{o.category === "tissue" ? "▤" : o.category === "toilet" ? "◉" : "◧"}</div>
    <h3>{o.name}</h3><p className="pack">{o.specs.pack} × {q.quantity}</p>
    <div className="price"><span>¥</span>{money(q.totalFen ?? q.knownCostFen)}<small>{q.totalFen === null ? "已知费用，非最终到手价" : "本方案总价"}</small></div>
    <div className="unit-price">{q.unitPriceFen !== null ? `约 ¥${money(q.unitPriceFen)} / ${q.unitLabel}` : "条件确认后计算单位价"}</div>
    <dl><div><dt>商品小计</dt><dd>¥{money(q.subtotalFen)}</dd></div><div><dt>确认适用的优惠</dt><dd>− ¥{money(q.discountFen)}</dd></div><div><dt>整单运费</dt><dd>{o.shippingFen === null ? "待确认" : `¥${money(o.shippingFen)}`}</dd></div>
      {o.specs.layers && <div><dt>纸张规格</dt><dd>{o.specs.layers} 层 · {o.specs.widthMm ?? "?"} × {o.specs.heightMm ?? "?"} mm</dd></div>}
      {o.category === "detergent" && <div><dt>浓缩程度</dt><dd>{o.specs.concentrated === null ? "未知" : o.specs.concentrated ? "浓缩" : "普通"}</dd></div>}
    </dl>
    {o.discount && <p className="discount-note">满 ¥{money(o.discount.thresholdFen)} 减 ¥{money(o.discount.reductionFen)} · {o.discount.eligibility === "all" ? "所有用户" : o.discount.eligibility === "member" ? "限适用会员" : "限适用首购"}</p>}
    {q.savingsFen !== null && <div className="savings">相对所选基准预计节省 ¥{money(q.savingsFen)}</div>}
    <div className="notices">{[...q.pending, ...q.notices].map(n => <p key={n}>{n}</p>)}</div>
    <div className="source"><span>{o.provenance === "verified" ? "核验" : "录入"}于 {new Date(o.verifiedAt).toLocaleDateString("zh-CN")}</span>
      {o.provenance === "demo" ? <span>示例来源 · 无购买链接</span> : <a href={o.sourceUrl} target="_blank" rel="noopener noreferrer">查看来源 ↗</a>}</div>
  </article>;
}
