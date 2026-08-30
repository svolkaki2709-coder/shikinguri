"use client"

import { useEffect, useState, useMemo } from "react"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"
import { useViewMode } from "@/components/ViewModeContext"
import {
  BENEFITS, CATEGORIES, LEVEL_LABEL,
  type Benefit, type HouseholdContext, type BenefitCategory, type RelevanceLevel,
} from "@/lib/benefits"
import { ActionPlanTab } from "@/components/ActionPlan"

interface Member { id: number; name: string; birth_year: number; relation: string }
interface Stream { kind: string; name: string; annual_amount: number }
interface EventRow { category: string; year: number }
interface ToolRow { tool: string }

export default function LearnPage() {
  const { mode } = useViewMode()
  const isPC = mode === "pc"
  const thisYear = new Date().getFullYear()

  const [ctx, setCtx] = useState<HouseholdContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [catFilter, setCatFilter] = useState<BenefitCategory | "all">("all")
  const [tab, setTab] = useState<"actions" | "browse">("actions")

  useEffect(() => {
    // 家族構成は世帯共通のものを使う。給与は個人の実績から取る。
    fetch("/api/lifeplan?card_type=joint")
      .then(r => r.json())
      .then(d => {
        const members: Member[] = (d.members ?? []).map((m: Member) => ({
          ...m, birth_year: Number(m.birth_year),
        }))
        const streams: Stream[] = d.streams ?? []
        const events: EventRow[] = d.events ?? []
        const tools: ToolRow[] = d.tools ?? []

        const people = members.map(m => ({
          name: m.name, age: thisYear - m.birth_year, relation: m.relation,
        }))
        const incomeFromStreams = streams
          .filter(s => s.kind === "income")
          .reduce((s, r) => s + Number(r.annual_amount), 0)

        setCtx({
          thisYear,
          people,
          childAges: people.filter(p => p.relation === "子").map(p => p.age),
          hasSpouse: people.some(p => p.relation === "配偶者"),
          annualIncome:
            d.payslipHints?.annualEquivalent ?? (incomeFromStreams > 0 ? incomeFromStreams : null),
          hasMortgage:
            tools.some(t => t.tool === "mortgage") ||
            streams.some(s => s.kind === "expense" && /ローン|住宅/.test(s.name)),
          plannedCategories: Array.from(new Set(events.map(e => e.category))),
        })
      })
      .finally(() => setLoading(false))
  }, [thisYear])

  // 関連度つきの一覧
  const scored = useMemo(() => {
    if (!ctx) return []
    return BENEFITS
      .map(b => ({ benefit: b, rel: b.relevance(ctx) }))
      .filter((x): x is { benefit: Benefit; rel: NonNullable<ReturnType<Benefit["relevance"]>> } => x.rel !== null)
      .sort((a, b) => LEVEL_LABEL[a.rel.level].order - LEVEL_LABEL[b.rel.level].order)
  }, [ctx])

  const grouped = useMemo(() => {
    const m: Record<string, typeof scored> = {}
    for (const s of scored) {
      const k = s.rel.level
      ;(m[k] ??= []).push(s)
    }
    return m
  }, [scored])

  const filtered = catFilter === "all"
    ? BENEFITS
    : BENEFITS.filter(b => b.category === catFilter)

  const relOf = (id: string) => scored.find(s => s.benefit.id === id)?.rel ?? null

  return (
    <div className={isPC ? "" : "pb-20"}>
      <PageHeader title="制度ガイド" />
      <main className={isPC ? "max-w-4xl mx-auto px-6 py-4 space-y-4" : "max-w-md mx-auto px-4 py-2 space-y-3"}>

        <div className="flex rounded-xl bg-slate-800 p-1 gap-0.5">
          {([["actions", "🎯 やること"], ["browse", "📚 制度を調べる"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab === k ? "bg-slate-900 shadow-sm text-blue-400" : "text-slate-400"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {tab === "actions" && <ActionPlanTab />}

        {tab === "browse" && (<>
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3">
          <p className="text-xs text-blue-200/90 leading-relaxed">
            年金・社会保険・給付金・控除は、
            <span className="font-semibold text-blue-300">知っている人だけが得をする</span>作りになっています。
            ここでは登録済みの家族構成・年齢・収入から、
            いま関係しそうな制度を上に並べています。気になったものを開いて、条件と申請先を確認してください。
          </p>
        </div>

        {loading ? (
          <p className="text-center text-slate-500 text-sm py-10">読み込み中...</p>
        ) : (
          <>
            {/* あなたに関係しそうな制度 */}
            {scored.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-bold text-slate-100">この世帯に関係しそうな制度</h2>
                {ctx && ctx.people.length === 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                    <p className="text-[11px] text-amber-200/90 leading-relaxed">
                      ライフプランの「前提条件」タブで家族の生年を登録すると、
                      子どもの年齢に応じた制度（児童手当・就学支援金など）まで絞り込めるようになります。
                    </p>
                  </div>
                )}
                {(["now", "soon", "someday"] as RelevanceLevel[]).map(level => {
                  const list = grouped[level]
                  if (!list || list.length === 0) return null
                  return (
                    <div key={level} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] px-2 py-0.5 rounded border font-semibold ${LEVEL_LABEL[level].cls}`}>
                          {LEVEL_LABEL[level].label}
                        </span>
                        <span className="text-[11px] text-slate-500">{list.length}件</span>
                      </div>
                      {list.map(({ benefit, rel }) => (
                        <BenefitCard
                          key={benefit.id} b={benefit} reason={rel.reason} level={rel.level}
                          open={openId === benefit.id}
                          onToggle={() => setOpenId(openId === benefit.id ? null : benefit.id)}
                        />
                      ))}
                    </div>
                  )
                })}
              </section>
            )}

            {/* 全制度をカテゴリ別に */}
            <section className="space-y-3 pt-2">
              <h2 className="text-sm font-bold text-slate-100">すべての制度</h2>
              <div className="flex gap-1.5 flex-wrap">
                <button onClick={() => setCatFilter("all")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    catFilter === "all" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"
                  }`}>
                  すべて
                </button>
                {CATEGORIES.map(c => (
                  <button key={c} onClick={() => setCatFilter(c)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      catFilter === c ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"
                    }`}>
                    {c}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                {filtered.map(b => {
                  const rel = relOf(b.id)
                  return (
                    <BenefitCard
                      key={b.id} b={b} reason={rel?.reason} level={rel?.level}
                      open={openId === b.id}
                      onToggle={() => setOpenId(openId === b.id ? null : b.id)}
                      showCategory
                    />
                  )
                })}
              </div>
            </section>

            <p className="text-[10px] text-slate-500 leading-relaxed pt-2">
              ※ 金額・所得制限は毎年のように改定されます。ここの数字は制度の全体像をつかむための目安として使い、
              実際に申請する前には必ず記載の窓口で最新の条件を確認してください。
              自治体独自の制度（子ども医療費助成など）は住んでいる市区町村によって内容が大きく異なります。
            </p>
          </>
        )}
        </>)}
      </main>
      <BottomNav />
    </div>
  )
}

function BenefitCard({ b, reason, level, open, onToggle, showCategory }: {
  b: Benefit
  reason?: string
  level?: RelevanceLevel
  open: boolean
  onToggle: () => void
  showCategory?: boolean
}) {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      <button onClick={onToggle} className="w-full text-left px-4 py-3 hover:bg-slate-800/50 transition-colors">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              {showCategory && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{b.category}</span>
              )}
              {level && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${LEVEL_LABEL[level].cls}`}>
                  {LEVEL_LABEL[level].label}
                </span>
              )}
              <span className="text-sm font-bold text-slate-100">{b.title}</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">{b.summary}</p>
            {reason && (
              <p className="text-[11px] text-blue-300/80 mt-1">→ {reason}</p>
            )}
          </div>
          <span className="text-slate-600 text-xs shrink-0 mt-1">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-800 pt-3">
          <Section title="いくら">
            <p className="text-xs text-slate-200 leading-relaxed">{b.amount}</p>
          </Section>
          <Section title="主な条件">
            <ul className="space-y-1">
              {b.conditions.map((c, i) => (
                <li key={i} className="text-xs text-slate-300 leading-relaxed flex gap-1.5">
                  <span className="text-slate-600 shrink-0">・</span><span>{c}</span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="どこに申請するか">
            <p className="text-xs text-slate-300 leading-relaxed">{b.howTo}</p>
          </Section>
          {b.tips && (
            <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg p-2.5">
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                <span className="font-semibold text-amber-300">見落としやすい点：</span>{b.tips}
              </p>
            </div>
          )}
          <p className="text-[10px] text-slate-500">確認先：{b.source}</p>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-500 mb-1">{title}</p>
      {children}
    </div>
  )
}
