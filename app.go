package main

import (
	"context"
	"sync"
)

// App struct
type App struct {
	ctx        context.Context
	runner     *KubectlRunner
	transcript []CommandResult
	mu         sync.Mutex
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		runner:     NewKubectlRunner(),
		transcript: make([]CommandResult, 0, 200),
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) record(result CommandResult) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.transcript = append(a.transcript, result)
	if len(a.transcript) > 200 {
		a.transcript = a.transcript[len(a.transcript)-200:]
	}
}

func (a *App) GetTranscript() []CommandResult {
	a.mu.Lock()
	defer a.mu.Unlock()
	out := make([]CommandResult, len(a.transcript))
	copy(out, a.transcript)
	return out
}

func (a *App) ClearTranscript() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.transcript = a.transcript[:0]
}
