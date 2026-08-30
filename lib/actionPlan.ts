/**
 * 資産形成の「やる順番」。
 *
 * NISA・iDeCo・保険をどう組み合わせるかは、単体で比べても答えが出ない。
 * 順番が決まっているので、上から順に埋めていくのが最短になる。
 * ここでは家計簿の実績から各ステップの達成度を判定し、
 * 「次に何をすればよいか」を1つに絞って示す。
 *
 * ⚠️ 制度の数値は改定される。金額は目安として使うこと。
 */

export interface ActionContext {
  /** 月間の生活費（円）。実績から算出。不明なら null */
  monthlyExpense: number | null
  /** 預貯金残高（円） */
  savings: number
  /** 投資資産残高（円） */
  investment: number
  /** 資産残高が登録されているか。未登録と「0円」を区別するために持つ */
  hasAssetData: boolean
  /** 年収（円）。給与明細の標準報酬月額などから推定 */
  annualIncome: number | null
  /** 直近1年のカテゴリ別支出（円）。NISA・iDeCo等の実施状況の判定に使う */
  categoryTotals: Record<string, number>
  hasMortgage: boolean
  childCount: number
}

export type StepState = "done" | "doing" | "todo" | "unknown"

export interface StepStatus {
  state: StepState
  /** 判定の根拠。ユーザーの実際の数字を出す */
  detail: string
}

export interface ActionStep {
  id: string
  title: string
  /** なぜこの順番なのか */
  why: string
  /** 達成の目安 */
  target: string
  /** 具体的にやること */
  how: string[]
  /** つまずきやすい点 */
  caution?: string
  assess: (ctx: ActionContext) => StepStatus
}

/** カテゴリ名の部分一致で年間支出を拾う */
function sumBy(ctx: ActionContext, re: RegExp): number {
  return Object.entries(ctx.categoryTotals)
    .filter(([k]) => re.test(k))
    .reduce((s, [, v]) => s + v, 0)
}

const yen = (n: number) => `${Math.round(n / 10000).toLocaleString("ja-JP")}万円`

export const ACTION_STEPS: ActionStep[] = [
  {
    id: "emergency-fund",
    title: "生活防衛資金をためる",
    why:
      "これが無いまま投資を始めると、失業や病気、相場の下落が重なったときに、" +
      "一番売りたくないタイミングで投資を取り崩すことになります。" +
      "投資の成否は銘柄選びより「売らずに済む体制」で決まります。",
    target: "生活費の6ヶ月分を現金・預金で確保（自営業や収入が不安定なら1年分）",
    how: [
      "生活費の6ヶ月分がいくらかを把握する",
      "すぐ引き出せる普通預金に置く（投資に回さない）",
      "貯まるまでは投資よりこちらを優先する",
    ],
    caution: "貯蓄型保険や投資信託は「すぐ引き出せる」に含めない。解約控除や値下がりで目減りするため。",
    assess: ctx => {
      if (!ctx.hasAssetData) {
        return { state: "unknown", detail: "資産管理で預貯金残高を登録すると判定できます" }
      }
      if (ctx.monthlyExpense == null || ctx.monthlyExpense <= 0) {
        return { state: "unknown", detail: "生活費の実績がまだ足りません" }
      }
      const need = ctx.monthlyExpense * 6
      const ratio = ctx.savings / need
      if (ratio >= 1) {
        return { state: "done", detail: `預貯金${yen(ctx.savings)} ≧ 目標${yen(need)}（${(ratio * 12).toFixed(0)}ヶ月分）` }
      }
      if (ratio >= 0.3) {
        return { state: "doing", detail: `預貯金${yen(ctx.savings)} / 目標${yen(need)}（${(ratio * 6).toFixed(1)}ヶ月分）` }
      }
      return { state: "todo", detail: `預貯金${yen(ctx.savings)} / 目標${yen(need)}。まずここから` }
    },
  },
  {
    id: "high-interest-debt",
    title: "高金利の借金を返す",
    why:
      "リボ払いやカードローンの金利は年15%前後。" +
      "投資でこれを安定的に上回るのはまず不可能なので、" +
      "返済することが確実に年15%の運用をしたのと同じ効果になります。",
    target: "金利10%を超える借入をゼロにする",
    how: [
      "カードのリボ払い残高・カードローン残高を確認する",
      "金利の高いものから繰上返済する",
      "リボ払いになっている支払いを一括払いに戻す",
    ],
    caution: "住宅ローン（金利0.4〜2%程度）はここに含めない。低金利なので急いで返す必要はない。",
    assess: ctx => {
      const revolving = sumBy(ctx, /リボ|キャッシング|カードローン/)
      if (revolving > 0) {
        return { state: "todo", detail: `リボ・ローン関連の支出を検出（年${yen(revolving)}）` }
      }
      return { state: "unknown", detail: "リボ払い・カードローンがなければ完了です" }
    },
  },
  {
    id: "company-benefits",
    title: "会社の制度を使い切る",
    why:
      "企業型DCのマッチング拠出や持株会の奨励金は、" +
      "拠出した時点で会社が上乗せしてくれるぶんだけ確実にプラスになります。" +
      "市場のリターンと違って不確実性がないので、投資より先に埋めるのが合理的です。",
    target: "使える社内制度をひと通り確認し、上乗せがあるものは満額使う",
    how: [
      "企業型DC（確定拠出年金）とマッチング拠出の有無を人事に確認",
      "持株会の奨励金（5〜10%上乗せが多い）の有無を確認",
      "財形貯蓄・団体保険など、個人で入るより安いものがないか確認",
    ],
    caution: "持株会は勤務先に資産が集中する。会社が傾くと給与と資産を同時に失うので、比率は抑える。",
    assess: () => ({ state: "unknown", detail: "勤務先の制度は自分で確認が必要です" }),
  },
  {
    id: "insurance",
    title: "保険を必要な分だけに絞る",
    why:
      "日本の公的保険（遺族年金・傷病手当金・高額療養費）はかなり手厚く、" +
      "民間保険で備えるべきなのはその不足分だけです。" +
      "重複したぶんの保険料は、そのまま投資に回せる余力になります。",
    target: "必要保障額を計算し、不足分だけを掛け捨てでカバーする",
    how: [
      "ライフプランの「必要保障額」ツールで不足額を出す",
      "今の保険金額と比べ、過剰なら減額・解約を検討する",
      "不足分は収入保障保険や逓減定期保険で埋める（保障が年々下がるぶん保険料が安い）",
    ],
    caution:
      "貯蓄型保険は「保険」と「運用」が混ざっていて、どちらの効率も落ちる。" +
      "分けたほうが安く・自由になることが多い。ただし解約返戻金が元本割れする時期があるので、解約前に必ず確認する。",
    assess: ctx => {
      const premium = sumBy(ctx, /保険/)
      if (premium <= 0) return { state: "unknown", detail: "保険料の支出が見当たりません" }
      const ratio = ctx.annualIncome ? (premium / ctx.annualIncome) * 100 : null
      if (ratio != null && ratio > 8) {
        return { state: "todo", detail: `年間保険料${yen(premium)}（年収の${ratio.toFixed(1)}%）。見直しの余地が大きいです` }
      }
      return {
        state: "doing",
        detail: `年間保険料${yen(premium)}${ratio != null ? `（年収の${ratio.toFixed(1)}%）` : ""}`,
      }
    },
  },
  {
    id: "ideco",
    title: "iDeCoで節税しながら老後資金を作る",
    why:
      "掛金が全額所得控除になるため、拠出した瞬間に税率ぶんのリターンが確定します。" +
      "年収500万円なら所得税10%＋住民税10%で実質20%。" +
      "相場に関係なく得られるので、投資の中でもっとも確実性が高い枠です。",
    target: "無理のない範囲で満額に近づける（会社員は月12,000〜23,000円）",
    how: [
      "勤務先の企業年金の有無で上限額が変わるので確認する",
      "金融機関で口座開設（手数料の安いネット証券が有利）",
      "運用商品は手数料の低いインデックス投信を選ぶ",
      "年末調整で小規模企業共済等掛金控除として申告する",
    ],
    caution:
      "原則60歳まで引き出せない。教育費や住宅資金など途中で使う可能性があるお金は入れない。" +
      "生活防衛資金が貯まる前に始めると、資金繰りが苦しくなったときに逃げ場がなくなる。",
    assess: ctx => {
      const ideco = sumBy(ctx, /iDeCo|イデコ|確定拠出/i)
      if (ideco > 0) return { state: "done", detail: `年間${yen(ideco)}を拠出中` }
      return { state: "todo", detail: "拠出が確認できません" }
    },
  },
  {
    id: "nisa",
    title: "新NISAで非課税の運用枠を埋める",
    why:
      "通常20.315%かかる運用益が非課税になります。" +
      "iDeCoと違っていつでも引き出せるので、教育費など途中で使う可能性がある資金も置けます。" +
      "売却すると翌年に枠が復活するため、使い勝手の面でも優れています。",
    target: "つみたて投資枠（年120万円）を軸に、無理のない額を毎月自動積立",
    how: [
      "証券会社でNISA口座を開設（1人1口座）",
      "つみたて投資枠で低コストのインデックス投信を毎月自動積立に設定する",
      "余力があれば成長投資枠（年240万円）も使う",
      "相場が下がっても積立を止めない",
    ],
    caution:
      "生涯上限は1,800万円。急いで埋める必要はなく、生活を圧迫しない額で続けることのほうが大事。" +
      "教育費のピークと重なる時期は減額してよい。",
    assess: ctx => {
      const nisa = sumBy(ctx, /NISA|ニーサ|つみたて|積立投資/i)
      if (nisa > 0) return { state: "done", detail: `年間${yen(nisa)}を積立中` }
      return { state: "todo", detail: "積立が確認できません" }
    },
  },
  {
    id: "furusato",
    title: "ふるさと納税を毎年使い切る",
    why:
      "実質2,000円の負担で返礼品を受け取れる、ほぼ唯一の「やらないと損」な制度です。" +
      "運用と違って結果が確実なので、毎年の恒例作業にしてしまうのが得策です。",
    target: "控除上限まで寄付する（年収500万・共働きなら約6万円）",
    how: [
      "ポータルサイトのシミュレーターで上限額を確認する",
      "12月31日までに寄付を済ませる",
      "確定申告しないならワンストップ特例を翌年1月10日必着で提出する",
    ],
    caution:
      "医療費控除や住宅ローン控除を併用すると上限が下がる。上限ぎりぎりを狙わず、少し余裕を持たせる。",
    assess: ctx => {
      const f = sumBy(ctx, /ふるさと|納税/)
      if (f > 0) return { state: "done", detail: `年間${yen(f)}を寄付済み` }
      return { state: "todo", detail: "今年の寄付が確認できません" }
    },
  },
  {
    id: "mortgage-vs-invest",
    title: "住宅ローンの繰上返済と運用を比べる",
    why:
      "繰上返済は「ローン金利と同じ利回りの、確実な運用」と同じ効果があります。" +
      "金利より高いリターンを狙えるなら運用、そうでないなら返済が有利になります。",
    target: "ローン金利・住宅ローン控除・期待リターンの3つを並べて判断する",
    how: [
      "ライフプランの「住宅ローン」ツールで繰上返済の効果を試算する",
      "住宅ローン控除の期間中（13年）は、控除率0.7%と金利を比べる",
      "金利が0.7%を下回るなら、控除期間中は返済せず手元に置くほうが有利",
    ],
    caution:
      "繰上返済したお金は戻せない。生活防衛資金を削ってまで返済しない。" +
      "団体信用生命保険が付いているため、ローンを残すこと自体が保険の役割も果たしている。",
    assess: ctx =>
      ctx.hasMortgage
        ? { state: "doing", detail: "住宅ローンを登録済み。ツールで比較できます" }
        : { state: "unknown", detail: "住宅ローンがなければ対象外です" },
  },
]

export const STATE_STYLE: Record<StepState, { label: string; cls: string; dot: string }> = {
  done:    { label: "できている", cls: "text-green-300 border-green-500/30 bg-green-500/10", dot: "bg-green-500" },
  doing:   { label: "途中",       cls: "text-amber-300 border-amber-500/30 bg-amber-500/10", dot: "bg-amber-500" },
  todo:    { label: "これから",   cls: "text-blue-300 border-blue-500/30 bg-blue-500/10",   dot: "bg-blue-500" },
  unknown: { label: "要確認",     cls: "text-slate-400 border-slate-700 bg-slate-800",      dot: "bg-slate-600" },
}

/** NISAとiDeCoの使い分け。どちらを先にするかで迷いやすいので並べて示す */
export const NISA_VS_IDECO = {
  title: "NISAとiDeCo、どちらを先に？",
  rows: [
    { label: "税制メリット", nisa: "運用益が非課税", ideco: "掛金が全額所得控除＋運用益非課税" },
    { label: "得られる時期", nisa: "利益が出たときだけ", ideco: "拠出した年にすぐ（相場に関係なく確実）" },
    { label: "引き出し", nisa: "いつでも可能", ideco: "原則60歳まで不可" },
    { label: "年間の上限", nisa: "360万円（生涯1,800万円）", ideco: "会社員は月1.2〜2.3万円" },
    { label: "手数料", nisa: "口座管理料なし", ideco: "口座管理料が毎月かかる" },
    { label: "向いている資金", nisa: "教育費など途中で使う可能性があるお金", ideco: "確実に老後まで使わないお金" },
  ],
  conclusion:
    "所得税を払っていて、かつ60歳まで手を付けないと決められる額はiDeCoが有利です（節税分が確実なリターンになるため）。" +
    "それを超える分と、途中で使う可能性がある資金はNISAへ。" +
    "迷ったら、生活防衛資金 → iDeCo（少額から）→ NISA の順で始めて、余力に応じて増やすのが失敗しにくい進め方です。",
}
