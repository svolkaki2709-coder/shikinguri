/**
 * ライフイベントの費用テンプレート（世間一般の目安）。
 *
 * 金額はすべて「万円」。UI側で円に変換して保存する。
 * あくまで統計上の平均値なので、登録後は自分の状況に合わせて必ず調整して使う前提。
 *
 * 出典の目安:
 *  - 教育費: 文部科学省「子供の学習費調査」／日本政策金融公庫「教育費負担の実態調査」
 *  - 住宅:   住宅金融支援機構「フラット35利用者調査」
 *  - 介護:   生命保険文化センター「生命保険に関する全国実態調査」
 *  - 結婚:   ゼクシィ結婚トレンド調査
 */

export interface LifeEventTemplate {
  /** テンプレート名（そのままイベント名になる） */
  name: string
  /** カテゴリ */
  category: string
  /** 1年あたりの金額（万円） */
  amountMan: number
  /** 何年続くか（大学4年間なら4） */
  repeatYears: number
  /** 何歳のときに発生するか（子の年齢に紐づけて年を自動計算するため）。null＝年齢と無関係 */
  atAge: number | null
  /** 補足説明。UIでそのまま表示して判断材料にする */
  hint: string
}

export interface TemplateGroup {
  group: string
  icon: string
  /** グループ全体にかかる解説 */
  description: string
  items: LifeEventTemplate[]
}

export const LIFE_EVENT_TEMPLATES: TemplateGroup[] = [
  {
    group: "教育",
    icon: "🎓",
    description:
      "教育費は「いつ・いくら必要か」が事前にほぼ確定している数少ない支出です。子どもの年齢を指定すると発生年が自動で入ります。学校教育費＋給食費＋塾など学校外活動費を含んだ年額の目安です。",
    items: [
      { name: "幼稚園（公立）", category: "教育", amountMan: 17, repeatYears: 3, atAge: 3, hint: "年17万円 × 3年 ≒ 50万円" },
      { name: "幼稚園（私立）", category: "教育", amountMan: 31, repeatYears: 3, atAge: 3, hint: "年31万円 × 3年 ≒ 93万円" },
      { name: "小学校（公立）", category: "教育", amountMan: 34, repeatYears: 6, atAge: 6, hint: "年34万円 × 6年 ≒ 200万円。塾代を含む" },
      { name: "小学校（私立）", category: "教育", amountMan: 183, repeatYears: 6, atAge: 6, hint: "年183万円 × 6年 ≒ 1,100万円" },
      { name: "中学校（公立）", category: "教育", amountMan: 54, repeatYears: 3, atAge: 12, hint: "年54万円 × 3年 ≒ 162万円。高校受験の塾代が大きい" },
      { name: "中学校（私立）", category: "教育", amountMan: 156, repeatYears: 3, atAge: 12, hint: "年156万円 × 3年 ≒ 468万円" },
      { name: "高校（公立）", category: "教育", amountMan: 60, repeatYears: 3, atAge: 15, hint: "年60万円 × 3年 ≒ 180万円" },
      { name: "高校（私立）", category: "教育", amountMan: 103, repeatYears: 3, atAge: 15, hint: "年103万円 × 3年 ≒ 309万円" },
      { name: "大学（国公立）", category: "教育", amountMan: 108, repeatYears: 4, atAge: 18, hint: "年108万円 × 4年 ≒ 430万円。入学金・受験費用は別途" },
      { name: "大学（私立文系）", category: "教育", amountMan: 152, repeatYears: 4, atAge: 18, hint: "年152万円 × 4年 ≒ 610万円" },
      { name: "大学（私立理系）", category: "教育", amountMan: 192, repeatYears: 4, atAge: 18, hint: "年192万円 × 4年 ≒ 770万円" },
      { name: "大学 受験・入学時費用", category: "教育", amountMan: 60, repeatYears: 1, atAge: 18, hint: "受験料・入学金・引越等。私立は特に大きい" },
      { name: "下宿・仕送り", category: "教育", amountMan: 110, repeatYears: 4, atAge: 18, hint: "自宅外通学の場合。年110万円前後" },
    ],
  },
  {
    group: "住宅",
    icon: "🏠",
    description:
      "住宅は人生最大の支出。購入時の一時金（頭金＋諸費用）と、その後のローン返済（＝毎年の固定支出）を分けて登録します。ローン返済は「収入・支出」タブに支出として登録するのが正確です。",
    items: [
      { name: "住宅購入 頭金", category: "住宅", amountMan: 700, repeatYears: 1, atAge: null, hint: "物件価格の1〜2割が目安。頭金2割で借入額と総利息を大きく圧縮できる" },
      { name: "住宅購入 諸費用", category: "住宅", amountMan: 250, repeatYears: 1, atAge: null, hint: "仲介手数料・登記・保険等。物件価格の3〜10%" },
      { name: "リフォーム（水回り・外壁）", category: "住宅", amountMan: 300, repeatYears: 1, atAge: null, hint: "築15〜20年で一度は発生。戸建なら外壁塗装だけで100〜150万円" },
      { name: "賃貸 更新料", category: "住宅", amountMan: 10, repeatYears: 1, atAge: null, hint: "2年ごとに家賃1ヶ月分。繰り返し登録するか年額に均すと良い" },
      { name: "固定資産税", category: "住宅", amountMan: 12, repeatYears: 30, atAge: null, hint: "持ち家なら毎年発生。10〜15万円が目安" },
    ],
  },
  {
    group: "車・大型消費",
    icon: "🚗",
    description:
      "買い替えサイクルが決まっているものは、周期分だけ繰り返し登録しておくと将来の谷が見えるようになります。",
    items: [
      { name: "車の購入（新車）", category: "車", amountMan: 300, repeatYears: 1, atAge: null, hint: "10年周期なら10年ごとに登録。普通車の平均取得価格" },
      { name: "車の購入（中古）", category: "車", amountMan: 150, repeatYears: 1, atAge: null, hint: "" },
      { name: "車検", category: "車", amountMan: 12, repeatYears: 1, atAge: null, hint: "2年ごとに10〜15万円" },
      { name: "家電の買い替え", category: "その他", amountMan: 30, repeatYears: 1, atAge: null, hint: "冷蔵庫・洗濯機・エアコン等。10年前後で一巡する" },
    ],
  },
  {
    group: "ライフイベント",
    icon: "🎉",
    description:
      "予定が立っているイベントを入れておくと、その年の資金繰りが持つかを事前に確認できます。",
    items: [
      { name: "結婚式・披露宴", category: "結婚", amountMan: 330, repeatYears: 1, atAge: null, hint: "ご祝儀（約200万円）を差し引くと自己負担は150万円前後" },
      { name: "出産費用", category: "出産", amountMan: 50, repeatYears: 1, atAge: null, hint: "出産育児一時金50万円でおおむね相殺される" },
      { name: "海外旅行", category: "旅行", amountMan: 50, repeatYears: 1, atAge: null, hint: "" },
      { name: "引越し", category: "その他", amountMan: 30, repeatYears: 1, atAge: null, hint: "敷金・礼金・家具家電を含む" },
    ],
  },
  {
    group: "老後・介護",
    icon: "🌿",
    description:
      "老後は「収入が年金だけに減る」ことと「介護・医療費が増える」ことが同時に起きます。年金は収入ストリームとして、介護費用はイベントとして登録します。",
    items: [
      { name: "介護費用（一時金）", category: "介護", amountMan: 74, repeatYears: 1, atAge: 80, hint: "住宅改修・介護ベッド等の初期費用の平均" },
      { name: "介護費用（月額×5年）", category: "介護", amountMan: 100, repeatYears: 5, atAge: 80, hint: "月8.3万円 × 12ヶ月。介護期間の平均は約5年" },
      { name: "葬儀費用", category: "その他", amountMan: 110, repeatYears: 1, atAge: null, hint: "" },
    ],
  },
]

/** 収入・支出ストリームのテンプレート（毎年継続的に発生するもの） */
export interface StreamTemplate {
  kind: "income" | "expense"
  name: string
  /** 年額の目安（万円）。0なら自分で入れる前提 */
  amountMan: number
  growthRate: number | null
  hint: string
}

export const STREAM_TEMPLATES: StreamTemplate[] = [
  { kind: "income", name: "給与収入（手取り）", amountMan: 0, growthRate: 1.5, hint: "手取りベースで入れると生活実感に合います。昇給率は1〜2%が一般的" },
  { kind: "income", name: "配偶者の給与収入（手取り）", amountMan: 0, growthRate: 1.5, hint: "" },
  { kind: "income", name: "公的年金", amountMan: 0, growthRate: 0, hint: "ねんきん定期便の見込額を年額で。会社員夫婦なら合計月22万円前後が一つの目安" },
  { kind: "income", name: "退職金", amountMan: 0, growthRate: 0, hint: "受け取る年だけをライフイベントとして登録する方が正確です" },
  { kind: "income", name: "児童手当", amountMan: 18, growthRate: 0, hint: "月1〜1.5万円 × 12ヶ月。高校卒業まで" },
  { kind: "expense", name: "基本生活費", amountMan: 0, growthRate: null, hint: "食費・日用品・水道光熱・通信など。実績から取り込めます" },
  { kind: "expense", name: "住居費（家賃/ローン返済）", amountMan: 0, growthRate: 0, hint: "ローンは固定額なので上昇率は0%にします" },
  { kind: "expense", name: "保険料", amountMan: 0, growthRate: 0, hint: "" },
  { kind: "expense", name: "車の維持費", amountMan: 40, growthRate: null, hint: "税金・保険・ガソリン・駐車場。年30〜50万円" },
  { kind: "expense", name: "こづかい・娯楽費", amountMan: 0, growthRate: null, hint: "" },
]
