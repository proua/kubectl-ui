# Kubectl UI — Developer Checklist (MVP v1)

## Goal

Build a simple native desktop app (Wails + Go + Web UI) that wraps common `kubectl` workflows with:

- Clickable UI
- Visible executed commands
- Full stdout/stderr transcript (learning mode)

Primary use case: list namespaces/pods and restart pods by deleting them.

---

## Tech Stack

- Backend: Go (Wails)
- Frontend: React (Vite) inside Wails
- Command execution: os/exec (Process wrapper)
- Output format: JSON (`-o json`) for all list/detail operations

---

## Architecture

### Backend (Go)

- KubectlRunner (safe command executor)
- KubectlService (business logic)
- TranscriptRecorder (command history)

### Frontend (React)

- Context selector
- Namespace selector
- Pods table
- Action buttons
- Transcript drawer

---

## Core Features (V1)

### Context Management

- [ ] Load kubeconfig
- [ ] List contexts
- [ ] Switch active context
- [ ] Persist last used context

### Namespaces

- [ ] List namespaces (`kubectl get ns -o json`)
- [ ] Select active namespace
- [ ] Persist last namespace per context

### Pods

- [ ] List pods (`kubectl get pods -n X -o json`)
- [ ] Show columns:
  - Name
  - Status
  - Ready
  - Restarts
  - Age
- [ ] Refresh button
- [ ] Auto-refresh toggle (optional)

### Pod Actions

- [ ] Delete pod (restart)
  - Confirmation dialog
  - Warn if no ownerReference
- [ ] View logs (tail 100)
- [ ] Describe pod
- [ ] Copy pod name

### Transcript Panel (Learning Mode)

- [ ] Show executed command
- [ ] Show stdout
- [ ] Show stderr
- [ ] Show exit code
- [ ] Show duration
- [ ] Copy command button
- [ ] Clear history button

---

## Kubectl Runner

### Safety

- [ ] Never use shell=true
- [ ] Always pass args as slice
- [ ] No string concatenation
- [ ] Validate inputs (ns, pod name)

### Implementation

- [ ] Use exec.CommandContext
- [ ] Capture stdout/stderr
- [ ] Capture exit code
- [ ] Support cancellation
- [ ] Timeout support

### JSON Handling

- [ ] Always use -o json
- [ ] Decode with structs
- [ ] Fallback to raw map if needed
- [ ] Validate API versions

---

## Backend API (Wails Bindings)

### Required Methods

- [ ] ListContexts() []string
- [ ] GetCurrentContext() string
- [ ] SetContext(name)
- [ ] ListNamespaces(ctx) []Namespace
- [ ] ListPods(ctx, ns) []Pod
- [ ] DeletePod(ctx, ns, name)
- [ ] GetPodLogs(ctx, ns, name, tail)
- [ ] DescribePod(ctx, ns, name)

### Result Wrapper

All methods return:

- Command
- Stdout
- Stderr
- ExitCode
- DurationMs
- ParsedData (optional)

---

## Frontend UI

### Layout

- [ ] Sidebar: context + namespace
- [ ] Main: pods table
- [ ] Bottom drawer: transcript

### UX

- [ ] Loading indicators
- [ ] Error banners
- [ ] Empty states
- [ ] Keyboard shortcuts (R=refresh)
- [ ] Dark mode support (optional)

### Tables

- [ ] Sorting
- [ ] Filtering
- [ ] Search by name
- [ ] Row selection

---

## State Management

- [ ] CurrentContext
- [ ] CurrentNamespace
- [ ] PodList
- [ ] SelectedPod
- [ ] TranscriptHistory
- [ ] UISettings

Persist in:

- Local storage / config file

---

## Error Handling

### Kubectl Errors

- [ ] Non-zero exit handling
- [ ] Permission denied
- [ ] Context not found
- [ ] Cluster unreachable
- [ ] Expired credentials

### UI

- [ ] Friendly messages
- [ ] Show raw stderr in transcript
- [ ] Retry buttons

---

## Security

### Local Security

- [ ] No arbitrary command execution
- [ ] Whitelist kubectl actions
- [ ] Validate user inputs
- [ ] No dynamic flags

### Credentials

- [ ] Use existing kubeconfig
- [ ] Never store tokens manually
- [ ] Respect RBAC

---

## Performance

- [ ] Cache namespaces
- [ ] Cache pod lists briefly
- [ ] Debounce refresh
- [ ] Cancel outdated requests

---

## Packaging & Distribution (macOS)

### Build

- [ ] Wails build for darwin/arm64
- [ ] Universal binary (optional)

### Signing

- [ ] Developer ID certificate
- [ ] Codesign app
- [ ] Notarize with Apple

### Distribution

- [ ] DMG/ZIP package
- [ ] README with requirements
- [ ] kubectl dependency note

---

## Testing

### Manual

- [ ] Minikube
- [ ] Kind cluster
- [ ] GKE/EKS (read-only test)

### Scenarios

- [ ] Restart crashing pod
- [ ] Permission denied
- [ ] Deleted namespace
- [ ] Context switch
- [ ] Network loss

---

## V2 Backlog (After MVP)

### Features

- [ ] Rollout restart deployment
- [ ] Scale deployment
- [ ] Port-forward
- [ ] Exec shell
- [ ] Apply YAML
- [ ] Resource graphs
- [ ] Events timeline

### UX

- [ ] YAML editor
- [ ] Diff viewer
- [ ] Terminal emulator
- [ ] Bookmarks

---

## Release Checklist

- [ ] No shell execution
- [ ] No panic on invalid data
- [ ] All commands logged
- [ ] Confirmation on destructive actions
- [ ] README updated
- [ ] Version tagged
- [ ] Changelog written

---

## Philosophy

This tool should:

- Teach kubectl by showing real commands
- Be safer than raw CLI
- Be faster than typing
- Never hide what is happening

If in doubt: show the command.
