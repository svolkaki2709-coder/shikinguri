"use client"

import { useMemo, useState } from "react"
import { SaveButton } from "@/components/SaveButton"
import { fmtMoneyInput, parseNum } from "@/lib/num"

/**
 * 産休・育休のときに国から出るお金の試算。
 *
 * 出産まわりは「申請すればもらえる」お金が多く、しかも取り方で金額が変わる。
 * もらえる額の目安と、同じ休み方でも受取を増やせるポイントを並べて見せる。
 *
 * 金額の根拠（2026年時点の制度）
 *  ・出産育児一時金 …… 子1人50万円
 *  ・出産手当金 ……… 標準報酬月額の平均 ÷ 30 × 2/3 × 98日（産前42日＋産後56日）
 *  ・育児休業給付金 …… 休業開始前6ヶ月の賃金日額 × 67%（180日まで）→ 以降50%。上限あり
 *  ・出生後休業支援給付金（2025年4月〜）…… 両親とも14日以上育休を取ると、最大28日間 13%上乗せ
 *  ・社会保険料の免除 …… 産休・育休中の健康保険料・厚生年金保険料はかからない
 * 給付金はいずれも非課税。上限額は毎年8月に改定されるので、最新値は厚生労働省で確認すること。
 */

/** 育児休業給付の賃金日額の上限（目安）。毎年8月に改定される */
const DAILY_WAGE_CAP = 15690
/** 本人負担の社会保険料率（健康保険＋厚生年金のおおよそ） */
const SOCIAL_RATE = 0.145

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`

interface Params {
  wifeMonthly: string       // 妻の月給（標準報酬月額の目安）
  leaveMonths: string       // 産休明けからの育休の長さ（ヶ月）
  husbandLeave: boolean     // 夫も産後に育休を取るか
  husbandDays: string       // 夫の育休日数
  husbandMonthly: string    // 夫の月給
  birthYear: string         // 出産予定の年
  birthMonth: string        // 出産予定の月
}

export function MaternityBenefits({ saved, payslipMonthly, scope, onSave, onRegister }: {
  saved: Partial<Params> | null
  /** 給与明細から拾った本人の標準報酬月額（夫側の初期値に使う） */
  payslipMonthly: number | null
  scope: string
  onSave: (p: Params) => Promise<void>
  onRegister: (events: { year: number; month: number; name: string; amount: number }[]) => Promise<void>
}) {
  const thisYear = new Date().getFullYear()
  const [p, setP] = useState<Params>(() => ({
    wifeMonthly: fmtMoneyInput(String(saved?.wifeMonthly ?? "")),
    leaveMonths: String(saved?.leaveMonths ?? "10"),
    husbandLeave: saved?.husbandLeave ?? true,
    husbandDays: String(saved?.husbandDays ?? "28"),
    husbandMonthly: fmtMoneyInput(String(saved?.husbandMonthly ?? (payslipMonthly ?? ""))),
    birthYear: String(saved?.birthYear ?? thisYear + 2),
    birthMonth: String(saved?.birthMonth ?? "6"),
  }))
  const set = <K extends keyof Params>(k: K, v: Params[K]) => setP(prev => ({ ...prev, [k]: v }))

  const r = useMemo(() => {
    const wife = parseNum(p.wifeMonthly)
    const husband = parseNum(p.husbandMonthly)
    const leaveDays = Math.max(0, parseNum(p.leaveMonths)) * 30
    const husbandDays = p.husbandLeave ? Math.max(0, parseNum(p.husbandDays)) : 0

    const wifeDaily = Math.min(wife / 30, DAILY_WAGE_CAP)
    const husbandDaily = Math.min(husband / 30, DAILY_WAGE_CAP)

    // 出産手当金：98日分の2/3
    const shussanTeate = Math.round((wife / 30) * (2 / 3) * 98)

    // 育児休業給付金：180日まで67%、それ以降50%
    const first = Math.min(leaveDays, 180)
    const rest = Math.max(0, leaveDays - 180)
    const ikukyu = Math.round(wifeDaily * 0.67 * first + wifeDaily * 0.5 * rest)

    // 夫：出生時育児休業（産後パパ育休）も67%
    const husbandIkukyu = Math.round(husbandDaily * 0.67 * husbandDays)

    // 出生後休業支援給付金：両親とも14日以上なら、それぞれ最大28日分13%上乗せ
    const bothTake = p.husbandLeave && husbandDays >= 14 && leaveDays >= 14
    const supportWife = bothTake ? Math.round(wifeDaily * 0.13 * Math.min(28, leaveDays)) : 0
    const supportHusband = bothTake ? Math.round(husbandDaily * 0.13 * Math.min(28, husbandDays)) : 0
    // 取らなかった場合に逃す額（「増やす方法」で見せる）
    const missedSupport = bothTake ? 0
      : Math.round(wifeDaily * 0.13 * 28 + (husband > 0 ? husbandDaily * 0.13 * 28 : 0))

    // 社会保険料の免除：産休（約3ヶ月）＋育休の月数
    const exemptMonthsWife = 3 + Math.max(0, parseNum(p.leaveMonths))
    const exemptWife = Math.round(wife * SOCIAL_RATE * exemptMonthsWife)
    const exemptHusband = Math.round(husband * SOCIAL_RATE * (husbandDays >= 14 ? 1 : 0))

    const ichijikin = 500000
    const cash = ichijikin + shussanTeate + ikukyu + husbandIkukyu + supportWife + supportHusband

    // 休業中の月あたり受取と、ふだんの手取り（概算：額面の約78%）の比較
    const normalTakeHome = wife * 0.78
    const monthlyFirst = wifeDaily * 0.67 * 30
    const monthlyLater = wifeDaily * 0.5 * 30

    return {
      ichijikin, shussanTeate, ikukyu, husbandIkukyu, supportWife, supportHusband,
      missedSupport, exemptWife, exemptHusband, cash, bothTake,
      normalTakeHome, monthlyFirst, monthlyLater, capped: wife / 30 > DAILY_WAGE_CAP,
    }
  }, [p])

  const input = "w-full bg-slate-900 text-slate-100 border border-slate-700 rounded-lg px-2 py-2 text-sm text-right"
  const birthY = parseNum(p.birthYear) || thisYear + 1
  const birthM = Math.min(12, Math.max(1, parseNum(p.birthMonth) || 6))

  return (
    <div className="space-y-3">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100">産休・育休でもらえるお金</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            会社員（健康保険・雇用保険に加入）の場合の目安です。すべて非課税です
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="妻の月給（額面）">
            <input className={input} inputMode="numeric" placeholder="0"
              value={p.wifeMonthly} onChange={e => set("wifeMonthly", fmtMoneyInput(e.target.value))} />
          </Field>
          <Field label="産休明けからの育休（ヶ月）">
            <input className={input} inputMode="numeric"
              value={p.leaveMonths} onChange={e => set("leaveMonths", e.target.value.replace(/[^0-9]/g, ""))} />
          </Field>
          <Field label="出産予定の年">
            <input className={input} inputMode="numeric"
              value={p.birthYear} onChange={e => set("birthYear", e.target.value.replace(/[^0-9]/g, ""))} />
          </Field>
          <Field label="出産予定の月">
            <input className={input} inputMode="numeric"
              value={p.birthMonth} onChange={e => set("birthMonth", e.target.value.replace(/[^0-9]/g, ""))} />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={p.husbandLeave} onChange={e => set("husbandLeave", e.target.checked)} />
          夫も産後に育休を取る
        </label>
        {p.husbandLeave && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="夫の月給（額面）">
              <input className={input} inputMode="numeric" placeholder="0"
                value={p.husbandMonthly} onChange={e => set("husbandMonthly", fmtMoneyInput(e.target.value))} />
            </Field>
            <Field label="夫の育休（日）">
              <input className={input} inputMode="numeric"
                value={p.husbandDays} onChange={e => set("husbandDays", e.target.value.replace(/[^0-9]/g, ""))} />
            </Field>
          </div>
        )}
      </div>

      {/* 結果 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-bold text-slate-100">受け取れる額</h3>
          <span className="text-xl font-bold text-green-300">{yen(r.cash)}</span>
        </div>
        <Line label="出産育児一時金（健康保険）" value={r.ichijikin} hint="子1人50万円。直接支払制度なら病院が受け取り、窓口負担が減る" />
        <Line label="出産手当金（健康保険）" value={r.shussanTeate} hint="産前42日＋産後56日の98日分。給与の約2/3" />
        <Line label={`育児休業給付金（雇用保険・${p.leaveMonths}ヶ月）`} value={r.ikukyu}
          hint={`最初の180日は賃金の67%、以降50%${r.capped ? "（上限にかかっています）" : ""}`} />
        {p.husbandLeave && (
          <Line label={`夫の育児休業給付金（${p.husbandDays}日）`} value={r.husbandIkukyu} hint="産後パパ育休も賃金の67%" />
        )}
        {r.bothTake && (
          <Line label="出生後休業支援給付金（2人分）" value={r.supportWife + r.supportHusband}
            hint="両親とも14日以上取ったので、各28日分13%上乗せ。手取りで見ると実質10割" good />
        )}

        <div className="pt-2 mt-1 border-t border-slate-800 space-y-2">
          <Line label="払わずに済む社会保険料（妻）" value={r.exemptWife}
            hint="産休・育休中は健康保険料・厚生年金保険料が免除。免除中も年金は納めた扱い" muted />
          {r.exemptHusband > 0 && (
            <Line label="払わずに済む社会保険料（夫）" value={r.exemptHusband} hint="月末をまたいで育休を取った場合" muted />
          )}
        </div>

        <div className="bg-slate-800/50 rounded-lg p-2.5 mt-2 text-xs text-slate-400 space-y-1">
          <p>
            育休中の妻の受取は、最初の半年が月 <span className="text-slate-200 font-semibold">{yen(r.monthlyFirst)}</span>、
            以降が月 <span className="text-slate-200 font-semibold">{yen(r.monthlyLater)}</span>
            （ふだんの手取りの目安 {yen(r.normalTakeHome)}）
          </p>
          <p>
            育休給付金は2ヶ月ごとにまとめて振り込まれ、初回は育休開始から2〜3ヶ月後になります。
            その間の生活費は手元で用意しておく必要があります
          </p>
        </div>
      </div>

      {/* 増やす方法 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2.5">
        <h3 className="text-sm font-bold text-slate-100">受け取りを増やす・減らさないためのポイント</h3>

        <Tip title="夫婦とも14日以上の育休を取る" done={r.bothTake}
          body={r.bothTake
            ? "出生後休業支援給付金の対象です。産後8週間以内に取るのが条件なので、日程は早めに会社と決めておきましょう"
            : `今の設定では対象外です。夫も産後8週間以内に14日以上取ると、2人で約${yen(r.missedSupport)}上乗せされます`} />
        <Tip title="育休の開始・終了は月末をまたぐように"
          body="社会保険料は「月末時点で休業しているか」で免除が決まります。月の途中で終わると、その月の保険料がかかることがあります（同じ月の中で14日以上休む場合も免除）" />
        <Tip title="賞与の月は、1ヶ月を超えて休む"
          body="賞与にかかる社会保険料は、1ヶ月を超える育休のときに免除されます。夫の育休を賞与月に合わせて1ヶ月超にすると、数万円単位で変わることがあります" />
        <Tip title="夫の産後パパ育休は2回に分けられる"
          body="出生後8週間以内に最大4週間を2回まで分割できます。退院直後と里帰りから戻る時期、のように分けると使いやすくなります" />
        <Tip title="勤務先の独自制度を確認する"
          body="出産祝金、育休中の給与の一部支給、保育料補助などは会社ごとに違います。就業規則・福利厚生の規程を2人とも確認してください" />
        <Tip title="自治体の給付と医療費控除"
          body="妊娠届・出生届で計10万円前後の給付がある自治体が多いほか、妊婦健診や分娩費が年10万円を超えれば医療費控除で税金が戻ります" />

        <p className="text-[11px] text-slate-500 pt-1">
          注意：育休中も住民税は前年の所得に対してかかります。給与から天引きできない期間は、自分で納付書で払うことになります
        </p>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <SaveButton label="入力内容を保存" onSave={() => onSave(p)} />
        </div>
        <div className="flex-1">
          <SaveButton label={`${birthY}年のイベントに登録`} savedLabel="登録しました"
            onSave={() => onRegister([
              { year: birthY, month: birthM, name: "出産手当金", amount: r.shussanTeate },
              { year: birthY, month: Math.min(12, birthM + 3), name: "育児休業給付金（試算）", amount: r.ikukyu + r.husbandIkukyu + r.supportWife + r.supportHusband },
            ])} />
        </div>
      </div>
      <p className="text-[11px] text-slate-500">
        イベントに登録すると、ライフプランのキャッシュフローと2人の分担に入金として反映されます
        （出産育児一時金はライフイベントに別途登録する前提のため、ここでは登録しません）。{scope === "self" ? "個人のプランに登録されます" : "共同のプランに登録されます"}
      </p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-slate-500 block mb-0.5">{label}</label>
      {children}
    </div>
  )
}

function Line({ label, value, hint, good, muted }: { label: string; value: number; hint?: string; good?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className={`text-sm ${muted ? "text-slate-400" : "text-slate-200"}`}>{label}</p>
        {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
      </div>
      <span className={`text-sm font-semibold shrink-0 ${good ? "text-green-300" : muted ? "text-slate-400" : "text-slate-100"}`}>
        {yen(value)}
      </span>
    </div>
  )
}

function Tip({ title, body, done }: { title: string; body: string; done?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className={`text-sm shrink-0 ${done ? "text-green-400" : "text-amber-400"}`}>{done ? "✓" : "●"}</span>
      <div>
        <p className="text-sm text-slate-200">{title}</p>
        <p className="text-[11px] text-slate-500 leading-relaxed">{body}</p>
      </div>
    </div>
  )
}
