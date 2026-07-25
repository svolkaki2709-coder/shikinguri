"use client"

import { useEffect, useState } from "react"

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
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)

  async function load() {
    setLoading(true)
    try {
      const d = await fetch("/api/members").then(r => r.json())
      setMembers(d.members ?? [])
      setMeId(d.me?.id ?? null)
      setIsOwner(!!d.me?.isOwner)
    } catch {
      setMsg({ type: "err", text: "メンバー情報の取得に失敗しました" })
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

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
      setMsg({ type: "ok", text: `${d.member.email} を招待しました。相手がこのアドレスのGoogleアカウントでログインすると共同データを閲覧できます。` })
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
      {/* 説明 */}
      <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-800 p-4 space-y-3">
        <h2 className="text-sm font-bold text-slate-100">世帯メンバー</h2>
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-xs text-blue-300 space-y-1.5">
          <p className="font-semibold">招待した相手に見えるもの</p>
          <p>✅ <span className="font-semibold">共同</span>の明細・入金・予算・口座・資産</p>
          <p>🚫 あなたの<span className="font-semibold">個人</span>データは一切見えません（明細・収入・予算・資産・給与明細のすべて）</p>
          <p className="text-blue-400/80 pt-1">相手も自分の「個人」を持てます。互いの個人データは見えません。</p>
        </div>

        {isOwner ? (
          <div className="space-y-2 pt-1">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Googleアカウントのメールアドレス</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="partner@gmail.com" autoComplete="off"
                className="w-full border border-slate-700 rounded-lg px-3 py-2 text-sm bg-slate-900 text-slate-100 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">表示名（任意）</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="例：あかり"
                className="w-full border border-slate-700 rounded-lg px-3 py-2 text-sm bg-slate-900 text-slate-100 outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={handleAdd} disabled={saving || !email.trim()}
              className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors">
              {saving ? "追加中..." : "メンバーを招待する"}
            </button>
            <p className="text-[11px] text-slate-500">
              招待メールは送られません。相手がこのアドレスのGoogleアカウントでログインすれば、そのまま利用開始できます。
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-500">メンバーの追加・削除は世帯の管理者のみ行えます。</p>
        )}

        {msg && (
          <div className={`text-xs rounded-lg px-3 py-2 ${msg.type === "ok" ? "bg-green-500/10 text-green-300" : "bg-red-500/10 text-red-300"}`}>
            {msg.text}
          </div>
        )}
      </div>

      {/* 一覧 */}
      <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-800 overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-800 border-b border-slate-800">
          <h3 className="text-xs font-semibold text-slate-300">登録済みメンバー</h3>
        </div>
        {loading && <p className="text-center text-xs text-slate-500 py-6">読み込み中...</p>}
        {!loading && members.map(m => (
          <div key={m.id} className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 last:border-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-medium text-slate-100 truncate">{m.display_name || m.email}</span>
                {m.role === "owner" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold">管理者</span>
                )}
                {m.id === meId && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-semibold">あなた</span>
                )}
                {!m.is_active && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-semibold">停止中</span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 truncate">{m.email}</p>
            </div>
            {isOwner && m.role !== "owner" && (
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
          <p className="text-center text-xs text-slate-500 py-6">メンバーがいません</p>
        )}
      </div>
    </div>
  )
}
