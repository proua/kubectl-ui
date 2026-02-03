# kubectl-ui

Native desktop UI for common `kubectl` workflows with a visible command transcript (learning mode).

## Requirements

- Go (1.20+ recommended)
- Wails v2 (`wails` on PATH)
- Node.js (18+ recommended)
- `kubectl` available on PATH
- A kubeconfig with at least one context

## Setup

Install frontend dependencies:

```sh
cd frontend
npm install
```

## Run (development)

```sh
wails dev
```

This runs:
- the Go backend
- Vite dev server for the React UI (hot reload)
- Wails bindings regeneration

You can also open the dev server at `http://localhost:34115` to call Go methods from devtools.

## Build (production)

```sh
wails build
```

The output app will be placed under `build/bin/`.

## Notes

- All `kubectl` commands are executed without a shell (args only).
- Every command is captured in the transcript with stdout/stderr/exit code/duration.
- If commands fail, check the Transcript panel first.

## MVP Features

- Context and namespace selection
- Pods table with sorting, filtering, and search
- Pod actions: logs, describe, delete (with confirmation)
- Command transcript drawer with copy + clear
- Local persistence for last context/namespace

## Dev Workflow

1. Run `wails dev`.
2. Make frontend changes in `frontend/src/` (Vite hot reload).
3. Make backend changes in Go files.
4. If you add or change Go methods, Wails regenerates bindings during `wails dev`.

## Common troubleshooting

- `wails: command not found`: install with `go install github.com/wailsapp/wails/v2/cmd/wails@latest` and ensure `$GOPATH/bin` is on your PATH.
- `kubectl` errors: verify your kubeconfig and selected context from the UI.
- No data in UI: select a context and namespace, then click `Refresh`.
