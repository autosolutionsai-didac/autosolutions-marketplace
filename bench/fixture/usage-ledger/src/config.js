// Runtime settings. Admins can change them while the server runs with POST /admin/config.
export const settings = {
  invoice: { currency: 'USD', footer: '' },
  limits: { maxBodyBytes: 1_000_000 },
}

export function updateSettings(patch) {
  deepMerge(settings, patch)
  return settings
}

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    const value = source[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {}
      deepMerge(target[key], value)
    } else {
      target[key] = value
    }
  }
  return target
}
