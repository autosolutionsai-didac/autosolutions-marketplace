// Team definitions from teams.json, with inheritance resolved.
// A team can extend another ("extends": "<id>") and override any field; env and the workflow options merge.
export function resolveTeams(list) {
  const byId = new Map(list.map((t) => [t.id, t]))
  const resolve = (t, seen = []) => {
    if (!t.extends) return t
    if (seen.includes(t.id)) throw new Error(`teams.json: extends cycle at ${t.id}`)
    const base = byId.get(t.extends)
    if (!base) throw new Error(`teams.json: ${t.id} extends unknown team ${t.extends}`)
    const b = resolve(base, [...seen, t.id])
    const merged = { ...b, ...t }
    for (const k of ['env', 'shipArgs', 'reviewArgs', 'auditArgs', 'roleModels']) if (b[k] || t[k]) merged[k] = { ...(b[k] || {}), ...(t[k] || {}) }
    return merged
  }
  return list.map((t) => resolve(t))
}
