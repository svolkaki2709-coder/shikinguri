"use client"

import { useEffect, useMemo, useState } from "react"
import { PageHeader } from "@/components/PageHeader"
import { BottomNav } from "@/components/BottomNav"
import { useViewMode } from "@/components/ViewModeContext"
import { SaveButton } from "@/components/SaveButton"
import { TODO_TEMPLATES, offsetToDate, itemsFor, type TodoTemplate } from "@/lib/todoTemplates"

interface Todo {
  id: number
  title: string
  category: string
  detail: string
  assignee: string
  due_date: string | null
  done: boolean
  template_key: string | null
}

const CATEGORY_STYLE: Record<string, string> = {
  役所: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  勤務先: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  金融機関: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  保険: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  生活: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  "2人で決める": "bg-pink-500/15 text-pink-300 border-pink-500/30",
  税金: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  その他: "bg-slate-700/50 text-slate-300 border-slate-600",
}
/** 既定のカテゴリ。ここに無いものを自由に入力してもよく、入力すると次から候補に出る */
const BASE_CATEGORIES = ["役所", "勤務先", "金融機関", "保険", "税金", "生活", "2人で決める", "その他"]

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** 期限までの残り日数。期限なしは null */
function daysLeft(due: string | null): number | null {
  if (!due) return null
  const a = new Date(`${due}T00:00:00`).getTime()
  const b = new Date(`${todayStr()}T00:00:00`).getTime()
  return Math.round((a - b) / 86400000)
}

function dueLabel(due: string | null) {
  const d = daysLeft(due)
  if (d === null) return { text: "期限なし", cls: "text-slate-500" }
  if (d < 0) return { text: `${-d}日超過`, cls: "text-red-400 font-semibold" }
  if (d === 0) return { text: "今日", cls: "text-orange-400 font-semibold" }
  if (d <= 7) return { text: `あと${d}日`, cls: "text-orange-300" }
  return { text: `あと${d}日`, cls: "text-slate-400" }
}

export default function TodosPage() {
  const { mode } = useViewMode()
  const isPC = mode === "pc"

  const [scope, setScope] = useState<"joint" | "self">("joint")
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [showDone, setShowDone] = useState(false)
  const [groupBy, setGroupBy] = useState<"due" | "category">("due")
  const [assigneeFilter, setAssigneeFilter] = useState("")
  const [editingId, setEditingId] = useState<number | null>(null)
  const [openTemplate, setOpenTemplate] = useState(false)
  const [members, setMembers] = useState<string[]>([])

  useEffect(() => { load() }, [scope])
  useEffect(() => {
    // 担当者の候補は、世帯メンバー（設定で招待した相手）とライフプランの家族構成の両方から拾う。
    // 招待した相手が候補に出ないと、担当を分けられない。
    Promise.all([
      fetch("/api/members").then(r => r.json()).catch(() => ({})),
      fetch("/api/lifeplan?card_type=joint").then(r => r.json()).catch(() => ({})),
    ]).then(([mem, life]) => {
      const names = [
        ...(mem.members ?? []).map((u: { display_name: string | null; email: string }) => u.display_name || u.email),
        ...(life.members ?? []).map((m: { name: string }) => m.name),
      ].filter(Boolean)
      setMembers(Array.from(new Set<string>(names)))
    })
  }, [])

  async function load() {
    setLoading(true)
    try {
      const d = await fetch(`/api/todos?card_type=${scope}`).then(r => r.json())
      setTodos(d.todos ?? [])
    } finally {
      setLoading(false)
    }
  }

  const categoryOptions = useMemo(() => {
    const set = new Set<string>(BASE_CATEGORIES)
    todos.forEach(t => { if (t.category) set.add(t.category) })
    return Array.from(set)
  }, [todos])

  // どのテンプレートから何件入っているか（取り込みの取り消しに使う）
  const importedTemplates = useMemo(() => {
    return TODO_TEMPLATES.map(t => ({
      tpl: t,
      count: todos.filter(x => x.template_key?.startsWith(`${t.id}.`)).length,
    })).filter(x => x.count > 0)
  }, [todos])

  const assigneeOptions = useMemo(() => {
    const set = new Set<string>(["2人で"])
    members.forEach(m => set.add(m))
    todos.forEach(t => { if (t.assignee) set.add(t.assignee) })
    return Array.from(set)
  }, [members, todos])

  async function toggleDone(t: Todo) {
    setTodos(prev => prev.map(x => (x.id === t.id ? { ...x, done: !x.done } : x)))
    await fetch("/api/todos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, done: !t.done }),
    })
  }

  async function saveEdit(t: Todo) {
    const res = await fetch("/api/todos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    })
    if (!res.ok) throw new Error("保存に失敗しました")
    setEditingId(null)
    await load()
  }

  async function remove(id: number) {
    if (!confirm("この項目を削除しますか？")) return
    await fetch(`/api/todos?id=${id}`, { method: "DELETE" })
    await load()
  }

  async function undoTemplate(tplId: string, name: string, count: number) {
    if (!confirm(`「${name}」から取り込んだ${count}件をすべて削除します。よろしいですか？
（完了済みのチェックも一緒に消えます）`)) return
    await fetch(`/api/todos?template=${tplId}&card_type=${scope}`, { method: "DELETE" })
    await load()
  }

  async function bulkAssignee(from: string, to: string) {
    const res = await fetch("/api/todos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bulk: "assignee", from, to, card_type: scope }),
    })
    if (!res.ok) throw new Error("変更に失敗しました")
    await load()
  }

  async function clearDone() {
    const n = todos.filter(t => t.done).length
    if (n === 0) return
    if (!confirm(`完了した${n}件をリストから削除しますか？`)) return
    await fetch(`/api/todos?done=1&card_type=${scope}`, { method: "DELETE" })
    await load()
  }

  const visible = todos
    .filter(t => showDone || !t.done)
    .filter(t => !assigneeFilter || t.assignee === assigneeFilter)

  const stats = useMemo(() => {
    const open = todos.filter(t => !t.done)
    return {
      total: todos.length,
      done: todos.filter(t => t.done).length,
      overdue: open.filter(t => (daysLeft(t.due_date) ?? 99999) < 0).length,
      soon: open.filter(t => { const d = daysLeft(t.due_date); return d !== null && d >= 0 && d <= 7 }).length,
      open: open.length,
    }
  }, [todos])

  // 期限順のときは「超過 / 今週 / 今月 / それ以降 / 期限なし」の塊にする
  const groups = useMemo(() => {
    if (groupBy === "category") {
      const byCat = new Map<string, Todo[]>()
      categoryOptions.forEach(c => byCat.set(c, []))
      visible.forEach(t => {
        const k = t.category || "その他"
        if (!byCat.has(k)) byCat.set(k, [])
        byCat.get(k)!.push(t)
      })
      return Array.from(byCat.entries())
        .filter(([, list]) => list.length > 0)
        .map(([name, list]) => ({ name, list }))
    }
    const buckets: { name: string; list: Todo[] }[] = [
      { name: "期限を過ぎている", list: [] },
      { name: "今週（7日以内）", list: [] },
      { name: "今月（30日以内）", list: [] },
      { name: "それ以降", list: [] },
      { name: "期限なし", list: [] },
    ]
    visible.forEach(t => {
      const d = daysLeft(t.due_date)
      if (d === null) buckets[4].list.push(t)
      else if (d < 0) buckets[0].list.push(t)
      else if (d <= 7) buckets[1].list.push(t)
      else if (d <= 30) buckets[2].list.push(t)
      else buckets[3].list.push(t)
    })
    return buckets.filter(b => b.list.length > 0)
  }, [visible, groupBy, categoryOptions])

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      <PageHeader title="やることリスト（2人で管理）" />

      <div className={`px-4 py-4 space-y-4 ${isPC ? "max-w-5xl mx-auto" : "max-w-md mx-auto"}`}>
        {/* スコープ切替 */}
        <div className="flex gap-2">
          {(["joint", "self"] as const).map(s => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                scope === s ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200"
              }`}
            >
              {s === "joint" ? "👫 共同（2人で共有）" : "🙋 自分だけ"}
            </button>
          ))}
        </div>

        {/* サマリー */}
        <div className="grid grid-cols-4 gap-2">
          <Stat label="残り" value={stats.open} tone="text-slate-100" />
          <Stat label="超過" value={stats.overdue} tone={stats.overdue > 0 ? "text-red-400" : "text-slate-500"} />
          <Stat label="今週" value={stats.soon} tone={stats.soon > 0 ? "text-orange-400" : "text-slate-500"} />
          <Stat label="完了" value={stats.done} tone="text-green-400" />
        </div>

        {/* 進捗バー */}
        {stats.total > 0 && (
          <div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${Math.round((stats.done / stats.total) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {stats.total}件中 {stats.done}件 完了（{Math.round((stats.done / stats.total) * 100)}%）
            </p>
          </div>
        )}

        <button
          onClick={() => setOpenTemplate(true)}
          className="w-full bg-slate-900 border border-blue-500/40 text-blue-300 rounded-lg py-2.5 text-sm font-semibold hover:bg-slate-800 transition-colors"
        >
          ＋ テンプレートから取り込む（入籍・引っ越し・出産）
        </button>

        {importedTemplates.length > 0 && (
          <ManagePanel
            imported={importedTemplates}
            assignees={assigneeOptions}
            counts={todos.filter(t => !t.done)}
            onUndo={undoTemplate}
            onBulkAssignee={bulkAssignee}
          />
        )}

        <NewTodoForm scope={scope} assignees={assigneeOptions} categories={categoryOptions} onAdded={load} />

        {/* 表示切替 */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex rounded-lg overflow-hidden border border-slate-800">
            {(["due", "category"] as const).map(g => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`px-3 py-1.5 ${groupBy === g ? "bg-slate-700 text-slate-100" : "bg-slate-900 text-slate-400"}`}
              >
                {g === "due" ? "期限順" : "カテゴリ別"}
              </button>
            ))}
          </div>
          <select
            value={assigneeFilter}
            onChange={e => setAssigneeFilter(e.target.value)}
            className="bg-slate-900 text-slate-100 border border-slate-800 rounded-lg px-2 py-1.5"
          >
            <option value="">担当：すべて</option>
            {assigneeOptions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-slate-400">
            <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
            完了も表示
          </label>
          {stats.done > 0 && (
            <button onClick={clearDone} className="ml-auto text-slate-500 hover:text-red-400">
              完了分を削除
            </button>
          )}
        </div>

        {/* リスト */}
        {loading ? (
          <p className="text-sm text-slate-500 text-center py-8">読み込み中...</p>
        ) : visible.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
            <p className="text-sm text-slate-400">まだ項目がありません</p>
            <p className="text-xs text-slate-500 mt-2">
              上の「テンプレートから取り込む」で、入籍後にやる手続きを一式まとめて登録できます
            </p>
          </div>
        ) : (
          groups.map(g => (
            <div key={g.name}>
              <h2 className="text-xs font-semibold text-slate-500 mb-1.5 px-1">
                {g.name}（{g.list.length}）
              </h2>
              <div className="space-y-1.5">
                {g.list.map(t =>
                  editingId === t.id ? (
                    <EditRow
                      key={t.id}
                      todo={t}
                      assignees={assigneeOptions}
                      categories={categoryOptions}
                      onCancel={() => setEditingId(null)}
                      onSave={saveEdit}
                      onDelete={() => remove(t.id)}
                    />
                  ) : (
                    <TodoRow key={t.id} todo={t} onToggle={() => toggleDone(t)} onEdit={() => setEditingId(t.id)} />
                  )
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {openTemplate && (
        <TemplateModal
          scope={scope}
          assignees={assigneeOptions}
          onClose={() => setOpenTemplate(false)}
          onDone={async () => { setOpenTemplate(false); await load() }}
        />
      )}

      <BottomNav />
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-2 py-2 text-center">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className={`text-lg font-bold ${tone}`}>{value}</p>
    </div>
  )
}

function CategoryChip({ name }: { name: string }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${CATEGORY_STYLE[name] ?? CATEGORY_STYLE["その他"]}`}>
      {name}
    </span>
  )
}

function TodoRow({ todo, onToggle, onEdit }: { todo: Todo; onToggle: () => void; onEdit: () => void }) {
  const [open, setOpen] = useState(false)
  const due = dueLabel(todo.due_date)

  return (
    <div className={`bg-slate-900 border rounded-xl px-3 py-2.5 transition-colors ${
      todo.done ? "border-slate-800 opacity-50" : "border-slate-800"
    }`}>
      <div className="flex items-start gap-2.5">
        <button
          onClick={onToggle}
          aria-label={todo.done ? "未完了に戻す" : "完了にする"}
          className={`mt-0.5 w-5 h-5 shrink-0 rounded border flex items-center justify-center text-xs transition-colors ${
            todo.done ? "bg-green-600 border-green-600 text-white" : "border-slate-600 hover:border-green-500"
          }`}
        >
          {todo.done ? "✓" : ""}
        </button>

        <div className="flex-1 min-w-0">
          <button onClick={() => setOpen(v => !v)} className="text-left w-full">
            <p className={`text-sm ${todo.done ? "line-through text-slate-500" : "text-slate-100"}`}>{todo.title}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <CategoryChip name={todo.category} />
              {todo.assignee && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">👤 {todo.assignee}</span>
              )}
              {todo.due_date && <span className="text-[10px] text-slate-500">{todo.due_date}</span>}
              {!todo.done && <span className={`text-[10px] ${due.cls}`}>{due.text}</span>}
            </div>
          </button>

          {open && (
            <div className="mt-2 pt-2 border-t border-slate-800">
              {todo.detail && <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">{todo.detail}</p>}
              <button onClick={onEdit} className="text-xs text-blue-400 hover:text-blue-300 mt-2">
                編集する
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EditRow({ todo, assignees, categories, onCancel, onSave, onDelete }: {
  todo: Todo
  assignees: string[]
  categories: string[]
  onCancel: () => void
  onSave: (t: Todo) => Promise<void>
  onDelete: () => void
}) {
  const [draft, setDraft] = useState<Todo>(todo)
  const input = "w-full bg-slate-900 text-slate-100 border border-slate-700 rounded-lg px-2 py-1.5 text-sm"

  return (
    <div className="bg-slate-900 border border-blue-500/40 rounded-xl p-3 space-y-2">
      <input className={input} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <input
          className={input}
          list="todo-categories"
          placeholder="カテゴリ"
          value={draft.category}
          onChange={e => setDraft({ ...draft, category: e.target.value })}
        />
        <datalist id="todo-categories">
          {categories.map(c => <option key={c} value={c} />)}
        </datalist>
        <input
          className={input}
          list="todo-assignees"
          placeholder="担当"
          value={draft.assignee}
          onChange={e => setDraft({ ...draft, assignee: e.target.value })}
        />
        <datalist id="todo-assignees">
          {assignees.map(a => <option key={a} value={a} />)}
        </datalist>
      </div>
      <input
        type="date"
        className={input}
        value={draft.due_date ?? ""}
        onChange={e => setDraft({ ...draft, due_date: e.target.value || null })}
      />
      <textarea
        className={`${input} h-20`}
        placeholder="メモ・持ち物・注意点"
        value={draft.detail}
        onChange={e => setDraft({ ...draft, detail: e.target.value })}
      />
      <div className="flex gap-2">
        <SaveButton label="保存" onSave={() => onSave(draft)} className="flex-1" />
        <button onClick={onCancel} className="px-4 rounded-lg border border-slate-700 text-sm text-slate-400">
          取消
        </button>
        <button onClick={onDelete} className="px-4 rounded-lg border border-red-900 text-sm text-red-400">
          削除
        </button>
      </div>
    </div>
  )
}

function NewTodoForm({ scope, assignees, categories, onAdded }: {
  scope: string
  assignees: string[]
  categories: string[]
  onAdded: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("その他")
  const [assignee, setAssignee] = useState("")
  const [due, setDue] = useState("")
  const [detail, setDetail] = useState("")
  const input = "w-full bg-slate-900 text-slate-100 border border-slate-700 rounded-lg px-2 py-2 text-sm"

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-slate-900 border border-slate-800 text-slate-400 rounded-lg py-2.5 text-sm hover:text-slate-200 transition-colors"
      >
        ＋ 自分たちで項目を追加する
      </button>
    )
  }

  async function add() {
    if (!title.trim()) throw new Error("項目名を入れてください")
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, category, assignee, due_date: due || null, detail, card_type: scope }),
    })
    if (!res.ok) throw new Error("保存に失敗しました")
    setTitle(""); setDetail(""); setDue("")
    await onAdded()
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
      <input className={input} placeholder="やること（例：銀行口座の名義変更）" value={title} onChange={e => setTitle(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <input
          className={input}
          list="todo-categories-new"
          placeholder="カテゴリ（自由に作れます）"
          value={category}
          onChange={e => setCategory(e.target.value)}
        />
        <datalist id="todo-categories-new">
          {categories.map(c => <option key={c} value={c} />)}
        </datalist>
        <input className={input} list="todo-assignees-new" placeholder="担当" value={assignee} onChange={e => setAssignee(e.target.value)} />
        <datalist id="todo-assignees-new">
          {assignees.map(a => <option key={a} value={a} />)}
        </datalist>
      </div>
      <input type="date" className={input} value={due} onChange={e => setDue(e.target.value)} />
      <textarea className={`${input} h-16`} placeholder="メモ（持ち物・窓口など）" value={detail} onChange={e => setDetail(e.target.value)} />
      <div className="flex gap-2">
        <SaveButton label="追加する" savedLabel="追加しました" onSave={add} className="flex-1" />
        <button onClick={() => setOpen(false)} className="px-4 rounded-lg border border-slate-700 text-sm text-slate-400">
          閉じる
        </button>
      </div>
    </div>
  )
}

/** テンプレートごとの、最初からオンにしておく状況チェック */
function defaultConds(t: TodoTemplate) {
  return new Set(t.conditions.filter(c => c.defaultOn).map(c => c.key))
}

/**
 * 取り込んだあとのやり直し。
 * テンプレートは一度に数十件入るので、間違えたときに1件ずつ消させない。
 */
function ManagePanel({ imported, assignees, counts, onUndo, onBulkAssignee }: {
  imported: { tpl: TodoTemplate; count: number }[]
  assignees: string[]
  counts: Todo[]
  onUndo: (tplId: string, name: string, count: number) => Promise<void>
  onBulkAssignee: (from: string, to: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(assignees[0] ?? "2人で")
  const [to, setTo] = useState("")
  const input = "w-full bg-slate-900 text-slate-100 border border-slate-700 rounded-lg px-2 py-2 text-sm"
  const fromCount = counts.filter(t => t.assignee === from).length

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-xs text-slate-500 hover:text-slate-300 py-1"
      >
        取り込みのやり直し・担当の一括変更
      </button>
    )
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">取り込みのやり直し</h3>
        <button onClick={() => setOpen(false)} className="text-slate-500 text-lg leading-none">×</button>
      </div>

      <div>
        <p className="text-xs text-slate-400 mb-1.5">担当をまとめて変える（未完了のみ）</p>
        <div className="flex items-center gap-2">
          <select className={input} value={from} onChange={e => setFrom(e.target.value)}>
            {assignees.map(a => <option key={a} value={a}>{a}（{counts.filter(t => t.assignee === a).length}）</option>)}
          </select>
          <span className="text-slate-500 text-sm">→</span>
          <input className={input} list="bulk-assignees" placeholder="変更後の担当" value={to} onChange={e => setTo(e.target.value)} />
          <datalist id="bulk-assignees">
            {assignees.map(a => <option key={a} value={a} />)}
          </datalist>
        </div>
        <div className="mt-2">
          <SaveButton
            label={`${fromCount}件の担当を変更する`}
            savedLabel="変更しました"
            onSave={async () => {
              if (!to.trim()) throw new Error("変更後の担当を入れてください")
              await onBulkAssignee(from, to.trim())
            }}
          />
        </div>
        <p className="text-[10px] text-slate-500 mt-1">
          全部まとめて変えたあと、片方が担当する項目だけ個別に直すのが早いです
        </p>
      </div>

      <div className="pt-2 border-t border-slate-800">
        <p className="text-xs text-slate-400 mb-1.5">取り込みを取り消す（そのテンプレート由来の項目を全削除）</p>
        <div className="space-y-1.5">
          {imported.map(({ tpl, count }) => (
            <div key={tpl.id} className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-300">{tpl.name}（{count}件）</span>
              <button
                onClick={() => onUndo(tpl.id, tpl.name, count)}
                className="text-xs text-red-400 border border-red-900 rounded-lg px-2.5 py-1.5 hover:bg-red-500/10 transition-colors shrink-0"
              >
                取り消す
              </button>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-500 mt-1.5">
          取り消したあとは、状況チェックと担当を選び直して取り込み直せます
        </p>
      </div>
    </div>
  )
}

function TemplateModal({ scope, assignees, onClose, onDone }: {
  scope: string
  assignees: string[]
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [tpl, setTpl] = useState<TodoTemplate>(TODO_TEMPLATES[0])
  const [baseDate, setBaseDate] = useState(todayStr())
  const [assignee, setAssignee] = useState("2人で")
  // 状況チェック。ここを切り替えると、対象になる項目が自動で入れ替わる
  const [conds, setConds] = useState<Set<string>>(defaultConds(TODO_TEMPLATES[0]))
  // ユーザーが個別に外した項目。状況チェックを変えても、その意思は残す
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [result, setResult] = useState("")

  const applicable = itemsFor(tpl, conds)
  const selected = applicable.filter(i => !excluded.has(i.key))

  function switchTpl(t: TodoTemplate) {
    setTpl(t)
    setConds(defaultConds(t))
    setExcluded(new Set())
    setResult("")
  }

  async function importItems() {
    const items = selected
    if (items.length === 0) throw new Error("取り込む項目を選んでください")
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        card_type: scope,
        todos: items.map((i, idx) => ({
          title: i.title,
          category: i.category,
          detail: i.detail,
          assignee,
          due_date: offsetToDate(baseDate, i.dueOffsetDays),
          template_key: i.key,
          sort_order: idx,
        })),
      }),
    })
    if (!res.ok) throw new Error("取り込みに失敗しました")
    const d = await res.json()
    setResult(`${d.count}件を追加しました${d.skipped > 0 ? `（既に登録済みの${d.skipped}件は飛ばしました）` : ""}`)
    await onDone()
  }

  const input = "w-full bg-slate-900 text-slate-100 border border-slate-700 rounded-lg px-2 py-2 text-sm"

  return (
    <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-slate-900 border border-slate-800 rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-4 space-y-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-100">テンプレートから取り込む</h2>
          <button onClick={onClose} className="text-slate-500 text-xl leading-none">×</button>
        </div>

        <div className="flex gap-1.5">
          {TODO_TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => switchTpl(t)}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
                tpl.id === t.id ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>

        <p className="text-xs text-slate-400 leading-relaxed bg-slate-800/50 rounded-lg p-2.5">{tpl.description}</p>

        <div>
          <p className="text-xs font-semibold text-slate-300 mb-1.5">当てはまるものにチェック</p>
          <div className="flex flex-wrap gap-1.5">
            {tpl.conditions.map(c => {
              const on = conds.has(c.key)
              return (
                <button
                  key={c.key}
                  title={c.hint}
                  onClick={() => setConds(prev => {
                    const next = new Set(prev)
                    if (next.has(c.key)) next.delete(c.key); else next.add(c.key)
                    return next
                  })}
                  className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                    on
                      ? "bg-blue-500/15 border-blue-500/50 text-blue-300"
                      : "bg-slate-900 border-slate-700 text-slate-500"
                  }`}
                >
                  {on ? "✓ " : ""}{c.label}
                </button>
              )
            })}
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5">
            チェックを外した状況の手続き（例：車を持っていないなら車関係）はリストに出ません
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-slate-400 block mb-1">{tpl.baseLabel}</label>
            <input type="date" className={input} value={baseDate} onChange={e => setBaseDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">担当（あとで個別に変えられます）</label>
            <input className={input} list="tpl-assignees" value={assignee} onChange={e => setAssignee(e.target.value)} />
            <datalist id="tpl-assignees">
              {assignees.map(a => <option key={a} value={a} />)}
            </datalist>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">
            {selected.length} / {applicable.length} 件を選択中（全{tpl.items.length}件中、状況に該当するもの）
          </span>
          <div className="flex gap-3">
            <button onClick={() => setExcluded(new Set())} className="text-blue-400">すべて選択</button>
            <button onClick={() => setExcluded(new Set(applicable.map(i => i.key)))} className="text-slate-500">すべて解除</button>
          </div>
        </div>

        <div className="space-y-1.5">
          {applicable.map(i => {
            const on = !excluded.has(i.key)
            return (
              <label
                key={i.key}
                className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors ${
                  on ? "border-blue-500/40 bg-blue-500/5" : "border-slate-800 bg-slate-900"
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setExcluded(prev => {
                    const next = new Set(prev)
                    if (next.has(i.key)) next.delete(i.key); else next.add(i.key)
                    return next
                  })}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-100">{i.title}</p>
                  <div className="flex flex-wrap items-center gap-1.5 my-1">
                    <CategoryChip name={i.category} />
                    <span className="text-[10px] text-slate-500">期限目安：{offsetToDate(baseDate, i.dueOffsetDays)}</span>
                    {(i.requires ?? []).length > 0 && (
                      <span className="text-[10px] text-slate-500">
                        {i.requires!.map(k => tpl.conditions.find(c => c.key === k)?.label ?? k).join("・")}のため
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{i.detail}</p>
                </div>
              </label>
            )
          })}
        </div>

        {result && <p className="text-sm text-green-400 text-center">{result}</p>}

        <SaveButton label={`${selected.length}件を取り込む`} savedLabel="取り込みました" onSave={importItems} />
        <p className="text-[10px] text-slate-500 text-center">
          同じ項目を二重に取り込むことはありません。取り込んだあとは1件ずつ期限・担当を変えられます
        </p>
      </div>
    </div>
  )
}
