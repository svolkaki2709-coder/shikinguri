import { redirect } from "next/navigation"

export default function BudgetTablePage() {
  redirect("/budget?tab=yearly")
}
