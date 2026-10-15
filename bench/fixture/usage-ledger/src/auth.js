// Admin endpoints are protected by a shared token from the environment.
export function isAdmin(req, token = process.env.LEDGER_ADMIN_TOKEN) {
  return req.headers['x-admin-token'] === token
}
