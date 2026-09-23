"use client"

import { useEffect, useMemo, useState } from "react"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"
import { useViewMode } from "@/components/ViewModeContext"
import { fmtMoneyInput, parseNum } from "@/lib/num"

interface Account {
  id: number; name: string; kind: string; institution: string; purpose: string
  card_id: number | null; scope: "self" | "joint"
}
interface Flow {
  id: number; from_id: number; to_id: number; kind: string
  amount: number | null; day_of_month: number | null; memo: string
}

const KIND_LABEL: Record<string, { label: string; icon: string }> = {
  income: { label: "収入源", icon: "💴" },
  bank: { label: "銀行口座", icon: "🏦" },
  securities: { label: "証券口座", icon: "📈" },
  card: { label: "クレジットカード", icon: "💳" },
  wallet: { label: "電子マネー", icon: "📱" },
  cash: { label: "現金", icon: "💵" },
}
const FLOW_LABEL: Record<string, { label: string; color: string; dash?: string }> = {
  salary: { label: "給与・収入", color: "#22c55e" },
  transfer: { label: "振替・入金", color: "#60a5fa" },
  debit: { label: "引き落とし", color: "#fb7185", dash: "6 4" },
  invest: { label: "積立・投資", color: "#a78bfa" },
}

// 図の列：収入源 → 個人の口座 → 共同の口座 → 支払い（カード・電子マネー）
const COLUMNS = [
  { key: "income", title: "収入源" },
  { key: "self", title: "個人の口座" },
  { key: "joint", title: "共同の口座" },
  { key: "pay", title: "支払い（カード等）" },
] as const

function columnOf(a: Account): number {
  if (a.kind === "income") return 0
  if (a.kind === "card" || a.kind === "wallet") return 3
  return a.scope === "joint" ? 2 : 1
}

const NODE_W = 190
const NODE_H = 58
const COL_GAP = 90
const ROW_GAP = 18
const TOP = 44

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`

export default function MoneyMapPage() {
  const { mode } = useViewMode()
  const isPC = mode === "pc"
  const [accounts, setAccounts] = useState<Account[]>([])
  const [flows, setFlows] = useState<Flow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<number | null>(null)
  const [msg, setMsg] = useState("")

  async function load() {
    setLoading(true)
    try {
      const d = await fetch("/api/money-map").then(r => r.json())
      setAccounts(d.accounts ?? [])
      setFlows((d.flows ?? []).map((f: Flow) => ({ ...f, amount: f.amount == null ? null : Number(f.amount) })))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(""), 2500) }

  // ── 図の配置 ──────────────────────────────────────────
  const layout = useMemo(() => {
    const cols: Account[][] = [[], [], [], []]
    for (const a of accounts) cols[columnOf(a)].push(a)
    const pos = new Map<number, { x: number; y: number }>()
    cols.forEach((list, ci) => {
      list.forEach((a, ri) => {
        pos.set(a.id, { x: 20 + ci * (NODE_W + COL_GAP), y: TOP + ri * (NODE_H + ROW_GAP) })
      })
    })
    const rows = Math.max(1, ...cols.map(c => c.length))
    return {
      pos,
      width: 40 + 4 * NODE_W + 3 * COL_GAP,
      height: TOP + rows * (NODE_H + ROW_GAP) + 10,
    }
  }, [accounts])

  // 流れの集計（口座ごとの出入り）
  const flowStats = useMemo(() => {
    const m = new Map<number, { in: number; out: number; count: number }>()
    for (const a of accounts) m.set(a.id, { in: 0, out: 0, count: 0 })
    for (const f of flows) {
      const from = m.get(f.from_id), to = m.get(f.to_id)
      if (from) { from.out += f.amount ?? 0; from.count++ }
      if (to) { to.in += f.amount ?? 0; to.count++ }
    }
    return m
  }, [accounts, flows])

  // 整理のヒント
  const hints = useMemo(() => {
    const out: string[] = []
    const unused = accounts.filter(a => a.kind !== "income" && (flowStats.get(a.id)?.count ?? 0) === 0)
    if (unused.length > 0) {
      out.push(`お金の流れがつながっていない口座が${unused.length}件あります（${unused.map(a => a.name).join("、")}）。流れを登録するか、使っていなければ解約・統合の候補です`)
    }
    const byInst = new Map<string, Account[]>()
    for (const a of accounts) {
      const k = a.institution.trim()
      if (!k || a.kind === "income") continue
      byInst.set(k, [...(byInst.get(k) ?? []), a])
    }
    for (const [inst, list] of byInst) {
      if (list.length >= 2) out.push(`${inst}に${list.length}つの口座があります。用途が重なっていれば1つにまとめられるかもしれません`)
    }
    const noPurpose = accounts.filter(a => a.kind !== "income" && !a.purpose.trim())
    if (noPurpose.length > 0) {
      out.push(`用途が未入力の口座が${noPurpose.length}件あります。「生活費」「貯蓄」「引き落とし用」のように役割を決めると、整理の判断がしやすくなります`)
    }
    const banks = accounts.filter(a => a.kind === "bank")
    if (banks.length >= 5) {
      out.push(`銀行口座が${banks.length}つあります。役割ごとに「入ってくる口座」「使う口座」「貯める口座」の3つ程度に絞ると管理が楽になります`)
    }
    return out
  }, [accounts, flowStats])

  const unlinkedCardsExist = accounts.length === 0

  async function importCards() {
    const res = await fetch("/api/money-map", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "import_cards" }),
    })
    const d = await res.json()
    flash(`${d.added ?? 0}件の口座を取り込みました`)
    await load()
  }

  const sel = accounts.find(a => a.id === selected) ?? null

  return (
    <div className={isPC ? "" : "pb-20"}>
      <PageHeader title="口座マップ" />
      <main className={isPC ? "max-w-6xl mx-auto px-6 py-4 space-y-3" : "max-w-md mx-auto px-4 py-2 space-y-3"}>
        <p className="text-xs text-slate-400">
          個人と共同の口座を並べ、給与の振込・口座間の振替・カードの引き落としといったお金の流れを線で表します。
          相手の個人口座は表示されません
        </p>
        {msg && <p className="text-xs text-green-400">{msg}</p>}

        {loading ? (
          <p className="text-sm text-slate-500 text-center py-8">読み込み中...</p>
        ) : (
          <>
            {unlinkedCardsExist && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 flex items-center gap-3">
                <p className="text-xs text-blue-200 flex-1">
                  家計簿に登録済みの口座・カードをまとめて取り込めます。貯蓄用口座や証券口座などは、そのあと下から追加してください
                </p>
                <button onClick={importCards}
                  className="text-xs bg-blue-600 text-white rounded-lg px-3 py-2 font-semibold shrink-0">取り込む</button>
              </div>
            )}

            {!unlinkedCardsExist && (
              <div className="flex justify-end">
                <button onClick={importCards} className="text-[11px] text-slate-400 hover:text-blue-400 underline">
                  家計簿に追加した口座を取り込む（取り込み済みは飛ばします）
                </button>
              </div>
            )}

            {/* 図 */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 overflow-x-auto">
              <svg width={layout.width} height={layout.height} className="block">
                <defs>
                  {Object.entries(FLOW_LABEL).map(([k, v]) => (
                    <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5"
                      markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill={v.color} />
                    </marker>
                  ))}
                </defs>

                {COLUMNS.map((c, ci) => (
                  <text key={c.key} x={20 + ci * (NODE_W + COL_GAP) + NODE_W / 2} y={22}
                    textAnchor="middle" fontSize="12" fill="#94a3b8" fontWeight={600}>
                    {c.title}
                  </text>
                ))}

                {/* 線 */}
                {flows.map(f => {
                  const a = layout.pos.get(f.from_id), b = layout.pos.get(f.to_id)
                  if (!a || !b) return null
                  const forward = b.x > a.x
                  const x1 = forward ? a.x + NODE_W : a.x
                  const x2 = forward ? b.x : b.x + NODE_W
                  const y1 = a.y + NODE_H / 2, y2 = b.y + NODE_H / 2
                  const dx = forward ? Math.max(40, (x2 - x1) / 2) : -60
                  const d = forward
                    ? `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
                    : `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
                  const style = FLOW_LABEL[f.kind] ?? FLOW_LABEL.transfer
                  const dim = selected !== null && f.from_id !== selected && f.to_id !== selected
                  const label = [f.amount ? yen(f.amount) : "", f.day_of_month ? `${f.day_of_month}日` : ""].filter(Boolean).join(" · ")
                  return (
                    <g key={f.id} opacity={dim ? 0.15 : 1}>
                      <path d={d} fill="none" stroke={style.color} strokeWidth={2}
                        strokeDasharray={style.dash} markerEnd={`url(#arrow-${f.kind})`} />
                      {label && (
                        <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle"
                          fontSize="10.5" fill={style.color} fontWeight={600}
                          style={{ paintOrder: "stroke", stroke: "#0f172a", strokeWidth: 4 }}>
                          {label}
                        </text>
                      )}
                    </g>
                  )
                })}

                {/* 口座 */}
                {accounts.map(a => {
                  const p = layout.pos.get(a.id)!
                  const joint = a.scope === "joint"
                  const k = KIND_LABEL[a.kind] ?? KIND_LABEL.bank
                  const active = selected === a.id
                  const stats = flowStats.get(a.id)
                  return (
                    <g key={a.id} transform={`translate(${p.x},${p.y})`} style={{ cursor: "pointer" }}
                      onClick={() => setSelected(active ? null : a.id)}>
                      <rect width={NODE_W} height={NODE_H} rx={10}
                        fill={active ? "#1e293b" : "#0f172a"}
                        stroke={a.kind === "income" ? "#22c55e" : joint ? "#f59e0b" : "#818cf8"}
                        strokeWidth={active ? 2.5 : 1.5}
                        strokeDasharray={(stats?.count ?? 0) === 0 && a.kind !== "income" ? "4 3" : undefined} />
                      <text x={12} y={22} fontSize="13" fill="#f1f5f9" fontWeight={600}>
                        {k.icon} {a.name.length > 12 ? a.name.slice(0, 12) + "…" : a.name}
                      </text>
                      <text x={12} y={42} fontSize="10.5" fill="#94a3b8">
                        {(a.purpose || k.label).slice(0, 16)}
                      </text>
                      {a.kind !== "income" && (
                        <text x={NODE_W - 10} y={42} fontSize="10" textAnchor="end"
                          fill={joint ? "#fbbf24" : "#a5b4fc"}>
                          {joint ? "共同" : "個人"}
                        </text>
                      )}
                    </g>
                  )
                })}
              </svg>
            </div>

            <div className="flex flex-wrap gap-3 text-[11px] text-slate-400 px-1">
              {Object.entries(FLOW_LABEL).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1">
                  <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke={v.color} strokeWidth="2" strokeDasharray={v.dash} /></svg>
                  {v.label}
                </span>
              ))}
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded border border-indigo-400" /> 個人</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded border border-amber-400" /> 共同</span>
              <span className="text-slate-500">点線の枠＝流れがつながっていない口座。口座をタップすると、その口座の流れだけを強調します</span>
            </div>

            {/* 整理のヒント */}
            {hints.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-amber-300">整理のヒント</p>
                {hints.map((h, i) => <p key={i} className="text-xs text-slate-300">・{h}</p>)}
              </div>
            )}

            <div className={isPC ? "grid grid-cols-2 gap-3 items-start" : "space-y-3"}>
              <AccountEditor accounts={accounts} selected={sel} onSelect={setSelected} onChanged={load} flash={flash} />
              <FlowEditor accounts={accounts} flows={flows} selected={selected} onChanged={load} flash={flash} />
            </div>
          </>
        )}
      </main>
      <BottomNav />
    </div>
  )
}

const INPUT = "w-full bg-slate-900 text-slate-100 border border-slate-700 rounded-lg px-2 py-2 text-sm"

function AccountEditor({ accounts, selected, onSelect, onChanged, flash }: {
  accounts: Account[]; selected: Account | null
  onSelect: (id: number | null) => void; onChanged: () => Promise<void>; flash: (t: string) => void
}) {
  const empty = { name: "", kind: "bank", scope: "self", institution: "", purpose: "" }
  const [f, setF] = useState<typeof empty & { id?: number }>(empty)

  useEffect(() => {
    if (selected) setF({ id: selected.id, name: selected.name, kind: selected.kind, scope: selected.scope, institution: selected.institution, purpose: selected.purpose })
    else setF(empty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  async function save() {
    if (!f.name.trim()) return
    const res = await fetch("/api/money-map", {
      method: f.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    })
    if (!res.ok) { flash("保存に失敗しました"); return }
    flash(f.id ? "口座を更新しました" : "口座を追加しました")
    setF(empty); onSelect(null)
    await onChanged()
  }

  async function remove() {
    if (!f.id || !confirm(`「${f.name}」を図から削除しますか？（この口座につながる流れも消えます）`)) return
    await fetch(`/api/money-map?id=${f.id}`, { method: "DELETE" })
    setF(empty); onSelect(null)
    await onChanged()
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
      <h2 className="text-sm font-semibold text-slate-200">{f.id ? "口座を編集" : "口座を追加"}</h2>
      <input className={INPUT} placeholder="名前（例：住信SBI 目的別口座）" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <select className={INPUT} value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>
          {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
        </select>
        <select className={INPUT} value={f.scope} onChange={e => setF({ ...f, scope: e.target.value })} disabled={!!f.id}>
          <option value="self">個人</option>
          <option value="joint">共同</option>
        </select>
        <input className={INPUT} placeholder="金融機関（例：楽天銀行）" value={f.institution} onChange={e => setF({ ...f, institution: e.target.value })} />
        <input className={INPUT} placeholder="用途（例：生活費・貯蓄）" value={f.purpose} onChange={e => setF({ ...f, purpose: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={!f.name.trim()}
          className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-40">
          {f.id ? "更新" : "追加"}
        </button>
        {f.id && (
          <>
            <button onClick={() => { setF(empty); onSelect(null) }} className="px-3 border border-slate-700 text-slate-400 rounded-lg text-sm">取消</button>
            <button onClick={remove} className="px-3 border border-red-900 text-red-400 rounded-lg text-sm">削除</button>
          </>
        )}
      </div>
      <p className="text-[11px] text-slate-500">図の口座をタップすると、ここで編集できます。{accounts.length}件登録済み</p>
    </div>
  )
}

function FlowEditor({ accounts, flows, selected, onChanged, flash }: {
  accounts: Account[]; flows: Flow[]; selected: number | null
  onChanged: () => Promise<void>; flash: (t: string) => void
}) {
  const [f, setF] = useState({ from_id: "", to_id: "", kind: "transfer", amount: "", day_of_month: "", memo: "" })
  const nameOf = (id: number) => accounts.find(a => a.id === id)?.name ?? "?"

  useEffect(() => {
    if (selected) setF(prev => ({ ...prev, from_id: String(selected) }))
  }, [selected])

  async function add() {
    if (!f.from_id || !f.to_id || f.from_id === f.to_id) return
    const res = await fetch("/api/money-map", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "flow", ...f, amount: parseNum(f.amount) || null }),
    })
    if (!res.ok) { flash("追加に失敗しました"); return }
    flash("流れを追加しました")
    setF({ ...f, to_id: "", amount: "", memo: "" })
    await onChanged()
  }

  async function remove(id: number) {
    if (!confirm("この流れを削除しますか？")) return
    await fetch(`/api/money-map?id=${id}&type=flow`, { method: "DELETE" })
    await onChanged()
  }

  const visible = selected ? flows.filter(x => x.from_id === selected || x.to_id === selected) : flows

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
      <h2 className="text-sm font-semibold text-slate-200">お金の流れを追加</h2>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
        <select className={INPUT} value={f.from_id} onChange={e => setF({ ...f, from_id: e.target.value })}>
          <option value="">出る側</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <span className="text-slate-500">→</span>
        <select className={INPUT} value={f.to_id} onChange={e => setF({ ...f, to_id: e.target.value })}>
          <option value="">入る側</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <select className={INPUT} value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>
          {Object.entries(FLOW_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input className={`${INPUT} text-right`} inputMode="numeric" placeholder="金額（任意）"
          value={f.amount} onChange={e => setF({ ...f, amount: fmtMoneyInput(e.target.value) })} />
        <input className={`${INPUT} text-right`} inputMode="numeric" placeholder="毎月◯日"
          value={f.day_of_month} onChange={e => setF({ ...f, day_of_month: e.target.value.replace(/[^0-9]/g, "") })} />
      </div>
      <input className={INPUT} placeholder="メモ（例：生活費の振替）" value={f.memo} onChange={e => setF({ ...f, memo: e.target.value })} />
      <button onClick={add} disabled={!f.from_id || !f.to_id || f.from_id === f.to_id}
        className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-40">追加</button>
      <p className="text-[11px] text-slate-500">
        カードの引き落としは「銀行口座 → カード」の向きで登録します（お金が出ていく向き）
      </p>

      <div className="pt-2 border-t border-slate-800 space-y-1 max-h-72 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="text-xs text-slate-500">まだ流れがありません</p>
        ) : visible.map(x => {
          const st = FLOW_LABEL[x.kind] ?? FLOW_LABEL.transfer
          return (
            <div key={x.id} className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: st.color }} />
              <span className="text-slate-300 flex-1 min-w-0 truncate">
                {nameOf(x.from_id)} → {nameOf(x.to_id)}
                <span className="text-slate-500 ml-1.5">
                  {st.label}{x.amount ? ` · ${yen(x.amount)}` : ""}{x.day_of_month ? ` · ${x.day_of_month}日` : ""}{x.memo ? ` · ${x.memo}` : ""}
                </span>
              </span>
              <button onClick={() => remove(x.id)} className="text-slate-600 hover:text-red-400 text-base leading-none">×</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
