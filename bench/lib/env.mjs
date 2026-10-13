// Builds the environment for a child Claude Code run.
//
// When the benchmark itself runs inside a Claude Code session (as it does in the cloud), the parent's
// session variables would bind the child to the parent's transcript, stdout tee and messaging socket.
// Those are removed; auth, proxy and TLS variables are kept so the child can reach the API.
const DROP = [
  /^CLAUDECODE$/,
  /^CLAUDE_PID$/,
  /^CLAUDE_EFFORT$/,
  /^CLAUDE_AFTER_LAST_COMPACT$/,
  /^CLAUDE_AUTO_BACKGROUND_TASKS$/,
  /^CLAUDE_ADDITIONAL_DIRECTORIES$/,
  /^CLAUDE_CODE_(SESSION_ID|REMOTE_SESSION_ID|CHILD_SESSION|MAX_SUBAGENT_SPAWN_DEPTH|TEE_SDK_STDOUT|MESSAGING_SOCKET|MESSAGING_TOKEN|SYNC_SESSION_REFS|POST_FOR_SESSION_INGRESS_V2|SYNC_PLUGINS|SYNC_SKILLS|DIAGNOSTICS_FILE|ENTRYPOINT|SESSION_ATTENDED|HOLD_UNANSWERED_PARKED_PERMISSION|REMOTE_SDK_URL|REMOTE_SEND_KEEPALIVES|WORKER_EPOCH|DEBUG|ADDITIONAL_DIRECTORIES_CLAUDE_MD|BG_TASKS_REPORT_RUNNING|EXECPATH|VERSION|SUBAGENT_MODEL|SUBAGENT_MODEL_FORCE|EFFORT_LEVEL)$/,
  /^CLAUDE_CODE_ARTIFACT_/,
  // Keys that would switch on optional harness modules. A run only gets them when its task asks.
  /^(OPENAI_API_KEY|TYPESAFE_API_KEY|OPENROUTER_API_KEY|HARNESS_[A-Z_]+|ANTHROPIC_DEFAULT_[A-Z_]+_MODEL)$/,
]

export function childEnv({ configDir, extra = {} }) {
  const env = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (DROP.some((re) => re.test(k))) continue
    env[k] = v
  }
  env.CLAUDE_CONFIG_DIR = configDir
  env.IS_SANDBOX = env.IS_SANDBOX || '1'
  // Headless claude -p stops background tasks still running 10 minutes after the last turn. A ship
  // workflow routinely runs longer, so wait for it; the task timeout in run.mjs still bounds every run.
  env.CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS = '0'
  return { ...env, ...extra }
}
