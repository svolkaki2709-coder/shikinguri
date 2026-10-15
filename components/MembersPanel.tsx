"use client"

import { useEffect, useState } from "react"

interface Personal { categories: number; accounts: number; ready: boolean }

interface Member {
  id: number
  email: string
  display_name: string | null
  role: string
  is_active: boolean
}

export function MembersPanel({ isPC }: { isPC: boolean }) {
  const [members, setMembers] = useState<Member[]>([])
  const [meId, setMeId] = useState<number | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [personal, setPersonal] = useState<Personal | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  // 編集中のメンバー（表示名・メールアドレスの変更）
  const [editing, setEditing] = useState<{ id: number; name: string; email: string } | null>(null)

  async function load() {
    setLoading(true)
    try {
      const d = await fetch("/api/members").then(r => r.json())
      setMembers(d.members ?? [])
      setMeId(d.me?.id ?? null)
      setIsOwner(!!d.me?.isOwner)
      setPersonal(d.me?.personal ?? null)
    } catch {
      setMsg({ type: "err", text: "メンバー情報の取得に失敗しました" })
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  async function handleSeedPersonal() {
    setSeeding(true)
    try {
      const res = await fetch("/api/setup", { method: "POST" })
      const d = await res.json()
      if (!res.ok) { setMsg({ type: "err", text: "初期設定に失敗しました" }); return }
      setMsg({
        type: "ok",
        text: d.seeded
          ? `個人用のカテゴリ${d.categories}件と支払方法を作成しました`
          : "すでに設定済みです",
      })
      load()
    } finally {
      setSeeding(false)
    }
  }

  async function handleAdd() {
    if (!email.trim()) return
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, display_name: name }),
      })
      const d = await res.json()
      if (!res.ok) { setMsg({ type: "err", text: d.error ?? "追加に失敗しました" }); return }
      setEmail(""); setName("")
      setMsg({
        type: "ok",
        text: `${d.member.email} を招待しました。相手がこのアドレスのGoogleアカウントでログインすれば、すぐに共同データを使えます。`
          + (d.seed?.seeded ? `個人用のカテゴリ${d.seed.categories}件も用意しました（中身は空で、あなたからは見えません）。` : ""),
      })
      load()
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(m: Member) {
    const next = !m.is_active
    if (!confirm(next
      ? `${m.email} のアクセスを再開しますか？`
      : `${m.email} のアクセスを停止しますか？\n（データは残ります。あとで再開できます）`)) return
    const res = await fetch("/api/members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id, is_active: next }),
    })
    if (!res.ok) { const d = await res.json(); alert(d.error ?? "変更に失敗しました"); return }
    load()
  }

  async function handleSaveMember() {
    if (!editing) return
    const before = members.find(m => m.id === editing.id)
    const addrChanged = before && before.email.toLowerCase() !== editing.email.trim().toLowerCase()
    if (addrChanged && !confirm(
      `ログイン用のアドレスを
${before!.email}
→ ${editing.email.trim()}
に変更します。

` +
      `・変更後は新しいアドレスのGoogleアカウントでしかログインできません
` +
      `・記録済みのデータはそのまま引き継がれます

よろしいですか？`
    )) return

    const res = await fetch("/api/members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editing.id, display_name: editing.name, email: editing.email }),
    })
    const d = await res.json()
    if (!res.ok) { setMsg({ type: "err", text: d.error ?? "変更に失敗しました" }); return }
    setMsg({ type: "ok", text: `${d.member.display_name || d.member.email} の情報を更新しました` })
    setEditing(null)
    load()
  }

  async function handleDelete(m: Member) {
    if (!confirm(
      `${m.email} を世帯から削除しますか？\n\n` +
      `・この人の「個人」データ（明細・収入・予算・資産など）は完全に削除されます\n` +
      `・「共同」データは残ります\n\nこの操作は取り消せません。`
    )) return
    const res = await fetch(`/api/members?id=${m.id}`, { method: "DELETE" })
    const d = await res.json()
    if (!res.ok) { alert(d.error ?? "削除に失敗しました"); return }
    setMsg({ type: "ok", text: `削除しました（個人データ ${d.deletedPersonalRows} 件をあわせて削除）` })
    load()
  }

  return (
    <div className={isPC ? "grid grid-cols-2 gap-4 items-start" : "space-y-3"}>
      {/* 招待 */}
      <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-800 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-slate-100">世帯メンバー</h2>
          <details className="text-xs text-blue-300 group">
            <summary className="cursor-pointer list-none text-[11px] text-blue-400 hover:text-blue-300">ⓘ 相手に見えるもの</summary>
            <div className="mt-1.5 bg-blue-500/10 border border-blue-500/30 rounded-lg p-2 space-y-1">
              <p>✅ <span className="font-semibold">共同</span>の明細・入金・予算・口座・資産</p>
              <p>🚫 あなたの<span className="font-semibold">個人</span>データは一切見えません（明細・収入・予算・資産・給与明細のすべて）</p>
              <p className="text-blue-400/80">相手も自分の「個人」を持てます。互いの個人データは見えません。</p>
            </div>
          </details>
        </div>

        {isOwner ? (
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_10rem_auto] gap-2"
            title="招待メールは送られません。相手がこのアドレスのGoogleアカウントでログインすれば、そのまま利用開始できます。">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Googleアカウントのメール（partner@gmail.com）" autoComplete="off" aria-label="Googleアカウントのメールアドレス"
              className="min-w-0 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm bg-slate-900 text-slate-100 outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="表示名（任意）" aria-label="表示名（任意）"
              className="min-w-0 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm bg-slate-900 text-slate-100 outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={handleAdd} disabled={saving || !email.trim()}
              className="bg-blue-600 text-white rounded-lg px-4 py-1.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors whitespace-nowrap">
              {saving ? "追加中..." : "招待"}
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-500">メンバーの追加・削除は世帯の管理者のみ行えます。</p>
        )}

        {msg && (
          <div className={`text-xs rounded-lg px-2.5 py-1.5 ${msg.type === "ok" ? "bg-green-500/10 text-green-300" : "bg-red-500/10 text-red-300"}`}>
            {msg.text}
          </div>
        )}
      </div>

      {/* 自分の個人スペース */}
      {personal && !personal.ready && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold text-amber-300 flex-1 min-w-0"
            title={`あなたの「個人」タブには${personal.categories === 0 ? "カテゴリ" : ""}${personal.categories === 0 && personal.accounts === 0 ? "も" : ""}${personal.accounts === 0 ? "支払方法" : ""}がまだありません。このままでは個人の支出を記録できないため、よく使うカテゴリと「現金orPayPay」を作成します。`}>
            個人スペースの初期設定が未完了 <span className="text-[11px] font-normal text-amber-200/70 cursor-help">ⓘ</span>
          </p>
          <button onClick={handleSeedPersonal} disabled={seeding}
            className="bg-amber-500 text-white rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-amber-600 disabled:opacity-40 transition-colors shrink-0">
            {seeding ? "作成中..." : "個人用の初期セットを作成"}
          </button>
        </div>
      )}

      {/* 一覧 */}
      <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-800 overflow-hidden">
        <div className="px-3 py-1.5 bg-slate-800 border-b border-slate-800 flex items-center gap-2">
          <h3 className="text-xs font-semibold text-slate-300">登録済みメンバー</h3>
          {!loading && <span className="text-[11px] text-slate-500">{members.length}人</span>}
        </div>
        {loading && <p className="text-xs text-slate-500 px-3 py-2">読み込み中...</p>}
        {!loading && members.map(m => (
          <div key={m.id} className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 last:border-0">
            <div className="min-w-0 flex-1">
              {editing?.id === m.id ? (
                <div className="grid grid-cols-1 sm:grid-cols-[8rem_1fr_auto] gap-1.5">
                  <input
                    value={editing.name}
                    onChange={e => setEditing({ ...editing, name: e.target.value })}
                    placeholder="表示名"
                    className="min-w-0 bg-slate-900 text-slate-100 border border-slate-700 rounded-lg px-2 py-1.5 text-sm"
                  />
                  <input
                    value={editing.email}
                    onChange={e => setEditing({ ...editing, email: e.target.value })}
                    placeholder="ログイン用のGoogleアカウント"
                    inputMode="email"
                    className="min-w-0 bg-slate-900 text-slate-100 border border-slate-700 rounded-lg px-2 py-1.5 text-sm"
                  />
                  <div className="flex gap-1.5">
                    <button onClick={handleSaveMember}
                      className="flex-1 bg-blue-600 text-white rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-blue-700 transition-colors">
                      保存
                    </button>
                    <button onClick={() => setEditing(null)}
                      className="px-3 rounded-lg border border-slate-700 text-xs text-slate-400">
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm font-medium text-slate-100 truncate shrink-0 max-w-[50%]">{m.display_name || m.email}</span>
                  {m.role === "owner" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold shrink-0">管理者</span>
                  )}
                  {m.id === meId && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-semibold shrink-0">あなた</span>
                  )}
                  {!m.is_active && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-semibold shrink-0">停止中</span>
                  )}
                  {m.display_name && <span className="text-[11px] text-slate-500 truncate min-w-0">{m.email}</span>}
                </div>
              )}
            </div>
            {editing?.id !== m.id && (isOwner || m.id === meId) && (
              <button
                onClick={() => setEditing({ id: m.id, name: m.display_name ?? "", email: m.email })}
                className="text-[11px] px-2 py-1 rounded border border-slate-700 text-slate-400 hover:text-slate-100 hover:border-slate-600 transition-colors shrink-0"
              >
                変更
              </button>
            )}
            {isOwner && m.role !== "owner" && editing?.id !== m.id && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => handleToggleActive(m)}
                  className="text-[11px] px-2 py-1 rounded border border-slate-700 text-slate-400 hover:text-slate-100 hover:border-slate-600 transition-colors">
                  {m.is_active ? "停止" : "再開"}
                </button>
                <button onClick={() => handleDelete(m)}
                  className="text-[11px] px-2 py-1 rounded border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors">
                  削除
                </button>
              </div>
            )}
          </div>
        ))}
        {!loading && members.length === 0 && (
          <p className="text-xs text-slate-500 px-3 py-2">メンバーがいません</p>
        )}
      </div>
    </div>
  )
}
