/**
 * 「2人で進める手続き」のテンプレート。
 *
 * dueOffsetDays は基準日（入籍日・引っ越し日など）からの日数。
 * 期限そのものではなく「これくらいまでに片付けておくと詰まらない」という目安で、
 * 取り込んだあとは1件ずつアプリ上で変更できる。
 *
 * 手続きの要否は家庭ごとにまったく違う。全部入りのリストを渡すと
 * 「自分たちに関係ない項目」を1件ずつ消す作業が発生してしまうので、
 * conditions（状況の質問）に答えると requires を満たす項目だけが選ばれるようにしている。
 * requires が空の項目は誰にでも必要なもの。
 */

export interface TodoCondition {
  key: string
  label: string
  /** 既定でオンにしておくか（ほとんどの家庭で当てはまるもの） */
  defaultOn?: boolean
  hint?: string
}

export interface TodoTemplateItem {
  key: string
  title: string
  category: string
  /** 何をどこでやるのか・持ち物・注意点 */
  detail: string
  dueOffsetDays: number
  /** すべて満たしたときだけ対象になる状況キー。空なら常に対象 */
  requires?: string[]
}

export interface TodoTemplate {
  id: string
  name: string
  /** 基準日の意味（UIのラベルに使う） */
  baseLabel: string
  description: string
  conditions: TodoCondition[]
  items: TodoTemplateItem[]
}

export const TODO_TEMPLATES: TodoTemplate[] = [
  {
    id: "marriage",
    name: "入籍後の手続き",
    baseLabel: "入籍日（婚姻届の提出日）",
    description:
      "婚姻届のあとに発生する届出を、役所 → 勤務先 → 金融機関 → 保険 の順に並べています。この順番が大事で、戸籍・住民票が新しくならないと他の手続きができません。当てはまる状況にチェックを入れると、必要な項目だけが選ばれます。",
    conditions: [
      { key: "rename", label: "どちらかが姓を変える", defaultOn: true, hint: "氏名変更の手続きはここから派生します" },
      { key: "moving", label: "引っ越す・同居を始める" },
      { key: "dependent", label: "どちらかが相手の扶養に入る", hint: "年収130万円未満が目安" },
      { key: "car", label: "車を持っている" },
      { key: "rent", label: "賃貸に住んでいる" },
      { key: "dc", label: "企業型DC・iDeCoをやっている" },
      { key: "loan", label: "奨学金・ローンの返済がある" },
      { key: "passport", label: "パスポートを持っている" },
      { key: "selfemployed", label: "自営・フリーランスがいる", hint: "国保・国民年金の手続きが別に必要です" },
      { key: "stepchild", label: "連れ子がいる" },
      { key: "foreign", label: "配偶者が外国籍" },
      { key: "defacto", label: "婚姻届は出さない（事実婚・パートナーシップ）" },
    ],
    items: [
      // ── 役所 ────────────────────────────────────────
      {
        key: "marriage.kon-in",
        title: "婚姻届を提出する",
        category: "役所",
        detail: "戸籍謄本（本籍地以外に出す場合）・本人確認書類・旧姓の印鑑。24時間受付の窓口なら夜間・休日も提出できる",
        dueOffsetDays: 0,
      },
      {
        key: "marriage.defacto-juminhyo",
        title: "住民票の続柄を「未届の夫（妻）」にする",
        category: "役所",
        detail:
          "事実婚の場合、この記載があるかどうかで扱いが変わる。健康保険の扶養・遺族年金は認められる一方、配偶者控除・相続権・医療費控除の合算は認められない。法律婚との差は事前に把握しておく",
        dueOffsetDays: 0,
        requires: ["defacto"],
      },
      {
        key: "marriage.partnership",
        title: "パートナーシップ宣誓の申請（自治体にある場合）",
        category: "役所",
        detail: "自治体によって使える範囲が違う。公営住宅の入居・病院での面会・携帯の家族割などが対象になることが多い",
        dueOffsetDays: 30,
        requires: ["defacto"],
      },
      {
        key: "marriage.koseki-copy",
        title: "新しい戸籍謄本・住民票を3通ずつ取る",
        category: "役所",
        detail: "このあとの氏名変更でくり返し求められる。1通ずつ取りに行くと何度も役所に行くことになるのでまとめて取得する。戸籍への反映には提出から1週間ほどかかる",
        dueOffsetDays: 10,
      },
      {
        key: "marriage.juminhyo",
        title: "転入届・転居届を出す",
        category: "役所",
        detail: "引っ越し後14日以内が法定期限。婚姻届と同時に出せることも多い",
        dueOffsetDays: 14,
        requires: ["moving"],
      },
      {
        key: "marriage.mynumber",
        title: "マイナンバーカードの氏名・住所変更",
        category: "役所",
        detail: "変更から14日以内。券面の追記欄が埋まるとカード再発行になるので早めに",
        dueOffsetDays: 14,
        requires: ["rename"],
      },
      {
        key: "marriage.kyusei-heiki",
        title: "住民票・マイナンバーカードへの旧姓併記を申請する",
        category: "役所",
        detail: "仕事で旧姓を使い続ける場合、併記しておくと銀行口座や資格証明を旧姓のまま扱える場面が増える。任意だが、あとから申請するより一度で済む",
        dueOffsetDays: 14,
        requires: ["rename"],
      },
      {
        key: "marriage.inkan",
        title: "印鑑登録をやり直す",
        category: "役所",
        detail: "改姓すると旧姓の印鑑登録は失効する。実印は不動産・車の手続きで必要になるので、必要になる前に登録し直す",
        dueOffsetDays: 30,
        requires: ["rename"],
      },
      {
        key: "marriage.kokuho",
        title: "国民健康保険・国民年金の氏名・住所変更",
        category: "役所",
        detail: "会社員・公務員は勤務先経由なので不要。自営・フリーランスは自分で役所に行く",
        dueOffsetDays: 14,
        requires: ["selfemployed"],
      },
      {
        key: "marriage.youshi",
        title: "連れ子との養子縁組を検討する",
        category: "役所",
        detail:
          "入籍しても、配偶者の子とは自動的に親子にならない。養子縁組をしないと扶養控除・相続権・親権が及ばない。届出は婚姻届と同時に出せる",
        dueOffsetDays: 0,
        requires: ["stepchild"],
      },
      {
        key: "marriage.zairyu",
        title: "在留資格の変更（配偶者ビザ）を申請する",
        category: "役所",
        detail: "出入国在留管理庁へ。審査に1〜3ヶ月かかるので、現在の在留期限から逆算して早めに動く。婚姻要件具備証明書など母国側の書類も必要",
        dueOffsetDays: 14,
        requires: ["foreign"],
      },

      // ── 勤務先 ──────────────────────────────────────
      {
        key: "marriage.company-notify",
        title: "勤務先に結婚を届け出る（氏名・住所・緊急連絡先）",
        category: "勤務先",
        detail: "健康保険証の氏名変更もここ経由。社内の慶弔規程に結婚祝金があることが多い",
        dueOffsetDays: 7,
      },
      {
        key: "marriage.kazoku-teate",
        title: "家族手当・扶養手当の申請",
        category: "勤務先",
        detail: "支給条件のある会社は多いが、自己申告制なので黙っていると出ない。就業規則を確認する",
        dueOffsetDays: 14,
      },
      {
        key: "marriage.kyusei-shiyo",
        title: "職場での旧姓使用を申請する",
        category: "勤務先",
        detail: "名刺・メールアドレス・資格の登録名をどうするか。あとから変えると取引先への案内が二度手間になるので、最初に決めておく",
        dueOffsetDays: 7,
        requires: ["rename"],
      },
      {
        key: "marriage.fuyou",
        title: "健康保険の扶養手続き",
        category: "勤務先",
        detail: "配偶者の年収130万円未満（60歳未満）かつ被保険者の年収の1/2未満が目安。扶養に入ると配偶者の健康保険料・国民年金保険料が0円になる",
        dueOffsetDays: 7,
        requires: ["dependent"],
      },
      {
        key: "marriage.dai3gou",
        title: "第3号被保険者の届出",
        category: "勤務先",
        detail: "扶養に入る配偶者の国民年金。保険料を払わずに払ったものとして年金額に反映される。届出漏れは将来の年金が減る原因になりやすい",
        dueOffsetDays: 14,
        requires: ["dependent"],
      },
      {
        key: "marriage.nenmatsu",
        title: "年末調整で配偶者控除・配偶者特別控除を申告する",
        category: "税金",
        detail:
          "配偶者の年収が150万円以下なら満額38万円の控除、201万円まで段階的に縮小しながら使える（本人の年収1,195万円以下が条件）。申告しないと使えない",
        dueOffsetDays: 90,
      },
      {
        key: "marriage.tsukin",
        title: "通勤手当・住宅手当の変更届",
        category: "勤務先",
        detail: "定期券の払い戻しもセットで確認する",
        dueOffsetDays: 7,
        requires: ["moving"],
      },
      {
        key: "marriage.kyuyo-koza",
        title: "給与振込口座の名義変更を会社に連絡",
        category: "勤務先",
        detail: "銀行の名義変更が終わってから。順番を逆にすると振込エラーになる",
        dueOffsetDays: 40,
        requires: ["rename"],
      },

      // ── 金融機関 ────────────────────────────────────
      {
        key: "marriage.bank",
        title: "銀行口座の氏名変更",
        category: "金融機関",
        detail: "通帳・キャッシュカード・新しい印鑑・本人確認書類。ネット銀行はアプリ内で完結することが多い",
        dueOffsetDays: 30,
        requires: ["rename"],
      },
      {
        key: "marriage.ginko-in",
        title: "銀行印を新しくする",
        category: "金融機関",
        detail: "旧姓の銀行印を使い続けることもできるが、実印と揃えておくほうがあとの手続きで迷わない",
        dueOffsetDays: 30,
        requires: ["rename"],
      },
      {
        key: "marriage.card",
        title: "クレジットカードの氏名・住所変更",
        category: "金融機関",
        detail: "引き落とし口座の名義と一致していないと決済が止まることがある",
        dueOffsetDays: 30,
        requires: ["rename"],
      },
      {
        key: "marriage.securities",
        title: "証券口座（NISA）の氏名変更",
        category: "金融機関",
        detail: "放置すると積立の引き落としが止まることがある",
        dueOffsetDays: 30,
        requires: ["rename"],
      },
      {
        key: "marriage.dc",
        title: "企業型DC・iDeCoの氏名・住所変更",
        category: "金融機関",
        detail: "iDeCoは運営管理機関への届出が別途必要。掛金の引き落としが止まると、その月の拠出が取り戻せない",
        dueOffsetDays: 30,
        requires: ["dc"],
      },
      {
        key: "marriage.loan",
        title: "奨学金・ローンの氏名・引落口座の変更",
        category: "金融機関",
        detail: "日本学生支援機構は「変更届」が必要。引き落とし不能が続くと延滞扱いになり、個人信用情報に残る",
        dueOffsetDays: 30,
        requires: ["loan"],
      },
      {
        key: "marriage.joint-account",
        title: "生活費用の共同口座を決める・作る",
        category: "金融機関",
        detail: "このアプリの「共同」と口座を一致させておくと、あとで突き合わせが要らなくなる",
        dueOffsetDays: 14,
      },

      // ── 保険 ────────────────────────────────────────
      {
        key: "marriage.life-beneficiary",
        title: "生命保険の受取人を配偶者に変更",
        category: "保険",
        detail:
          "独身時代のまま親が受取人になっているケースが多い。変更しないと配偶者に保険金が渡らず、相続税の非課税枠（500万円×法定相続人）も使えない。最優先で確認する項目",
        dueOffsetDays: 30,
      },
      {
        key: "marriage.insurance-name",
        title: "生命保険・医療保険の氏名・住所変更",
        category: "保険",
        detail: "住所が古いままだと満期・更新の通知が届かない",
        dueOffsetDays: 30,
        requires: ["rename"],
      },
      {
        key: "marriage.car-insurance",
        title: "自動車保険の記名被保険者・運転者範囲の確認",
        category: "保険",
        detail: "「本人限定」のままだと配偶者の運転中の事故が補償されない。等級の引き継ぎは同居の親族間なら可能",
        dueOffsetDays: 30,
        requires: ["car"],
      },
      {
        key: "marriage.kasai",
        title: "火災保険（家財）の契約者・氏名変更",
        category: "保険",
        detail: "2人分の家財になるので、保険金額が足りているかもここで見る",
        dueOffsetDays: 30,
        requires: ["rent"],
      },
      {
        key: "marriage.need-coverage",
        title: "必要保障額を計算し直す",
        category: "保険",
        detail: "独身と既婚では必要保障額がまったく変わる。ライフプラン → ツールの「必要保障額」で、遺族年金を差し引いた不足額を出せる",
        dueOffsetDays: 60,
      },

      // ── 生活 ────────────────────────────────────────
      {
        key: "marriage.license",
        title: "運転免許証の氏名・住所変更",
        category: "生活",
        detail: "警察署・免許センター。新しい住民票が必要。本人確認書類として使う場面が多いので早めに",
        dueOffsetDays: 14,
        requires: ["rename"],
      },
      {
        key: "marriage.shaken",
        title: "車検証の氏名・住所変更",
        category: "生活",
        detail: "本来は変更から15日以内。放置すると自動車税の通知が届かず、売却・廃車のときにまとめて手間になる",
        dueOffsetDays: 15,
        requires: ["car"],
      },
      {
        key: "marriage.shako",
        title: "車庫証明を取り直す",
        category: "生活",
        detail: "駐車場所が変わったときに必要。車検証の住所変更より先に済ませる",
        dueOffsetDays: 14,
        requires: ["car", "moving"],
      },
      {
        key: "marriage.chintai",
        title: "賃貸契約の名義・同居人・連帯保証人の変更",
        category: "生活",
        detail: "無断の同居は契約違反になることがある。更新のタイミングに合わせると手数料が抑えられることも",
        dueOffsetDays: 14,
        requires: ["rent"],
      },
      {
        key: "marriage.passport",
        title: "パスポートの氏名変更",
        category: "生活",
        detail: "新婚旅行がある場合、航空券の名義と一致していないと搭乗できないので旅行日から逆算する",
        dueOffsetDays: 60,
        requires: ["passport", "rename"],
      },
      {
        key: "marriage.mobile",
        title: "携帯電話の契約者名義・住所変更",
        category: "生活",
        detail: "家族割の適用条件になることがあるので、同時に2人分のプランも見直す",
        dueOffsetDays: 30,
      },
      {
        key: "marriage.utilities",
        title: "電気・ガス・水道・ネットの契約変更",
        category: "生活",
        detail: "ガスの開栓は立ち会いが必要なので日程を先に押さえる",
        dueOffsetDays: 0,
        requires: ["moving"],
      },
      {
        key: "marriage.subscriptions",
        title: "サブスク・通販サイトの氏名・住所変更",
        category: "生活",
        detail: "重複しているサブスクを2人で洗い出して解約すると、そのまま固定費の削減になる",
        dueOffsetDays: 60,
      },

      // ── 2人で決めること ──────────────────────────────
      {
        key: "marriage.money-rule",
        title: "家計のルールを決める（共同と個人の線引き）",
        category: "2人で決める",
        detail: "何を共同で払い、何を個人の財布から出すか。生活費の負担割合（折半か収入比例か）もここで決める",
        dueOffsetDays: 14,
      },
      {
        key: "marriage.disclose",
        title: "お互いの資産・負債・保険を共有する",
        category: "2人で決める",
        detail: "奨学金・カードローン・車のローンを含めて出し合う。ライフプランの前提条件がここで確定する",
        dueOffsetDays: 30,
      },
      {
        key: "marriage.savings-plan",
        title: "毎月の貯蓄額・投資額を決める",
        category: "2人で決める",
        detail: "生活防衛資金（生活費6ヶ月分）を先に確保し、そのあとNISAの積立額を決める。積立シミュレーターで将来額を確認できる",
        dueOffsetDays: 30,
      },
      {
        key: "marriage.life-events",
        title: "今後10年のライフイベントを棚卸しする",
        category: "2人で決める",
        detail: "住宅・出産・車・転職の時期と金額をざっくり置く。ライフプランのイベント登録に入れると将来の資金繰りが折れ線で見られる",
        dueOffsetDays: 60,
      },
      {
        key: "marriage.work-style",
        title: "働き方（扶養に入るか・共働きを続けるか）を話す",
        category: "2人で決める",
        detail:
          "扶養に入ると手取りは増えるが、厚生年金の加入期間が止まるので将来の年金と遺族保障が細くなる。目先の手取りだけで決めない",
        dueOffsetDays: 30,
      },
      {
        key: "marriage.emergency-info",
        title: "保険証券・口座・緊急連絡先の保管場所を共有",
        category: "2人で決める",
        detail: "どちらかに何かあったときに、もう1人が手続きできる状態にしておく。一覧をメモに残すだけでも効果がある",
        dueOffsetDays: 60,
      },
    ],
  },
  {
    id: "moving",
    name: "引っ越しの手続き",
    baseLabel: "引っ越し日",
    description: "住所変更が必要なものを、転出 → 転入の順に並べています。マイナスの期限は引っ越し日より前という意味です。",
    conditions: [
      { key: "diffcity", label: "市区町村をまたぐ", defaultOn: true, hint: "同一市区町村内なら転居届だけで済みます" },
      { key: "car", label: "車・バイクを持っている" },
      { key: "child", label: "就学中の子どもがいる" },
      { key: "pet", label: "犬を飼っている" },
      { key: "rent", label: "賃貸（旧居・新居どちらか）" },
    ],
    items: [
      { key: "moving.net", title: "インターネット回線の移転手続き", category: "生活", detail: "工事が必要な場合は1ヶ月待ちもあるので最優先で手配する", dueOffsetDays: -30 },
      { key: "moving.kaiyaku", title: "旧居の解約予告を出す", category: "生活", detail: "1ヶ月前予告の契約が多い。遅れるとその分の家賃が二重に発生する", dueOffsetDays: -30, requires: ["rent"] },
      { key: "moving.sodai", title: "粗大ごみ・不用品の処分を予約する", category: "生活", detail: "自治体の回収は2〜3週間待ちになることがある。引っ越し当日にまとめて出すことはできない", dueOffsetDays: -21 },
      { key: "moving.tenko", title: "子どもの転校手続き（在学証明書をもらう）", category: "役所", detail: "今の学校で在学証明書・教科書給与証明書をもらい、転入先の役所で就学通知書を受け取る", dueOffsetDays: -14, requires: ["child"] },
      { key: "moving.tenshutsu", title: "転出届を出す", category: "役所", detail: "引っ越しの14日前から提出できる。転出証明書を受け取る（マイナンバーカードがあれば特例転出で省略可）", dueOffsetDays: -7, requires: ["diffcity"] },
      { key: "moving.utilities-stop", title: "電気・ガス・水道の停止・開始連絡", category: "生活", detail: "遅くとも1週間前まで。ガスの開栓は立ち会いが必要", dueOffsetDays: -7 },
      { key: "moving.mail", title: "郵便の転送届（e転居）", category: "生活", detail: "1年間、旧住所宛の郵便が新住所に転送される。無料", dueOffsetDays: -7 },
      { key: "moving.shako", title: "車庫証明を取り直す", category: "生活", detail: "新しい駐車場の契約書が必要。車検証の住所変更より先に済ませる", dueOffsetDays: 7, requires: ["car"] },
      { key: "moving.company", title: "勤務先へ住所変更・通勤手当の届出", category: "勤務先", detail: "定期券の払い戻しも忘れずに", dueOffsetDays: 7 },
      { key: "moving.tennyu", title: "転入届（転居届）を出す", category: "役所", detail: "引っ越し後14日以内が法定期限。過ぎると過料の対象", dueOffsetDays: 14 },
      { key: "moving.mynumber", title: "マイナンバーカードの住所変更", category: "役所", detail: "転入届と同時に窓口で。転入から90日を過ぎるとカードが失効する", dueOffsetDays: 14 },
      { key: "moving.inkan", title: "印鑑登録をやり直す", category: "役所", detail: "転出すると旧住所の印鑑登録は失効する。新住所で登録し直す", dueOffsetDays: 14, requires: ["diffcity"] },
      { key: "moving.license", title: "運転免許証の住所変更", category: "生活", detail: "警察署でも手続きできる", dueOffsetDays: 14 },
      { key: "moving.shaken", title: "車検証・軽自動車の住所変更", category: "生活", detail: "本来は15日以内。自動車税の通知が届かなくなるので放置しない", dueOffsetDays: 15, requires: ["car"] },
      { key: "moving.pet", title: "犬の登録変更・鑑札の再交付", category: "役所", detail: "転入先の自治体へ。狂犬病予防注射済票も一緒に", dueOffsetDays: 30, requires: ["pet"] },
      { key: "moving.insurance", title: "火災保険・地震保険の手続き", category: "保険", detail: "新居の契約が別途必要。旧居の解約返戻金も請求する", dueOffsetDays: 14, requires: ["rent"] },
      { key: "moving.bank", title: "銀行・カード・証券の住所変更", category: "金融機関", detail: "まとめて1日でやると早い", dueOffsetDays: 30 },
    ],
  },
  {
    id: "baby",
    name: "出産前後の手続き",
    baseLabel: "出産予定日",
    description:
      "申請しないともらえないお金が多い領域です。期限を過ぎると受け取れなくなるものがあるので、期限の厳しいものを前に置いています。",
    conditions: [
      { key: "working", label: "産む側が働いている（会社員・公務員）", defaultOn: true },
      { key: "leave", label: "育児休業を取る", defaultOn: true, hint: "どちらが取るかは分けて登録できます" },
      { key: "firstchild", label: "第1子", defaultOn: true },
    ],
    items: [
      { key: "baby.boshi", title: "母子健康手帳をもらう", category: "役所", detail: "妊娠がわかったら市区町村へ妊娠届。妊婦健診の補助券が一緒にもらえる", dueOffsetDays: -200 },
      { key: "baby.ouen", title: "出産・子育て応援給付金の申請", category: "役所", detail: "妊娠届で5万円、出生届で5万円が目安（自治体により名称・金額が異なる）。面談とセットになっていることが多い", dueOffsetDays: -200 },
      { key: "baby.shussan-ikuji", title: "出産育児一時金の手続き", category: "保険", detail: "子ども1人につき50万円。直接支払制度なら病院が代わりに受け取るので窓口負担が減る", dueOffsetDays: -30 },
      { key: "baby.gendogaku", title: "限度額適用認定証を取っておく", category: "保険", detail: "帝王切開・切迫早産で入院すると保険診療になり高額になる。事前に取っておけば窓口で自己負担限度額までしか払わずに済む", dueOffsetDays: -60 },
      { key: "baby.shussan-teate", title: "出産手当金の申請", category: "勤務先", detail: "産前42日・産後56日について標準報酬日額の2/3。健康保険から出る", dueOffsetDays: 60, requires: ["working"] },
      { key: "baby.ikuji-kyugyo", title: "育児休業給付金の申請", category: "勤務先", detail: "休業開始から180日までは賃金の67%、その後50%。社会保険料も免除される", dueOffsetDays: 30, requires: ["leave"] },
      { key: "baby.shakai-hoken", title: "産休・育休中の社会保険料免除を申請する", category: "勤務先", detail: "免除された期間も保険料を納めたものとして年金額に反映される。会社経由の手続きだが申出が必要", dueOffsetDays: 30, requires: ["working"] },
      { key: "baby.shussei", title: "出生届を出す", category: "役所", detail: "生まれた日を含めて14日以内。出生証明書（医師記入）と母子手帳を持参", dueOffsetDays: 14 },
      { key: "baby.jidou-teate", title: "児童手当の認定請求", category: "役所", detail: "出生の翌日から15日以内。遅れるとその分の月がもらえない（さかのぼれない）", dueOffsetDays: 15 },
      { key: "baby.kenko-hoken", title: "子どもを健康保険に入れる", category: "勤務先", detail: "扶養に入れる手続き。原則として収入の多い方の扶養に入れる", dueOffsetDays: 14 },
      { key: "baby.iryohi-josei", title: "子ども医療費助成の申請", category: "役所", detail: "健康保険証ができてから。自治体によって助成内容が大きく違う", dueOffsetDays: 30 },
      { key: "baby.iryohi-kojo", title: "医療費控除の準備（領収書をまとめる）", category: "税金", detail: "妊婦健診・分娩費・通院のタクシー代も対象になる。年間10万円を超えた分が所得控除。出産育児一時金は差し引く", dueOffsetDays: 90 },
      { key: "baby.hoshou", title: "必要保障額を計算し直す", category: "保険", detail: "子どもが生まれると必要保障額が跳ね上がる。遺族基礎年金も子の人数で増えるので、両方を織り込んで計算する", dueOffsetDays: 60 },
      { key: "baby.gakushi", title: "教育資金の準備方針を決める", category: "2人で決める", detail: "学資保険・NISA・児童手当の積立のどれで用意するか。児童手当を全額貯めるだけで約200万円になる", dueOffsetDays: 90, requires: ["firstchild"] },
      { key: "baby.hoikuen", title: "保育園の申込時期と点数を調べる", category: "2人で決める", detail: "4月入園の申込は前年の秋。復職時期は申込スケジュールから逆算して決める", dueOffsetDays: 60, requires: ["leave"] },
    ],
  },
]

/** 状況チェックを満たす項目だけに絞る */
export function itemsFor(tpl: TodoTemplate, on: Set<string>): TodoTemplateItem[] {
  return tpl.items.filter(i => (i.requires ?? []).every(k => on.has(k)))
}

/** 期限の目安を「基準日＋オフセット」から YYYY-MM-DD に変換する */
export function offsetToDate(baseDate: string, offsetDays: number): string {
  const d = new Date(`${baseDate}T00:00:00`)
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
