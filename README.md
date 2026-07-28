# pi-provider-tui

Interactive TUI to manage [Pi](https://pi.dev) custom model providers in `~/.pi/agent/models.json`.

## Requirements

- Node.js 18+
- Pi coding agent installed (to consume the config)

## Install

```bash
cd /path/to/pi-provider-tui
npm install
npm run build
npm link
```

Dev without build:

```bash
npm run dev
```

## Usage

```bash
pi-provider-tui
```

Override config path:

```bash
PI_MODELS_PATH=/tmp/models.json pi-provider-tui
```

Menu: List / Add / Edit / Remove / Test connection / Quit.

Supported API types:

- `openai-completions`
- `openai-responses`
- `anthropic-messages`

After saving, verify:

```bash
pi --list-models
```

## Security

API keys are stored **in plaintext** in `models.json` by design. The tool sets file mode `0600` on write. Do not use on shared machines without additional secret management.

## Backup

Each write copies the previous file to `models.json.bak`. On corrupt JSON at startup, the TUI offers restore from `.bak`.

## Tests

```bash
npm test
npm run typecheck
```
