# @sandzer0/pi-provider-tui

Interactive TUI to manage [Pi](https://pi.dev) custom model providers in `~/.pi/agent/models.json`.

## Requirements

- Node.js 18+
- [Pi coding agent](https://pi.dev) installed (to consume the config)

## Install

```bash
npm install -g @sandzer0/pi-provider-tui
```

Or run once without global install:

```bash
npx @sandzer0/pi-provider-tui
```

From source:

```bash
git clone https://github.com/sandzer0/pi-provider-tui.git
cd pi-provider-tui
npm install
npm run build
npm link
```

## Usage

```bash
pi-provider-tui
```

Override config path:

```bash
PI_MODELS_PATH=/tmp/models.json pi-provider-tui
```

**Main menu:** List / Add / Edit / Remove / Test connection / Quit

**Supported API types:**

- `openai-completions`
- `openai-responses`
- `anthropic-messages`
- `google-generative-ai`

**Edit → models** supports: list, add (manual or from gateway), edit one, remove, replace all.
**Edit → provider** also covers custom request **headers** and pi's **compat** overrides
(common fields as tri-state prompts plus a raw-JSON editor for advanced routing options).
Editing a model preserves fields this tool does not manage (`samplingParams`, model-level `compat`, …).

**Secrets:** `apiKey` accepts pi's value-resolution forms — a literal (`sk-...`), an environment reference (`$MY_KEY` or `${MY_KEY}`), or a command (`!op read ...`). References are resolved at request time by pi and by this tool when testing; the raw value is stored in `models.json` untouched.

**Test connection** has two modes:

- *Endpoint + auth check* — `GET {baseUrl}/models`, no tokens used
- *Full request* — tiny completion per API type (may cost tokens)

After saving, verify:

```bash
pi --list-models
```

## Non-interactive CLI

Every common operation is also scriptable:

```bash
pi-provider-tui add --id my-gw --base-url https://gw.example.com/v1 \
    --api openai-completions --key '$MY_KEY' --models foo,bar -y
pi-provider-tui list [--json]
pi-provider-tui get --id my-gw
pi-provider-tui remove --id my-gw -y
pi-provider-tui test --id my-gw [--model foo] [--mode endpoint|full] [--json]
pi-provider-tui doctor [--json]
pi-provider-tui undo -y
```

`PI_MODELS_PATH` overrides the config path for all commands. Exit codes: `0` ok, `1` operation failed, `2` usage error.

Merging fetched models that already exist locally asks whether to keep your local settings or overwrite them.
Lists longer than 15 models offer a keyword filter before selection; every model list (pickers and read-only views) is shown in a scrollable viewport or paginated so huge gateway catalogs stay usable.

## Security

API keys are stored **in plaintext** in `models.json` by design. The tool sets file mode `0600` on write. Do not use on shared machines without additional secret management.

## Backup

Every write rotates a rolling history of the previous file versions: `models.json.bak.1` (most recent) through `models.json.bak.5`. The main menu's **Undo last write** restores `.bak.1` and steps back through history; on corrupt JSON at startup the TUI offers restore from the most recent backup (legacy single-file `models.json.bak` is still honored).

## Health checks

**Run health checks (doctor)** scans the config for common mistakes: missing baseUrl/api on custom providers, unknown API types, unset environment variables referenced by apiKey, duplicate endpoints or model ids, invalid limits/costs, and thinkingLevelMap entries pi would ignore.

## Development

```bash
npm install
npm test
npm run typecheck
npm run dev
```

## License

MIT
