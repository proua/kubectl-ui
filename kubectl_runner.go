package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

type KubectlRunner struct {
	binary string
}

func NewKubectlRunner() *KubectlRunner {
	return &KubectlRunner{binary: "kubectl"}
}

func (r *KubectlRunner) Run(ctx context.Context, args []string, timeout time.Duration) CommandResult {
	start := time.Now()
	runCtx := ctx
	var cancel context.CancelFunc
	if timeout > 0 {
		runCtx, cancel = context.WithTimeout(ctx, timeout)
		defer cancel()
	}

	cmd := exec.CommandContext(runCtx, r.binary, args...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	duration := time.Since(start)
	exitCode := 0
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = -1
		}
	}

	if errors.Is(runCtx.Err(), context.DeadlineExceeded) && stderr.Len() == 0 {
		stderr.WriteString("command timed out")
	}

	return CommandResult{
		Command:    "kubectl " + strings.Join(args, " "),
		Stdout:     stdout.String(),
		Stderr:     stderr.String(),
		ExitCode:   exitCode,
		DurationMs: duration.Milliseconds(),
	}
}

var (
	dnsLabelRegex    = regexp.MustCompile(`^[a-z0-9]([-a-z0-9]*[a-z0-9])?$`)
	safeContextRegex = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:@/-]*$`)
)

func validateNamespace(name string) error {
	if len(name) == 0 {
		return fmt.Errorf("namespace is required")
	}
	if len(name) > 253 || !dnsLabelRegex.MatchString(name) {
		return fmt.Errorf("invalid namespace name")
	}
	return nil
}

func validatePodName(name string) error {
	if len(name) == 0 {
		return fmt.Errorf("pod name is required")
	}
	if len(name) > 253 || !dnsLabelRegex.MatchString(name) {
		return fmt.Errorf("invalid pod name")
	}
	return nil
}

func validateContextName(name string) error {
	if name == "" {
		return nil
	}
	if strings.HasPrefix(name, "-") {
		return fmt.Errorf("invalid context name")
	}
	if len(name) > 253 || !safeContextRegex.MatchString(name) {
		return fmt.Errorf("invalid context name")
	}
	return nil
}

func withContext(args []string, contextName string) ([]string, error) {
	if err := validateContextName(contextName); err != nil {
		return nil, err
	}
	if contextName == "" {
		return args, nil
	}
	out := make([]string, 0, len(args)+2)
	out = append(out, "--context", contextName)
	out = append(out, args...)
	return out, nil
}
