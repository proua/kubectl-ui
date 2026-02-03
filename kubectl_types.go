package main

type CommandResult struct {
	Command    string      `json:"command"`
	Stdout     string      `json:"stdout"`
	Stderr     string      `json:"stderr"`
	ExitCode   int         `json:"exitCode"`
	DurationMs int64       `json:"durationMs"`
	ParsedData interface{} `json:"parsedData,omitempty"`
}

type Namespace struct {
	Name string `json:"name"`
}

type Pod struct {
	Name     string `json:"name"`
	Status   string `json:"status"`
	Ready    string `json:"ready"`
	Restarts int    `json:"restarts"`
	Age      string `json:"age"`
	Node     string `json:"node"`
	HasOwner bool   `json:"hasOwner"`
}
