"use client"

import { useEffect, useState, useMemo, useCallback, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"
import { useViewMode } from "@/components/ViewModeContext"
import { LIFE_EVENT_TEMPLATES, STREAM_TEMPLATES } from "@/lib/lifeEventTemplates"
import { toMan, fmtMan, manToYen, yenToManStr } from "@/lib/money"
import { LifePlanTools, type ToolRow, type PayslipHints } from "@/components/LifePlanTools"
import { SaveButton } from "@/components/SaveButton"
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from "recharts"

// ─── 型 ─────────────────────────────────────────────────────────
interface Settings {
  start_year: number
  years: number
  inflation_rate: number
  return_rate: number
  initial_savings: number
  initial_investment: number
}
interface Member { id: number; name: string; birth_year: number; relation: string }
interface Stream {
  id: number; kind: "income" | "expense"; name: string; annual_amount: number
  start_year: number | null; end_year: number | null; growth_rate: number | null; note: string
}
interface LifeEvent {
  id: number; year: number; name: string; category: string; kind: "income" | "expense"
  amount: number; repeat_years: number; inflate: boolean; member_id: number | null; note: string
}
interface ActualHints { annualExpense: number; annualIncome: number; savings: number; investment: number; nisaAnnual?: number }

interface CashRow {
  year: number
  ages: { member: Member; age: number }[]
  events: LifeEvent[]
  income: number
  expense: number
  net: number
  balance: number
}

type Tab = "cashflow" | "events" | "streams" | "tools" | "settings"

const CATEGORY_COLORS: Record<string, string> = {
  教育: "bg-blue-500/15 text-blue-300",
  住宅: "bg-amber-500/15 text-amber-300",
  車: "bg-purple-500/15 text-purple-300",
  結婚: "bg-pink-500/15 text-pink-300",
  出産: "bg-pink-500/15 text-pink-300",
  旅行: "bg-teal-500/15 text-teal-300",
  介護: "bg-orange-500/15 text-orange-300",
  その他: "bg-slate-700 text-slate-300",
}

const INPUT_CLS =
  "border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm bg-slate-900 text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"

export default function LifePlanPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500 text-sm">読み込み中...</div>}>
      <LifePlanContent />
    </Suspense>
  )
}

function LifePlanContent() {
  const { mode } = useViewMode()
  const isPC = mode === "pc"
  const searchParams = useSearchParams()
  const router = useRouter()
  const thisYear = new Date().getFullYear()

  // ライフプランは世帯単位で立てるものなので既定は「共同」
  const [scope, setScopeState] = useState<"self" | "joint">(
    (searchParams.get("ct") as "self" | "joint" | null) ?? "joint"
  )
  const [tab, setTabState] = useState<Tab>((searchParams.get("tab") as Tab | null) ?? "cashflow")

  function syncUrl(key: string, v: string) {
    const p = new URLSearchParams(searchParams.toString())
    p.set(key, v)
    router.replace(`?${p.toString()}`, { scroll: false })
  }
  function setScope(v: "self" | "joint") { setScopeState(v); syncUrl("ct", v) }
  function setTab(v: Tab) { setTabState(v); syncUrl("tab", v) }

  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [streams, setStreams] = useState<Stream[]>([])
  const [events, setEvents] = useState<LifeEvent[]>([])
  const [tools, setTools] = useState<ToolRow[]>([])
  const [hints, setHints] = useState<ActualHints | null>(null)
  const [payslipHints, setPayslipHints] = useState<PayslipHints | null>(null)
  const [msg, setMsg] = useState("")

  const focusAndSelect = useCallback((el: HTMLInputElement | null) => {
    if (el) { el.focus(); el.select() }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetch(`/api/lifeplan?card_type=${scope}`).then(r => r.json())
      setSettings(d.settings ? {
        start_year: Number(d.settings.start_year),
        years: Number(d.settings.years),
        inflation_rate: Number(d.settings.inflation_rate),
        return_rate: Number(d.settings.return_rate),
        initial_savings: Number(d.settings.initial_savings),
        initial_investment: Number(d.settings.initial_investment),
      } : null)
      setMembers((d.members ?? []).map((m: Member) => ({ ...m, birth_year: Number(m.birth_year) })))
      setStreams((d.streams ?? []).map((s: Stream) => ({
        ...s,
        annual_amount: Number(s.annual_amount),
        start_year: s.start_year == null ? null : Number(s.start_year),
        end_year: s.end_year == null ? null : Number(s.end_year),
        growth_rate: s.growth_rate == null ? null : Number(s.growth_rate),
      })))
      setEvents((d.events ?? []).map((e: LifeEvent) => ({
        ...e,
        year: Number(e.year),
        amount: Number(e.amount),
        repeat_years: Number(e.repeat_years),
        member_id: e.member_id == null ? null : Number(e.member_id),
      })))
      setTools((d.tools ?? []).map((t: ToolRow) => ({
        ...t,
        member_id: t.member_id == null ? null : Number(t.member_id),
      })))
      setHints(d.actualHints ?? null)
      setPayslipHints(d.payslipHints ?? null)
    } finally {
      setLoading(false)
    }
  }, [scope])

  useEffect(() => { load() }, [load])

  function flash(text: string) {
    setMsg(text)
    setTimeout(() => setMsg(""), 2500)
  }

  // ─── キャッシュフロー計算 ────────────────────────────────────
  // 標準的なFPのキャッシュフロー表と同じ考え方で計算する。
  //   年間収支 = 収入合計 − 支出合計
  //   資産残高 = 前年残高 ×(1+運用利回り) + 年間収支
  // 金額は「現在の物価での金額」で登録し、経過年数ぶんの上昇率を掛けて将来価値に直す。
  const cashFlow = useMemo<CashRow[]>(() => {
    if (!settings) return []
    const infl = settings.inflation_rate / 100
    const ret = settings.return_rate / 100
    let balance = settings.initial_savings + settings.initial_investment
    const rows: CashRow[] = []

    for (let i = 0; i < settings.years; i++) {
      const year = settings.start_year + i
      let income = 0
      let expense = 0

      for (const s of streams) {
        if (s.start_year != null && year < s.start_year) continue
        if (s.end_year != null && year > s.end_year) continue
        // 上昇率が未設定なら、支出は物価上昇率・収入は据え置き（昇給を見込まない保守側）
        const g = s.growth_rate != null ? s.growth_rate / 100 : (s.kind === "income" ? 0 : infl)
        const amt = s.annual_amount * Math.pow(1 + g, i)
        if (s.kind === "income") income += amt
        else expense += amt
      }

      const yearEvents: LifeEvent[] = []
      for (const e of events) {
        if (year < e.year || year >= e.year + e.repeat_years) continue
        const amt = e.inflate ? e.amount * Math.pow(1 + infl, i) : e.amount
        if (e.kind === "income") income += amt
        else expense += amt
        yearEvents.push(e)
      }

      const net = income - expense
      balance = balance * (1 + ret) + net

      rows.push({
        year,
        ages: members.map(m => ({ member: m, age: year - m.birth_year })),
        events: yearEvents,
        income,
        expense,
        net,
        balance,
      })
    }
    return rows
  }, [settings, streams, events, members])

  // 資金ショート（残高がマイナスになる最初の年）と、期間中の最低残高
  const shortfall = useMemo(() => cashFlow.find(r => r.balance < 0) ?? null, [cashFlow])
  const trough = useMemo(() => {
    if (cashFlow.length === 0) return null
    return cashFlow.reduce((min, r) => (r.balance < min.balance ? r : min), cashFlow[0])
  }, [cashFlow])

  const chartData = useMemo(
    () => cashFlow.map(r => ({
      year: String(r.year),
      収入: toMan(r.income),
      支出: toMan(r.expense),
      資産残高: toMan(r.balance),
    })),
    [cashFlow]
  )

  // ─── 保存系 ──────────────────────────────────────────────────
  async function saveSettings(next: Settings) {
    const res = await fetch("/api/lifeplan", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...next, card_type: scope }),
    })
    if (!res.ok) throw new Error("保存に失敗しました")
    setSettings(next)
  }

  async function initSettings() {
    const next: Settings = {
      start_year: thisYear,
      years: 40,
      inflation_rate: 1,
      return_rate: 3,
      initial_savings: hints?.savings ?? 0,
      initial_investment: hints?.investment ?? 0,
    }
    await saveSettings(next)
    flash("ライフプランを作成しました")
  }

  const ScopeBanner = (
    <div className={`rounded-xl p-3 border-2 flex items-center justify-between gap-3 ${
      scope === "joint" ? "bg-amber-500/10 border-amber-500/40" : "bg-indigo-500/10 border-indigo-500/40"
    }`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-lg shrink-0">{scope === "joint" ? "👥" : "👤"}</span>
        <div className="min-w-0">
          <p className={`text-sm font-bold ${scope === "joint" ? "text-amber-300" : "text-indigo-300"}`}>
            {scope === "joint" ? "共同" : "個人"}のライフプラン
          </p>
          <p className="text-[11px] text-slate-500">
            {scope === "joint"
              ? "世帯全体の資金計画。相手にも見えます"
              : "自分だけのライフプラン。相手には見えません"}
          </p>
        </div>
      </div>
      <div className="flex rounded-lg bg-slate-800 p-0.5 shrink-0">
        {([["self", "個人"], ["joint", "共同"]] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setScope(k)}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
              scope === k
                ? k === "self" ? "bg-slate-900 text-indigo-400 shadow-sm" : "bg-slate-900 text-amber-400 shadow-sm"
                : "text-slate-500"
            }`}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className={isPC ? "" : "pb-20"}>
      <PageHeader title="ライフプラン" />
      <main className={isPC ? "max-w-6xl mx-auto px-6 py-4 space-y-3" : "max-w-md mx-auto px-4 py-2 space-y-3"}>
        {ScopeBanner}

        {msg && (
          <div className="bg-green-500/10 text-green-300 text-xs rounded-lg px-3 py-2">✅ {msg}</div>
        )}

        {loading ? (
          <p className="text-center text-slate-500 text-sm py-12">読み込み中...</p>
        ) : !settings ? (
          <OnboardingCard hints={hints} onStart={initSettings} scope={scope} />
        ) : (
          <>
            {/* タブ */}
            <div className="flex rounded-xl bg-slate-800 p-1 gap-0.5 overflow-x-auto">
              {([
                ["cashflow", "📊 キャッシュフロー"],
                ["events", "🎯 ライフイベント"],
                ["streams", "💰 収入・支出"],
                ["tools", "🧮 ツール"],
                ["settings", "⚙️ 前提条件"],
              ] as const).map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`flex-1 whitespace-nowrap py-2 px-2 rounded-lg text-xs font-semibold transition-colors ${
                    tab === k ? "bg-slate-900 shadow-sm text-blue-400" : "text-slate-400"
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            {tab === "cashflow" && (
              <CashFlowTab
                rows={cashFlow} chartData={chartData} shortfall={shortfall} trough={trough}
                members={members} settings={settings} isPC={isPC}
              />
            )}
            {tab === "events" && (
              <EventsTab
                events={events} members={members} settings={settings} scope={scope}
                onChanged={load} flash={flash} focusAndSelect={focusAndSelect}
              />
            )}
            {tab === "streams" && (
              <StreamsTab
                streams={streams} settings={settings} scope={scope} hints={hints}
                onChanged={load} flash={flash} focusAndSelect={focusAndSelect}
              />
            )}
            {tab === "tools" && (
              <LifePlanTools
                settings={settings} members={members} streams={streams} events={events}
                tools={tools} scope={scope} onChanged={load} flash={flash}
                payslipHints={payslipHints}
                nisaAnnual={hints?.nisaAnnual ?? 0}
                currentInvestment={settings.initial_investment}
              />
            )}
            {tab === "settings" && (
              <SettingsTab
                settings={settings} members={members} hints={hints} scope={scope}
                onSave={saveSettings} onChanged={load} flash={flash} focusAndSelect={focusAndSelect}
              />
            )}
          </>
        )}
      </main>
      <BottomNav />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 初回セットアップ
// ═══════════════════════════════════════════════════════════════
function OnboardingCard({ hints, onStart, scope }: {
  hints: ActualHints | null; onStart: () => void; scope: string
}) {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-100 mb-1">ライフプランを作る</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          将来の収入・支出とライフイベント（進学・住宅・車・老後など）を並べて、
          数十年先まで「お金が持つか」を試算します。
          家計簿が<span className="text-slate-200 font-semibold">過去の記録</span>なら、
          ライフプランは<span className="text-slate-200 font-semibold">将来の設計図</span>です。
        </p>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 space-y-2">
        <p className="text-xs font-semibold text-blue-300">キャッシュフロー表でわかること</p>
        <ul className="text-[11px] text-blue-200/80 space-y-1 leading-relaxed">
          <li>・ <span className="font-semibold">資金がショートする年</span>が事前にわかる（一番の価値）</li>
          <li>・ 教育費のピークと住宅ローンが重なる「家計の谷」が見える</li>
          <li>・ 「あと月いくら貯めれば足りるか」が逆算できる</li>
          <li>・ 運用利回りや働く年数を変えたときの効果を比較できる</li>
        </ul>
      </div>

      {hints && (hints.annualExpense > 0 || hints.savings > 0) && (
        <div className="bg-slate-800 rounded-lg p-3">
          <p className="text-[11px] text-slate-400 mb-1.5">この家計簿の実績から、初期値を自動でセットします</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-slate-500">直近1年の支出</span><br />
              <span className="text-slate-100 font-semibold">{fmtMan(hints.annualExpense)}万円</span></div>
            <div><span className="text-slate-500">直近1年の収入</span><br />
              <span className="text-slate-100 font-semibold">{fmtMan(hints.annualIncome)}万円</span></div>
            <div><span className="text-slate-500">預貯金</span><br />
              <span className="text-slate-100 font-semibold">{fmtMan(hints.savings)}万円</span></div>
            <div><span className="text-slate-500">投資資産</span><br />
              <span className="text-slate-100 font-semibold">{fmtMan(hints.investment)}万円</span></div>
          </div>
        </div>
      )}

      <button onClick={onStart}
        className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors">
        {scope === "joint" ? "共同" : "個人"}のライフプランを作成する
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// キャッシュフロー表
// ═══════════════════════════════════════════════════════════════
function CashFlowTab({ rows, chartData, shortfall, trough, members, settings, isPC }: {
  rows: CashRow[]
  chartData: { year: string; 収入: number; 支出: number; 資産残高: number }[]
  shortfall: CashRow | null
  trough: CashRow | null
  members: Member[]
  settings: Settings
  isPC: boolean
}) {
  if (rows.length === 0) {
    return <p className="text-center text-slate-500 text-sm py-10">前提条件を設定してください</p>
  }

  const last = rows[rows.length - 1]

  return (
    <div className="space-y-3">
      {/* 診断結果 */}
      {shortfall ? (
        <div className="bg-red-500/10 border-2 border-red-500/40 rounded-xl p-4">
          <p className="text-sm font-bold text-red-300 mb-1">
            ⚠️ {shortfall.year}年に資金がショートします
          </p>
          <p className="text-xs text-red-200/80 leading-relaxed">
            この年の資産残高が <span className="font-bold">{fmtMan(shortfall.balance)}万円</span> とマイナスになります。
            {members.length > 0 && (
              <>（{shortfall.ages.map(a => `${a.member.name} ${a.age}歳`).join(" / ")}）</>
            )}
            <br />
            収入を増やす・支出を見直す・イベントの時期をずらす・運用利回りを上げる、のいずれかで解消できないか
            「前提条件」タブで数字を変えて試してみてください。
          </p>
        </div>
      ) : (
        <div className="bg-green-500/10 border-2 border-green-500/40 rounded-xl p-4">
          <p className="text-sm font-bold text-green-300 mb-1">
            ✅ {settings.start_year + settings.years - 1}年まで資金は持ちます
          </p>
          <p className="text-xs text-green-200/80 leading-relaxed">
            期間中の最低残高は {trough && <span className="font-bold">{trough.year}年の{fmtMan(trough.balance)}万円</span>}、
            最終年の残高は <span className="font-bold">{fmtMan(last.balance)}万円</span> です。
            最低残高が生活費の半年分（目安）を下回る場合は余裕が少ない状態なので、注意して見てください。
          </p>
        </div>
      )}

      {/* サマリーカード */}
      <div className={`grid ${isPC ? "grid-cols-4" : "grid-cols-2"} gap-2`}>
        <SummaryCard label="現在の資産" value={`${fmtMan(settings.initial_savings + settings.initial_investment)}万円`} />
        <SummaryCard label="最低残高" value={trough ? `${fmtMan(trough.balance)}万円` : "—"}
          sub={trough ? `${trough.year}年` : ""} danger={!!trough && trough.balance < 0} />
        <SummaryCard label={`${last.year}年の残高`} value={`${fmtMan(last.balance)}万円`}
          danger={last.balance < 0} />
        <SummaryCard label="試算期間" value={`${settings.years}年`} sub={`${settings.start_year}年〜`} />
      </div>

      {/* グラフ */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-3">
        <h3 className="text-xs font-semibold text-slate-400 mb-2">資産残高の推移（万円）</h3>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#64748b" }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
            <Tooltip
              contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#e2e8f0" }}
              formatter={(v) => `${Number(v ?? 0).toLocaleString("ja-JP")}万円`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#ef4444" strokeWidth={1.5} />
            <Bar dataKey="収入" fill="#22c55e" opacity={0.5} radius={[2, 2, 0, 0]} />
            <Bar dataKey="支出" fill="#ef4444" opacity={0.5} radius={[2, 2, 0, 0]} />
            <Line type="monotone" dataKey="資産残高" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-slate-500 mt-1.5">
          青い線が資産残高。赤いゼロラインを下回る年があれば、その手前で対策が必要です
        </p>
      </div>

      {/* 表 */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-800 border-b border-slate-800">
          <h3 className="text-xs font-semibold text-slate-300">キャッシュフロー表（万円）</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800">
                <th className="text-left px-3 py-2 font-medium sticky left-0 bg-slate-900">年</th>
                {members.map(m => (
                  <th key={m.id} className="text-right px-2 py-2 font-medium">{m.name}</th>
                ))}
                <th className="text-left px-3 py-2 font-medium">ライフイベント</th>
                <th className="text-right px-3 py-2 font-medium">収入</th>
                <th className="text-right px-3 py-2 font-medium">支出</th>
                <th className="text-right px-3 py-2 font-medium">収支</th>
                <th className="text-right px-3 py-2 font-medium">資産残高</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.year}
                  className={`border-b border-slate-800 last:border-0 ${
                    r.balance < 0 ? "bg-red-500/10" : r.events.length > 0 ? "bg-slate-800/40" : ""
                  }`}>
                  <td className={`px-3 py-1.5 font-medium sticky left-0 ${
                    r.balance < 0 ? "bg-[#2a1416]" : r.events.length > 0 ? "bg-[#141c2b]" : "bg-slate-900"
                  } text-slate-300`}>{r.year}</td>
                  {r.ages.map(a => (
                    <td key={a.member.id} className="text-right px-2 py-1.5 text-slate-500">
                      {a.age >= 0 ? a.age : "—"}
                    </td>
                  ))}
                  <td className="px-3 py-1.5">
                    <div className="flex gap-1 flex-wrap">
                      {r.events.map(e => (
                        <span key={e.id}
                          className={`text-[10px] px-1.5 py-0.5 rounded ${CATEGORY_COLORS[e.category] ?? CATEGORY_COLORS.その他}`}>
                          {e.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="text-right px-3 py-1.5 text-green-400">{fmtMan(r.income)}</td>
                  <td className="text-right px-3 py-1.5 text-red-400">{fmtMan(r.expense)}</td>
                  <td className={`text-right px-3 py-1.5 font-medium ${r.net >= 0 ? "text-slate-300" : "text-orange-400"}`}>
                    {r.net >= 0 ? "+" : ""}{fmtMan(r.net)}
                  </td>
                  <td className={`text-right px-3 py-1.5 font-bold ${r.balance < 0 ? "text-red-400" : "text-blue-400"}`}>
                    {fmtMan(r.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, sub, danger }: {
  label: string; value: string; sub?: string; danger?: boolean
}) {
  return (
    <div className={`rounded-xl border p-3 text-center ${
      danger ? "bg-red-500/10 border-red-500/30" : "bg-slate-900 border-slate-800"
    }`}>
      <p className="text-[11px] text-slate-400 mb-1">{label}</p>
      <p className={`text-sm font-bold ${danger ? "text-red-400" : "text-slate-100"}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ライフイベント
// ═══════════════════════════════════════════════════════════════
function EventsTab({ events, members, settings, scope, onChanged, flash, focusAndSelect }: {
  events: LifeEvent[]; members: Member[]; settings: Settings; scope: string
  onChanged: () => void; flash: (s: string) => void
  focusAndSelect: (el: HTMLInputElement | null) => void
}) {
  const [showTemplates, setShowTemplates] = useState(false)
  const [editing, setEditing] = useState<Partial<LifeEvent> | null>(null)

  async function save(e: Partial<LifeEvent>) {
    const body = { ...e, card_type: scope }
    await fetch("/api/lifeplan/events", {
      method: e.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    setEditing(null)
    onChanged()
    flash(e.id ? "更新しました" : "ライフイベントを追加しました")
  }

  async function remove(id: number) {
    if (!confirm("このライフイベントを削除しますか？")) return
    await fetch(`/api/lifeplan/events?id=${id}`, { method: "DELETE" })
    onChanged()
  }

  const totalByCategory = useMemo(() => {
    const m: Record<string, number> = {}
    for (const e of events) {
      if (e.kind !== "expense") continue
      m[e.category] = (m[e.category] ?? 0) + e.amount * e.repeat_years
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [events])

  return (
    <div className="space-y-3">
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3">
        <p className="text-xs text-blue-200/90 leading-relaxed">
          <span className="font-semibold text-blue-300">ライフイベント</span>は、特定の年に発生するまとまった収入・支出です。
          金額は<span className="font-semibold">今の物価での金額</span>で入れてください（将来価値には自動で換算されます）。
          テンプレートから選べば、一般的な費用の目安が入ります。
        </p>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setShowTemplates(true)}
          className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors">
          📋 テンプレートから選ぶ
        </button>
        <button onClick={() => setEditing({ year: settings.start_year, kind: "expense", category: "その他", repeat_years: 1, inflate: true, amount: 0, name: "" })}
          className="flex-1 bg-slate-800 text-slate-200 rounded-lg py-2.5 text-sm font-semibold hover:bg-slate-700 transition-colors">
          ＋ 自分で入力
        </button>
      </div>

      {totalByCategory.length > 0 && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-3">
          <p className="text-xs font-semibold text-slate-400 mb-2">カテゴリ別の総額（今の物価ベース）</p>
          <div className="flex gap-1.5 flex-wrap">
            {totalByCategory.map(([cat, total]) => (
              <span key={cat} className={`text-xs px-2 py-1 rounded ${CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.その他}`}>
                {cat} {fmtMan(total)}万円
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-800 border-b border-slate-800 flex justify-between items-center">
          <h3 className="text-xs font-semibold text-slate-300">登録済みイベント</h3>
          <span className="text-[11px] text-slate-500">{events.length}件</span>
        </div>
        {events.length === 0 ? (
          <p className="text-center text-xs text-slate-500 py-8">
            まだありません。テンプレートから追加してみてください
          </p>
        ) : (
          events.map(e => {
            const member = members.find(m => m.id === e.member_id)
            return (
              <div key={e.id} className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span className="text-sm font-semibold text-slate-300 tabular-nums">{e.year}年</span>
                    {e.repeat_years > 1 && (
                      <span className="text-[10px] text-slate-500">〜{e.year + e.repeat_years - 1}年</span>
                    )}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${CATEGORY_COLORS[e.category] ?? CATEGORY_COLORS.その他}`}>
                      {e.category}
                    </span>
                    {e.kind === "income" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-300">収入</span>
                    )}
                    <span className="text-sm text-slate-100">{e.name}</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {member && `${member.name} · `}
                    {e.repeat_years > 1 ? `年${fmtMan(e.amount)}万円 × ${e.repeat_years}年` : "単年"}
                    {!e.inflate && " · 物価上昇なし"}
                    {e.note && ` · ${e.note}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-sm font-semibold ${e.kind === "income" ? "text-green-400" : "text-slate-300"}`}>
                    {fmtMan(e.amount * e.repeat_years)}万円
                  </span>
                  <button onClick={() => setEditing(e)}
                    className="text-slate-600 hover:text-blue-400 text-sm px-1">✎</button>
                  <button onClick={() => remove(e.id)}
                    className="text-slate-600 hover:text-red-400 text-xl leading-none w-5">×</button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {showTemplates && (
        <TemplateModal
          members={members} settings={settings} scope={scope}
          onClose={() => setShowTemplates(false)}
          onAdded={() => { setShowTemplates(false); onChanged(); flash("ライフイベントを追加しました") }}
        />
      )}

      {editing && (
        <EventEditModal
          draft={editing} members={members} settings={settings}
          onClose={() => setEditing(null)} onSave={save} focusAndSelect={focusAndSelect}
        />
      )}
    </div>
  )
}

// ── テンプレート選択モーダル ────────────────────────────────────
function TemplateModal({ members, settings, scope, onClose, onAdded }: {
  members: Member[]; settings: Settings; scope: string
  onClose: () => void; onAdded: () => void
}) {
  const [group, setGroup] = useState(LIFE_EVENT_TEMPLATES[0].group)
  const [picked, setPicked] = useState<{ name: string; amountMan: number; repeatYears: number; atAge: number | null; category: string; hint: string } | null>(null)
  const [memberId, setMemberId] = useState<number | null>(members[0]?.id ?? null)
  const [year, setYear] = useState(settings.start_year)
  const [amountMan, setAmountMan] = useState("")
  const [saving, setSaving] = useState(false)

  const current = LIFE_EVENT_TEMPLATES.find(g => g.group === group)!
  const selectedMember = members.find(m => m.id === memberId)

  // 年齢紐付けテンプレートを選んだら、対象者の生年から発生年を自動計算する
  useEffect(() => {
    if (!picked) return
    setAmountMan(String(picked.amountMan))
    if (picked.atAge != null && selectedMember) {
      setYear(selectedMember.birth_year + picked.atAge)
    } else {
      setYear(settings.start_year)
    }
  }, [picked, selectedMember, settings.start_year])

  async function add() {
    if (!picked) return
    setSaving(true)
    await fetch("/api/lifeplan/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        card_type: scope,
        year,
        name: picked.name,
        category: picked.category,
        kind: "expense",
        amount: manToYen(amountMan),
        repeat_years: picked.repeatYears,
        inflate: true,
        member_id: picked.atAge != null ? memberId : null,
      }),
    })
    setSaving(false)
    onAdded()
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-slate-800">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
          <h3 className="text-sm font-bold text-slate-100">ライフイベントのテンプレート</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-2xl leading-none">×</button>
        </div>

        <div className="flex gap-1 px-3 py-2 border-b border-slate-800 overflow-x-auto">
          {LIFE_EVENT_TEMPLATES.map(g => (
            <button key={g.group} onClick={() => { setGroup(g.group); setPicked(null) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                group === g.group ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}>
              {g.icon} {g.group}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-3">
          <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-800 rounded-lg p-2.5">
            {current.description}
          </p>

          <div className="space-y-1.5">
            {current.items.map(t => (
              <button key={t.name} onClick={() => setPicked(t)}
                className={`w-full text-left rounded-lg border p-2.5 transition-colors ${
                  picked?.name === t.name
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-slate-800 bg-slate-800/50 hover:border-slate-700"
                }`}>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-sm text-slate-100 font-medium">{t.name}</span>
                  <span className="text-sm text-slate-300 font-semibold shrink-0">
                    {t.amountMan.toLocaleString()}万円
                    {t.repeatYears > 1 && <span className="text-[10px] text-slate-500"> ×{t.repeatYears}年</span>}
                  </span>
                </div>
                {t.hint && <p className="text-[11px] text-slate-500 mt-0.5">{t.hint}</p>}
              </button>
            ))}
          </div>
        </div>

        {picked && (
          <div className="border-t border-slate-800 px-5 py-3 space-y-2.5 bg-slate-950/50">
            <div className="grid grid-cols-2 gap-2">
              {picked.atAge != null && members.length > 0 && (
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">対象者</label>
                  <select value={memberId ?? ""} onChange={e => setMemberId(Number(e.target.value))}
                    className={`${INPUT_CLS} w-full`}>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  開始年{picked.atAge != null && selectedMember && `（${picked.atAge}歳時点）`}
                </label>
                <input type="number" value={year} onChange={e => setYear(Number(e.target.value))}
                  className={`${INPUT_CLS} w-full`} />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  年額（万円）{picked.repeatYears > 1 && ` × ${picked.repeatYears}年`}
                </label>
                <input type="text" inputMode="decimal" value={amountMan}
                  onChange={e => setAmountMan(e.target.value)}
                  onFocus={e => e.currentTarget.select()}
                  className={`${INPUT_CLS} w-full text-right`} />
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              合計 {(Number(amountMan || 0) * picked.repeatYears).toLocaleString()}万円。追加後も金額・年は自由に編集できます
            </p>
            <button onClick={add} disabled={saving}
              className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? "追加中..." : `「${picked.name}」を追加`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── イベント編集モーダル ────────────────────────────────────────
function EventEditModal({ draft, members, settings, onClose, onSave, focusAndSelect }: {
  draft: Partial<LifeEvent>; members: Member[]; settings: Settings
  onClose: () => void; onSave: (e: Partial<LifeEvent>) => void
  focusAndSelect: (el: HTMLInputElement | null) => void
}) {
  const [f, setF] = useState({
    id: draft.id,
    year: draft.year ?? settings.start_year,
    name: draft.name ?? "",
    category: draft.category ?? "その他",
    kind: draft.kind ?? "expense",
    amountMan: yenToManStr(draft.amount ?? 0),
    repeat_years: draft.repeat_years ?? 1,
    inflate: draft.inflate ?? true,
    member_id: draft.member_id ?? null,
    note: draft.note ?? "",
  })

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full max-w-md border border-slate-800">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
          <h3 className="text-sm font-bold text-slate-100">{f.id ? "イベントを編集" : "ライフイベントを追加"}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">イベント名</label>
            <input type="text" value={f.name} ref={focusAndSelect}
              onChange={e => setF({ ...f, name: e.target.value })}
              placeholder="例：長男 大学入学" className={`${INPUT_CLS} w-full`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">開始年</label>
              <input type="number" value={f.year}
                onChange={e => setF({ ...f, year: Number(e.target.value) })}
                className={`${INPUT_CLS} w-full`} />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">続く年数</label>
              <input type="number" min={1} value={f.repeat_years}
                onChange={e => setF({ ...f, repeat_years: Math.max(1, Number(e.target.value)) })}
                className={`${INPUT_CLS} w-full`} />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">年額（万円）</label>
              <input type="text" inputMode="decimal" value={f.amountMan}
                onChange={e => setF({ ...f, amountMan: e.target.value })}
                onFocus={e => e.currentTarget.select()}
                className={`${INPUT_CLS} w-full text-right`} />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">カテゴリ</label>
              <select value={f.category} onChange={e => setF({ ...f, category: e.target.value })}
                className={`${INPUT_CLS} w-full`}>
                {["教育", "住宅", "車", "結婚", "出産", "旅行", "介護", "その他"].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">種別</label>
              <select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as "income" | "expense" })}
                className={`${INPUT_CLS} w-full`}>
                <option value="expense">支出</option>
                <option value="income">収入</option>
              </select>
            </div>
            {members.length > 0 && (
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">対象者（任意）</label>
                <select value={f.member_id ?? ""} onChange={e => setF({ ...f, member_id: e.target.value ? Number(e.target.value) : null })}
                  className={`${INPUT_CLS} w-full`}>
                  <option value="">指定なし</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">メモ（任意）</label>
            <input type="text" value={f.note} onChange={e => setF({ ...f, note: e.target.value })}
              className={`${INPUT_CLS} w-full`} />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={f.inflate}
              onChange={e => setF({ ...f, inflate: e.target.checked })}
              className="w-4 h-4 accent-blue-500" />
            物価上昇を反映する
            <span className="text-[10px] text-slate-500">（ローン返済など固定額はオフに）</span>
          </label>

          <div className="flex gap-2 pt-1">
            <button onClick={onClose}
              className="flex-1 border border-slate-700 text-slate-400 rounded-lg py-2 text-sm hover:bg-slate-800 transition-colors">
              キャンセル
            </button>
            <button
              onClick={() => onSave({
                id: f.id, year: f.year, name: f.name, category: f.category, kind: f.kind,
                amount: manToYen(f.amountMan), repeat_years: f.repeat_years,
                inflate: f.inflate, member_id: f.member_id, note: f.note,
              })}
              disabled={!f.name.trim()}
              className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors">
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 収入・支出（毎年継続する項目）
// ═══════════════════════════════════════════════════════════════
function StreamsTab({ streams, settings, scope, hints, onChanged, flash, focusAndSelect }: {
  streams: Stream[]; settings: Settings; scope: string; hints: ActualHints | null
  onChanged: () => void; flash: (s: string) => void
  focusAndSelect: (el: HTMLInputElement | null) => void
}) {
  const [editing, setEditing] = useState<Partial<Stream> | null>(null)

  const incomes = streams.filter(s => s.kind === "income")
  const expenses = streams.filter(s => s.kind === "expense")
  const incomeTotal = incomes.reduce((s, r) => s + r.annual_amount, 0)
  const expenseTotal = expenses.reduce((s, r) => s + r.annual_amount, 0)

  async function save(s: Partial<Stream>) {
    await fetch("/api/lifeplan/streams", {
      method: s.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...s, card_type: scope }),
    })
    setEditing(null)
    onChanged()
    flash(s.id ? "更新しました" : "追加しました")
  }

  async function remove(id: number) {
    if (!confirm("この項目を削除しますか？")) return
    await fetch(`/api/lifeplan/streams?id=${id}`, { method: "DELETE" })
    onChanged()
  }

  function renderList(list: Stream[], kind: "income" | "expense") {
    return list.length === 0 ? (
      <p className="text-center text-xs text-slate-500 py-6">未登録です</p>
    ) : (
      list.map(s => (
        <div key={s.id} className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 last:border-0">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-100 font-medium truncate">{s.name}</p>
            <p className="text-[11px] text-slate-500">
              {s.start_year || s.end_year
                ? `${s.start_year ?? "開始"}年 〜 ${s.end_year ?? "最終"}年`
                : "全期間"}
              {" · "}
              {s.growth_rate != null
                ? `年${s.growth_rate}%上昇`
                : kind === "income" ? "上昇なし" : `物価連動(${settings.inflation_rate}%)`}
              {s.note && ` · ${s.note}`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-sm font-semibold ${kind === "income" ? "text-green-400" : "text-slate-300"}`}>
              {fmtMan(s.annual_amount)}万円
            </span>
            <button onClick={() => setEditing(s)} className="text-slate-600 hover:text-blue-400 text-sm px-1">✎</button>
            <button onClick={() => remove(s.id)} className="text-slate-600 hover:text-red-400 text-xl leading-none w-5">×</button>
          </div>
        </div>
      ))
    )
  }

  return (
    <div className="space-y-3">
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3">
        <p className="text-xs text-blue-200/90 leading-relaxed">
          毎年継続的に発生する収入・支出を登録します。
          <span className="font-semibold text-blue-300">期間を区切れる</span>のがポイントで、
          「給与は65歳まで」「年金は65歳から」「住宅ローンは2045年まで」のように設定すると、
          収入が減る時期・支出が終わる時期が自動でキャッシュフローに反映されます。
        </p>
      </div>

      {hints && (hints.annualExpense > 0 || hints.annualIncome > 0) && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-3">
          <p className="text-xs font-semibold text-slate-400 mb-2">この家計簿の直近1年の実績</p>
          <div className="flex gap-2">
            <button
              onClick={() => setEditing({ kind: "income", name: "給与収入（手取り）", annual_amount: hints.annualIncome, growth_rate: 1.5 })}
              className="flex-1 bg-green-500/10 border border-green-500/30 rounded-lg p-2.5 text-left hover:bg-green-500/20 transition-colors">
              <p className="text-[11px] text-green-300/70">収入</p>
              <p className="text-sm font-bold text-green-300">{fmtMan(hints.annualIncome)}万円</p>
              <p className="text-[10px] text-slate-500 mt-0.5">タップして登録</p>
            </button>
            <button
              onClick={() => setEditing({ kind: "expense", name: "基本生活費", annual_amount: hints.annualExpense, growth_rate: null })}
              className="flex-1 bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 text-left hover:bg-red-500/20 transition-colors">
              <p className="text-[11px] text-red-300/70">支出</p>
              <p className="text-sm font-bold text-red-300">{fmtMan(hints.annualExpense)}万円</p>
              <p className="text-[10px] text-slate-500 mt-0.5">タップして登録</p>
            </button>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
            支出には投資・貯蓄カテゴリを含めていません。積立は「支出」ではなく資産の移動なので、
            キャッシュフロー上は運用利回りとして扱います
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => setEditing({ kind: "income", name: "", annual_amount: 0, growth_rate: 1.5 })}
          className="flex-1 bg-green-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-green-700 transition-colors">
          ＋ 収入を追加
        </button>
        <button onClick={() => setEditing({ kind: "expense", name: "", annual_amount: 0, growth_rate: null })}
          className="flex-1 bg-slate-700 text-slate-100 rounded-lg py-2.5 text-sm font-semibold hover:bg-slate-600 transition-colors">
          ＋ 支出を追加
        </button>
      </div>

      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-800 border-b border-slate-800 flex justify-between">
          <h3 className="text-xs font-semibold text-green-300">収入（年額）</h3>
          <span className="text-xs font-bold text-green-400">{fmtMan(incomeTotal)}万円</span>
        </div>
        {renderList(incomes, "income")}
      </div>

      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-800 border-b border-slate-800 flex justify-between">
          <h3 className="text-xs font-semibold text-red-300">支出（年額）</h3>
          <span className="text-xs font-bold text-red-400">{fmtMan(expenseTotal)}万円</span>
        </div>
        {renderList(expenses, "expense")}
      </div>

      <div className={`rounded-xl border p-3 text-center ${
        incomeTotal - expenseTotal >= 0
          ? "bg-blue-500/10 border-blue-500/30" : "bg-red-500/10 border-red-500/30"
      }`}>
        <p className="text-[11px] text-slate-400">初年度の年間収支</p>
        <p className={`text-lg font-bold ${incomeTotal - expenseTotal >= 0 ? "text-blue-400" : "text-red-400"}`}>
          {incomeTotal - expenseTotal >= 0 ? "+" : ""}{fmtMan(incomeTotal - expenseTotal)}万円
        </p>
      </div>

      {editing && (
        <StreamEditModal
          draft={editing} settings={settings}
          onClose={() => setEditing(null)} onSave={save} focusAndSelect={focusAndSelect}
        />
      )}
    </div>
  )
}

function StreamEditModal({ draft, settings, onClose, onSave, focusAndSelect }: {
  draft: Partial<Stream>; settings: Settings
  onClose: () => void; onSave: (s: Partial<Stream>) => void
  focusAndSelect: (el: HTMLInputElement | null) => void
}) {
  const [f, setF] = useState({
    id: draft.id,
    kind: draft.kind ?? "expense",
    name: draft.name ?? "",
    amountMan: yenToManStr(draft.annual_amount ?? 0),
    start_year: draft.start_year != null ? String(draft.start_year) : "",
    end_year: draft.end_year != null ? String(draft.end_year) : "",
    growth_rate: draft.growth_rate != null ? String(draft.growth_rate) : "",
    note: draft.note ?? "",
  })

  const templates = STREAM_TEMPLATES.filter(t => t.kind === f.kind)

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto border border-slate-800">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 sticky top-0 bg-slate-900">
          <h3 className="text-sm font-bold text-slate-100">
            {f.id ? "項目を編集" : f.kind === "income" ? "収入を追加" : "支出を追加"}
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-3">
          {!f.id && (
            <div>
              <p className="text-[11px] text-slate-400 mb-1.5">よくある項目から選ぶ</p>
              <div className="flex gap-1.5 flex-wrap">
                {templates.map(t => (
                  <button key={t.name}
                    onClick={() => setF({
                      ...f, name: t.name,
                      amountMan: t.amountMan > 0 ? String(t.amountMan) : f.amountMan,
                      growth_rate: t.growthRate != null ? String(t.growthRate) : "",
                      note: "",
                    })}
                    title={t.hint}
                    className="text-[11px] px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors">
                    {t.name}
                  </button>
                ))}
              </div>
              {templates.find(t => t.name === f.name)?.hint && (
                <p className="text-[11px] text-blue-300/80 mt-1.5 bg-blue-500/10 rounded p-2">
                  💡 {templates.find(t => t.name === f.name)!.hint}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">項目名</label>
            <input type="text" value={f.name} ref={focusAndSelect}
              onChange={e => setF({ ...f, name: e.target.value })}
              placeholder={f.kind === "income" ? "例：給与収入" : "例：基本生活費"}
              className={`${INPUT_CLS} w-full`} />
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">年額（万円）</label>
            <input type="text" inputMode="decimal" value={f.amountMan}
              onChange={e => setF({ ...f, amountMan: e.target.value })}
              onFocus={e => e.currentTarget.select()}
              className={`${INPUT_CLS} w-full text-right`} />
            <p className="text-[10px] text-slate-500 mt-0.5">
              月額から入れる場合は12倍してください（月30万円 → 360万円）
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">開始年（空欄=最初から）</label>
              <input type="number" value={f.start_year} placeholder={String(settings.start_year)}
                onChange={e => setF({ ...f, start_year: e.target.value })}
                className={`${INPUT_CLS} w-full`} />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">終了年（空欄=最後まで）</label>
              <input type="number" value={f.end_year} placeholder={String(settings.start_year + settings.years - 1)}
                onChange={e => setF({ ...f, end_year: e.target.value })}
                className={`${INPUT_CLS} w-full`} />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">年間の上昇率（%）</label>
            <input type="text" inputMode="decimal" value={f.growth_rate}
              placeholder={f.kind === "income" ? "空欄=0%（据え置き）" : `空欄=物価連動 ${settings.inflation_rate}%`}
              onChange={e => setF({ ...f, growth_rate: e.target.value })}
              className={`${INPUT_CLS} w-full text-right`} />
            <p className="text-[10px] text-slate-500 mt-0.5">
              昇給は1〜2%、住宅ローンなど固定額は0%を入れてください
            </p>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">メモ（任意）</label>
            <input type="text" value={f.note} onChange={e => setF({ ...f, note: e.target.value })}
              className={`${INPUT_CLS} w-full`} />
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={onClose}
              className="flex-1 border border-slate-700 text-slate-400 rounded-lg py-2 text-sm hover:bg-slate-800 transition-colors">
              キャンセル
            </button>
            <button
              onClick={() => onSave({
                id: f.id, kind: f.kind as "income" | "expense", name: f.name,
                annual_amount: manToYen(f.amountMan),
                start_year: f.start_year === "" ? null : Number(f.start_year),
                end_year: f.end_year === "" ? null : Number(f.end_year),
                growth_rate: f.growth_rate === "" ? null : Number(f.growth_rate),
                note: f.note,
              })}
              disabled={!f.name.trim()}
              className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors">
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// 前提条件・家族構成
// ═══════════════════════════════════════════════════════════════
function SettingsTab({ settings, members, hints, scope, onSave, onChanged, flash, focusAndSelect }: {
  settings: Settings; members: Member[]; hints: ActualHints | null; scope: string
  onSave: (s: Settings) => void; onChanged: () => void; flash: (s: string) => void
  focusAndSelect: (el: HTMLInputElement | null) => void
}) {
  const [f, setF] = useState({
    start_year: String(settings.start_year),
    years: String(settings.years),
    inflation_rate: String(settings.inflation_rate),
    return_rate: String(settings.return_rate),
    savingsMan: yenToManStr(settings.initial_savings),
    investmentMan: yenToManStr(settings.initial_investment),
  })
  const [newName, setNewName] = useState("")
  const [newBirth, setNewBirth] = useState("")
  const [newRelation, setNewRelation] = useState("本人")

  async function commit() {
    await onSave({
      start_year: Number(f.start_year),
      years: Number(f.years),
      inflation_rate: Number(f.inflation_rate),
      return_rate: Number(f.return_rate),
      initial_savings: manToYen(f.savingsMan),
      initial_investment: manToYen(f.investmentMan),
    })
  }

  async function addMember() {
    if (!newName.trim() || !newBirth) return
    await fetch("/api/lifeplan/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), birth_year: Number(newBirth), relation: newRelation, card_type: scope }),
    })
    setNewName(""); setNewBirth("")
    onChanged()
    flash("家族を追加しました")
  }

  async function removeMember(id: number) {
    if (!confirm("この家族を削除しますか？")) return
    await fetch(`/api/lifeplan/members?id=${id}`, { method: "DELETE" })
    onChanged()
  }

  const thisYear = new Date().getFullYear()

  return (
    <div className="space-y-3">
      {/* 家族構成 */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-800 border-b border-slate-800">
          <h3 className="text-xs font-semibold text-slate-300">家族構成</h3>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            生年を登録すると、キャッシュフロー表に各年の年齢が並びます。
            「子が18歳の年 = 大学入学」のようにイベントの発生年を自動計算できるようになります。
          </p>
          {members.map(m => (
            <div key={m.id} className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2">
              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">{m.relation}</span>
              <span className="text-sm text-slate-100 flex-1">{m.name}</span>
              <span className="text-xs text-slate-500">{m.birth_year}年生 · {thisYear - m.birth_year}歳</span>
              <button onClick={() => removeMember(m.id)}
                className="text-slate-600 hover:text-red-400 text-xl leading-none w-5">×</button>
            </div>
          ))}
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="名前" className={INPUT_CLS} />
            <input type="number" value={newBirth} onChange={e => setNewBirth(e.target.value)}
              placeholder="生年" className={`${INPUT_CLS} w-24`} />
            <select value={newRelation} onChange={e => setNewRelation(e.target.value)} className={INPUT_CLS}>
              {["本人", "配偶者", "子", "その他"].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <button onClick={addMember} disabled={!newName.trim() || !newBirth}
            className="w-full bg-slate-700 text-slate-100 rounded-lg py-2 text-sm font-semibold hover:bg-slate-600 disabled:opacity-40 transition-colors">
            家族を追加
          </button>
        </div>
      </div>

      {/* 前提条件 */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-800 border-b border-slate-800">
          <h3 className="text-xs font-semibold text-slate-300">試算の前提条件</h3>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="開始年" hint="今年から始めるのが基本">
              <input type="number" value={f.start_year}
                onChange={e => setF({ ...f, start_year: e.target.value })} className={`${INPUT_CLS} w-full`} />
            </Field>
            <Field label="試算年数" hint="老後まで見るなら40〜50年">
              <input type="number" value={f.years}
                onChange={e => setF({ ...f, years: e.target.value })} className={`${INPUT_CLS} w-full`} />
            </Field>
            <Field label="物価上昇率（%）" hint="日銀目標は2%。保守的に見るなら1〜2%">
              <input type="text" inputMode="decimal" value={f.inflation_rate}
                onFocus={e => e.currentTarget.select()}
                onChange={e => setF({ ...f, inflation_rate: e.target.value })} className={`${INPUT_CLS} w-full text-right`} />
            </Field>
            <Field label="運用利回り（%）" hint="現預金中心なら0〜1%、投資比率が高いなら3〜5%">
              <input type="text" inputMode="decimal" value={f.return_rate}
                onFocus={e => e.currentTarget.select()}
                onChange={e => setF({ ...f, return_rate: e.target.value })} className={`${INPUT_CLS} w-full text-right`} />
            </Field>
            <Field label="現在の預貯金（万円）">
              <input type="text" inputMode="decimal" value={f.savingsMan}
                onFocus={e => e.currentTarget.select()}
                onChange={e => setF({ ...f, savingsMan: e.target.value })} className={`${INPUT_CLS} w-full text-right`} />
            </Field>
            <Field label="現在の投資資産（万円）">
              <input type="text" inputMode="decimal" value={f.investmentMan}
                onFocus={e => e.currentTarget.select()}
                onChange={e => setF({ ...f, investmentMan: e.target.value })} className={`${INPUT_CLS} w-full text-right`} />
            </Field>
          </div>

          {hints && (hints.savings > 0 || hints.investment > 0) && (
            <button
              onClick={() => setF({ ...f, savingsMan: yenToManStr(hints.savings), investmentMan: yenToManStr(hints.investment) })}
              className="w-full text-xs bg-slate-800 text-slate-300 rounded-lg py-2 hover:bg-slate-700 transition-colors">
              資産管理の最新値を取り込む（預貯金 {fmtMan(hints.savings)}万円 / 投資 {fmtMan(hints.investment)}万円）
            </button>
          )}

          <SaveButton onSave={commit} label="前提条件を保存" savedLabel="保存しました" />
        </div>
      </div>

      {/* 解説 */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 space-y-2.5">
        <h3 className="text-xs font-semibold text-slate-300">この試算の計算ルール</h3>
        <div className="text-[11px] text-slate-400 leading-relaxed space-y-1.5">
          <p>
            <span className="text-slate-200 font-semibold">年間収支</span> = 収入合計 − 支出合計
          </p>
          <p>
            <span className="text-slate-200 font-semibold">資産残高</span> = 前年の残高 ×（1＋運用利回り）＋ 年間収支
          </p>
          <p>
            金額はすべて<span className="text-slate-200">今の物価での金額</span>で登録し、経過年数ぶんの上昇率を掛けて将来の金額に換算しています。
            これはファイナンシャルプランナーが作るキャッシュフロー表と同じ方式です。
          </p>
          <p className="text-slate-500">
            ※ 預貯金と投資をまとめて1つの利回りで運用する簡易モデルです。
            現預金の比率が高い場合は運用利回りを低めに設定してください。
          </p>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] text-slate-400 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{hint}</p>}
    </div>
  )
}
