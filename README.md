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

**Edit → models** supports: list, add (manual or from gateway), edit one, remove, replace all.

**Secrets:** `apiKey` accepts pi's value-resolution forms — a literal (`sk-...`), an environment reference (`$MY_KEY` or `${MY_KEY}`), or a command (`!op read ...`). References are resolved at request time by pi and by this tool when testing; the raw value is stored in `models.json` untouched.

**Test connection** has two modes:

- *Endpoint + auth check* — `GET {baseUrl}/models`, no tokens used
- *Full request* — tiny completion per API type (may cost tokens)

After saving, verify:

```bash
pi --list-models
```

## Security

API keys are stored **in plaintext** in `models.json` by design. The tool sets file mode `0600` on write. Do not use on shared machines without additional secret management.

## Backup

Each write copies the previous file to `models.json.bak`. On corrupt JSON at startup, the TUI offers restore from `.bak`.

## Development

```bash
npm install
npm test
npm run typecheck
npm run dev
```

## License

MIT
