import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(exec)

// Writes a compressed copy of the data directory to dest.
export async function backup(dataDir, dest) {
  await run(`tar -czf ${dest} -C ${dataDir} .`)
  return dest
}
