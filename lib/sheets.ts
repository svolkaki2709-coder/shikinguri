import { google } from "googleapis"

export const SPREADSHEET_ID = "1SEWj-C4rfLPkqZZgrPblOeR5NgwEkLvHeoOymn5w2To"

export function getSheetsClient(accessToken: string) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  auth.setCredentials({ access_token: accessToken })
  return google.sheets({ version: "v4", auth })
}

export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]
}

export function toJPY(value: string | number): number {
  if (typeof value === "number") return value
  return parseInt(value.replace(/[^0-9-]/g, ""), 10) || 0
}
