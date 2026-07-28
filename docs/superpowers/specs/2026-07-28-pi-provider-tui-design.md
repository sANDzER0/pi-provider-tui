# pi-provider-tui Design

**Date:** 2026-07-28  
**Status:** Approved  
**Target:** Pi coding agent 0.82.x (`~/.pi/agent/models.json`)

## Problem

Pi supports custom gateway providers via `~/.pi/agent/models.json` (see [Custom Models](https://pi.dev/docs/latest/models) and [Custom Providers](https://pi.dev/docs/latest/custom-provider)). Manually editing JSON for baseUrl, API type, apiKey, and custom model IDs is error-prone and slow.

## Goal

A pure interactive TUI tool (`pi-provider-tui`) that quickly configures custom model providers for Pi, focused on **custom OpenAI-compatible / Anthropic-compatible gateways** with custom model IDs.

## Non-goals

- Custom `streamSimple` streaming implementations
- OAuth / SSO provider extensions
- Full `compat` / `thinkingLevelMap` editors (may be added later)
- Managing `~/.pi/agent/auth.json` or built-in `/login` flows
- Replacing Pi itself or shipping as a Pi extension (v1 is a standalone TUI)

## Users & success criteria

- User runs `pi-provider-tui`, adds a gateway (baseUrl + api + key + models), exits.
- `pi --list-models` shows the new provider/models without hand-editing JSON.
- Existing `models.json` providers are preserved when adding new ones.
- Failed model discovery never blocks completion of setup.

## Architecture

### Stack

- **Runtime:** Node.js (matches Pi’s local Node toolchain)
- **UI:** `@clack/prompts` wizard-style TUI (menu loop + form prompts)
  - Chosen over full-screen Ink for simpler implementation; still interactive end-to-end
- **Language:** TypeScript, run via `tsx` or compiled with `tsc`
- **HTTP:** native `fetch` (Node 18+)

### Layout

```
pi-provider-tui/
  package.json              # bin: pi-provider-tui
  tsconfig.json
  README.md
  src/
    index.ts                # entry + main menu loop
    types.ts                # ProviderConfig, ModelConfig types
    models-file.ts          # read / merge / atomic write / backup / restore
    fetch-models.ts         # GET {baseUrl}/models parser
    test-connection.ts      # minimal request per API type
    screens/
      list.ts
      add.ts
      edit.ts
      remove.ts
      models-pick.ts
      test.ts
  tests/
    models-file.test.ts
    fetch-models.test.ts
```

### Config path

| Source | Path |
|--------|------|
| Default | `~/.pi/agent/models.json` |
| Override | env `PI_MODELS_PATH` |

### Data flow

1. Start → load models.json (missing → in-memory `{ "providers": {} }`)
2. Main menu loop
3. Mutating actions build a new providers map → atomic write (tmp + rename) + `.bak` of previous file
4. Pi is not modified; next `pi` / `/model` reads the updated file

## UI

### Main menu

1. List providers  
2. Add provider  
3. Edit provider  
4. Remove provider  
5. Test connection  
6. Quit  

### Add wizard (order)

1. **Provider id** — required; non-empty; recommend kebab-case; if exists → confirm overwrite  
2. **Display name** — optional; default = id → maps to provider `name`  
3. **baseUrl** — required; must look like URL (basic validation)  
4. **API type** — one of:
   - `openai-completions`
   - `openai-responses`
   - `anthropic-messages`
5. **apiKey** — plaintext; may be empty (warn that models may stay unavailable in `/model` without auth)  
6. **authHeader** — y/n  
   - Default: `true` for `openai-completions` / `openai-responses`; `false` for `anthropic-messages`  
7. **Models** via models-pick screen (see below)  
8. **Preview** compact JSON for this provider → Confirm → write  

### Models pick

1. Attempt `GET` on models URL derived from `baseUrl` (strip trailing slash; if path does not already end with `/models`, append `/models`). Auth headers when `apiKey` is set:
   - `openai-completions` / `openai-responses`: `Authorization: Bearer {apiKey}`
   - `anthropic-messages`: both `x-api-key: {apiKey}` and `Authorization: Bearer {apiKey}` (gateways vary)
2. On success with non-empty list → multiselect models.  
3. On failure, empty list, or user cancel of multiselect → **manual entry loop** (does not block):
   - model `id` (required)
   - `name` (default = id)
   - `reasoning` (default false)
   - `contextWindow` (default 128000)
   - `maxTokens` (default 16384)
   - “Add another?” until done  
4. At least one model required before confirm write (re-prompt if zero).

### Edit

1. Select provider  
2. Choose field group: baseUrl / name / api / apiKey / authHeader / models / cancel  
3. Models: re-fetch + multiselect, or add/remove individual entries  
4. Confirm → write  

### Remove

Select provider → confirm → delete key → write  

### List

Print table: id, name, api, baseUrl, model count (mask apiKey, e.g. show last 4 chars only).  

### Test connection

1. Select provider + model  
2. Send minimal request by API:
   - `openai-completions`: `POST {baseUrl}/chat/completions` with one user message  
   - `openai-responses`: `POST {baseUrl}/responses` with minimal input  
   - `anthropic-messages`: `POST {baseUrl}/messages` with `anthropic-version` header + one user message  
3. Show HTTP status + short body/error excerpt  
4. Never writes config  

## Data model

Written shape under `providers[id]`:

```json
{
  "providers": {
    "my-gateway": {
      "name": "My Gateway",
      "baseUrl": "https://api.example.com/v1",
      "api": "openai-completions",
      "apiKey": "sk-...",
      "authHeader": true,
      "models": [
        {
          "id": "foo",
          "name": "Foo",
          "reasoning": false,
          "input": ["text"],
          "contextWindow": 128000,
          "maxTokens": 16384,
          "cost": {
            "input": 0,
            "output": 0,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        }
      ]
    }
  }
}
```

### Merge rules

- **Add new id:** insert under `providers` without touching siblings  
- **Overwrite existing id:** replace that provider object only after confirm  
- **Remove:** delete that key only  
- **Unknown top-level keys** in models.json (if any future fields): preserve on write (read-modify-write of full document; only mutate `providers[id]`)  
- **Model defaults** when omitted by user: as in table above; always write explicit defaults so the file is self-contained  

### Fetch models parsing

Accept common OpenAI-style payloads:

```ts
// { data: [ { id, name?, context_window?, max_tokens? } ] }
// or { models: [ ... ] }
// or bare array
```

Map each entry to model config with defaults for missing fields. Ignore unparseable entries with a count warning.

## Error handling

| Case | Behavior |
|------|----------|
| models.json missing | Treat as empty providers; create on first write |
| models.json invalid JSON / wrong shape | Error with path; do not overwrite; offer restore from `models.json.bak` if present |
| Write failure | Leave original file intact (tmp not renamed) |
| Fetch models network/HTTP/JSON error | Show reason; fall through to manual model entry |
| Test connection failure | Show status + body snippet; no write |
| Empty model list at confirm | Block confirm; return to model entry |
| Ctrl+C / cancel mid-wizard | Abort action; no write; return to main menu |

### Atomic write protocol

1. If target exists, copy to `models.json.bak`  
2. Write full document to `models.json.tmp`  
3. `fs.rename` tmp → `models.json`  
4. `chmod 0o600` on `models.json` (apiKey is plaintext by design)

## Security

- API keys are stored **in plaintext** in `models.json` (explicit product choice).  
- File mode `0600` after every write.  
- README warns about disk secrets and shared machines.  
- List/preview screens mask keys (show suffix only).  

## Installation

```bash
cd ~/pi-provider-tui   # or chosen path
npm install
npm link               # or npm install -g .
pi-provider-tui
```

Verification:

```bash
pi --list-models
# or open pi and use /model
```

## Testing

### Automated

- `models-file`: roundtrip read/write; merge preserves other providers; backup created; invalid JSON handled  
- `fetch-models`: parse `data` / `models` / array shapes; empty and error paths  

### Manual

1. Add gateway → list → `pi --list-models` sees it  
2. Fetch models success path and failure → manual path  
3. Edit baseUrl / models  
4. Test connection success and failure  
5. Remove provider  
6. Corrupt JSON → error + restore from bak  

## Implementation notes

- Prefer small pure functions in `models-file.ts` / `fetch-models.ts` for unit tests.  
- Screens own prompts; business logic stays out of UI where practical.  
- No dependency on `@earendil-works/pi-coding-agent` at runtime (config-file tool only).  
- Align field names and API enum strings exactly with Pi docs so configs load without translation.

## Future (out of v1)

- Provider-level `compat` and `headers` editors  
- Env-var style apiKey (`$FOO`) option  
- Ink full-screen dashboard  
- Pi extension wrapping the same core library (`/provider` command)  
