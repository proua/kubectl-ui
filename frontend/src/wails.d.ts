declare module '../wailsjs/go/main/App' {
    export type CommandResult<T = unknown> = {
        command: string
        stdout: string
        stderr: string
        exitCode: number
        durationMs: number
        parsedData?: T
    }

    export type Namespace = {
        name: string
    }

    export type Pod = {
        name: string
        status: string
        ready: string
        restarts: number
        age: string
        node: string
        hasOwner: boolean
    }

    export function ListContexts(): Promise<CommandResult<string[]>>
    export function GetCurrentContext(): Promise<CommandResult<string>>
    export function SetContext(arg1: string): Promise<CommandResult<void>>
    export function ListNamespaces(arg1: string): Promise<CommandResult<Namespace[]>>
    export function ListPods(arg1: string, arg2: string): Promise<CommandResult<Pod[]>>
    export function DeletePod(arg1: string, arg2: string, arg3: string): Promise<CommandResult<void>>
    export function GetPodLogs(arg1: string, arg2: string, arg3: string, arg4: number): Promise<CommandResult<string>>
    export function DescribePod(arg1: string, arg2: string, arg3: string): Promise<CommandResult<string>>
    export function GetTranscript(): Promise<CommandResult[]>
    export function ClearTranscript(): Promise<void>
}
