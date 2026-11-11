import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { randomUUID } from "node:crypto"

const file = path.join(process.env.DSH_HOME || path.join(os.homedir(), ".dsh"), "plugin-data", "conversation-workbench", "state.json")
const empty = () => ({ artifacts: {}, revision: 0 })
let chain = Promise.resolve()

export async function readState() {
  try {
    const data = JSON.parse(await fs.readFile(file, "utf8"))
    if (!data.artifacts || typeof data.artifacts !== "object") throw new Error("Invalid conversation-workbench data")
    return data
  } catch (error) {
    if (error.code === "ENOENT") return empty()
    throw error
  }
}

export function updateState(change) {
  const work = chain.catch(() => {}).then(async () => {
    const state = await readState()
    const result = await change(state)
    state.revision = (state.revision || 0) + 1
    await fs.mkdir(path.dirname(file), { recursive: true })
    const temp = file + "." + randomUUID() + ".tmp"
    try { await fs.writeFile(temp, JSON.stringify(state, null, 2), { flag: "wx" }); await fs.rename(temp, file) }
    finally { await fs.rm(temp, { force: true }).catch(() => {}) }
    return { ...result, revision: state.revision }
  })
  chain = work
  return work
}

export function asId(value, label = "ID") {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value)) throw new Error("Invalid " + label)
  return value
}

export function boundedText(value, label, limit = 256) {
  if (typeof value !== "string" || !value.trim() || value.length > limit) throw new Error("Invalid " + label)
  return value.trim()
}
