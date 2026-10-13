// Renders rows as CSV with a header line. Lines end with \n.
export function toCSV(rows, columns) {
  const lines = [columns.join(',')]
  for (const row of rows) {
    lines.push(columns.map((column) => cell(row[column])).join(','))
  }
  return lines.join('\n') + '\n'
}

function cell(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}
