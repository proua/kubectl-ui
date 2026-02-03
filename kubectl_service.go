package main

import (
	"context"
	"fmt"
	"strings"
	"time"
)

const (
	defaultTimeout = 15 * time.Second
	logsTimeout    = 30 * time.Second
)

func (a *App) runKubectl(args []string, timeout time.Duration) CommandResult {
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	return a.runner.Run(ctx, args, timeout)
}

func invalidResult(args []string, err error) CommandResult {
	return CommandResult{
		Command:    "kubectl " + strings.Join(args, " "),
		Stdout:     "",
		Stderr:     err.Error(),
		ExitCode:   -1,
		DurationMs: 0,
	}
}

func (a *App) ListContexts() CommandResult {
	args := []string{"config", "view", "-o", "json"}
	result := a.runKubectl(args, defaultTimeout)
	if result.ExitCode == 0 {
		parsed, err := parseContexts(result.Stdout)
		if err != nil {
			appendParseError(&result, err)
		} else {
			result.ParsedData = parsed
		}
	}
	a.record(result)
	return result
}

func (a *App) GetCurrentContext() CommandResult {
	args := []string{"config", "current-context"}
	result := a.runKubectl(args, defaultTimeout)
	if result.ExitCode == 0 {
		result.ParsedData = strings.TrimSpace(result.Stdout)
	}
	a.record(result)
	return result
}

func (a *App) SetContext(name string) CommandResult {
	if err := validateContextName(name); err != nil {
		return invalidResult([]string{"config", "use-context", name}, err)
	}
	args := []string{"config", "use-context", name}
	result := a.runKubectl(args, defaultTimeout)
	a.record(result)
	return result
}

func (a *App) ListNamespaces(contextName string) CommandResult {
	args, err := withContext([]string{"get", "ns", "-o", "json"}, contextName)
	if err != nil {
		return invalidResult([]string{"--context", contextName, "get", "ns", "-o", "json"}, err)
	}
	result := a.runKubectl(args, defaultTimeout)
	if result.ExitCode == 0 {
		parsed, err := parseNamespaces(result.Stdout)
		if err != nil {
			appendParseError(&result, err)
		} else {
			result.ParsedData = parsed
		}
	}
	a.record(result)
	return result
}

func (a *App) ListPods(contextName, namespace string) CommandResult {
	if err := validateNamespace(namespace); err != nil {
		return invalidResult([]string{"get", "pods", "-n", namespace, "-o", "json"}, err)
	}
	args, err := withContext([]string{"get", "pods", "-n", namespace, "-o", "json"}, contextName)
	if err != nil {
		return invalidResult([]string{"--context", contextName, "get", "pods", "-n", namespace, "-o", "json"}, err)
	}
	result := a.runKubectl(args, defaultTimeout)
	if result.ExitCode == 0 {
		parsed, err := parsePods(result.Stdout)
		if err != nil {
			appendParseError(&result, err)
		} else {
			result.ParsedData = parsed
		}
	}
	a.record(result)
	return result
}

func (a *App) DeletePod(contextName, namespace, name string) CommandResult {
	if err := validateNamespace(namespace); err != nil {
		return invalidResult([]string{"delete", "pod", name, "-n", namespace}, err)
	}
	if err := validatePodName(name); err != nil {
		return invalidResult([]string{"delete", "pod", name, "-n", namespace}, err)
	}
	args, err := withContext([]string{"delete", "pod", name, "-n", namespace}, contextName)
	if err != nil {
		return invalidResult([]string{"--context", contextName, "delete", "pod", name, "-n", namespace}, err)
	}
	result := a.runKubectl(args, defaultTimeout)
	a.record(result)
	return result
}

func (a *App) GetPodLogs(contextName, namespace, name string, tail int) CommandResult {
	if err := validateNamespace(namespace); err != nil {
		return invalidResult([]string{"logs", name, "-n", namespace}, err)
	}
	if err := validatePodName(name); err != nil {
		return invalidResult([]string{"logs", name, "-n", namespace}, err)
	}
	if tail <= 0 {
		tail = 100
	}
	args, err := withContext([]string{"logs", name, "-n", namespace, fmt.Sprintf("--tail=%d", tail)}, contextName)
	if err != nil {
		return invalidResult([]string{"--context", contextName, "logs", name, "-n", namespace}, err)
	}
	result := a.runKubectl(args, logsTimeout)
	a.record(result)
	return result
}

func (a *App) DescribePod(contextName, namespace, name string) CommandResult {
	if err := validateNamespace(namespace); err != nil {
		return invalidResult([]string{"describe", "pod", name, "-n", namespace}, err)
	}
	if err := validatePodName(name); err != nil {
		return invalidResult([]string{"describe", "pod", name, "-n", namespace}, err)
	}
	args, err := withContext([]string{"describe", "pod", name, "-n", namespace}, contextName)
	if err != nil {
		return invalidResult([]string{"--context", contextName, "describe", "pod", name, "-n", namespace}, err)
	}
	result := a.runKubectl(args, defaultTimeout)
	a.record(result)
	return result
}

func appendParseError(result *CommandResult, err error) {
	if result.Stderr != "" {
		result.Stderr += "\n"
	}
	result.Stderr += fmt.Sprintf("parse error: %v", err)
}
