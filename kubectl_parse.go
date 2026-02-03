package main

import (
	"encoding/json"
	"fmt"
	"time"
)

type namespaceList struct {
	Items []struct {
		Metadata struct {
			Name string `json:"name"`
		} `json:"metadata"`
	} `json:"items"`
}

type podList struct {
	Items []struct {
		Metadata struct {
			Name              string    `json:"name"`
			CreationTimestamp time.Time `json:"creationTimestamp"`
			OwnerReferences   []struct {
				Kind string `json:"kind"`
			} `json:"ownerReferences"`
		} `json:"metadata"`
		Status struct {
			Phase             string `json:"phase"`
			Reason            string `json:"reason"`
			NodeName          string `json:"nodeName"`
			ContainerStatuses []struct {
				Ready        bool `json:"ready"`
				RestartCount int  `json:"restartCount"`
				State        struct {
					Waiting *struct {
						Reason string `json:"reason"`
					} `json:"waiting"`
					Terminated *struct {
						Reason string `json:"reason"`
					} `json:"terminated"`
				} `json:"state"`
			} `json:"containerStatuses"`
		} `json:"status"`
	} `json:"items"`
}

type kubeConfigView struct {
	Contexts []struct {
		Name string `json:"name"`
	} `json:"contexts"`
}

func parseNamespaces(stdout string) ([]Namespace, error) {
	var list namespaceList
	if err := json.Unmarshal([]byte(stdout), &list); err != nil {
		return nil, err
	}
	namespaces := make([]Namespace, 0, len(list.Items))
	for _, item := range list.Items {
		if item.Metadata.Name == "" {
			continue
		}
		namespaces = append(namespaces, Namespace{Name: item.Metadata.Name})
	}
	return namespaces, nil
}

func parsePods(stdout string) ([]Pod, error) {
	var list podList
	if err := json.Unmarshal([]byte(stdout), &list); err != nil {
		return nil, err
	}
	pods := make([]Pod, 0, len(list.Items))
	for _, item := range list.Items {
		readyCount := 0
		restarts := 0
		status := item.Status.Phase
		if item.Status.Reason != "" {
			status = item.Status.Reason
		}
		for _, cs := range item.Status.ContainerStatuses {
			if cs.Ready {
				readyCount++
			}
			restarts += cs.RestartCount
			if cs.State.Waiting != nil && cs.State.Waiting.Reason != "" {
				status = cs.State.Waiting.Reason
			}
			if cs.State.Terminated != nil && cs.State.Terminated.Reason != "" {
				status = cs.State.Terminated.Reason
			}
		}
		total := len(item.Status.ContainerStatuses)
		ready := fmt.Sprintf("%d/%d", readyCount, total)
		age := "-"
		if !item.Metadata.CreationTimestamp.IsZero() {
			age = formatAge(time.Since(item.Metadata.CreationTimestamp))
		}
		node := item.Status.NodeName
		if node == "" {
			node = "-"
		}
		pods = append(pods, Pod{
			Name:     item.Metadata.Name,
			Status:   status,
			Ready:    ready,
			Restarts: restarts,
			Age:      age,
			Node:     node,
			HasOwner: len(item.Metadata.OwnerReferences) > 0,
		})
	}
	return pods, nil
}

func parseContexts(stdout string) ([]string, error) {
	var view kubeConfigView
	if err := json.Unmarshal([]byte(stdout), &view); err != nil {
		return nil, err
	}
	out := make([]string, 0, len(view.Contexts))
	for _, ctx := range view.Contexts {
		if ctx.Name != "" {
			out = append(out, ctx.Name)
		}
	}
	return out, nil
}

func formatAge(d time.Duration) string {
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	if d < 24*time.Hour {
		return fmt.Sprintf("%dh", int(d.Hours()))
	}
	if d < 7*24*time.Hour {
		return fmt.Sprintf("%dd", int(d.Hours()/24))
	}
	if d < 30*24*time.Hour {
		return fmt.Sprintf("%dw", int(d.Hours()/(24*7)))
	}
	return fmt.Sprintf("%dmo", int(d.Hours()/(24*30)))
}
