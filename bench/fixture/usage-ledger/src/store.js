import { readFile, rename, writeFile } from 'node:fs/promises'

export async function loadEvents(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
}

export async function saveEvents(file, events) {
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify(events))
  await rename(tmp, file)
}
