import {useEffect, useMemo, useState} from 'react'
import {
    ClearTranscript,
    DeletePod,
    DescribePod,
    GetCurrentContext,
    GetPodLogs,
    GetTranscript,
    ListContexts,
    ListNamespaces,
    ListPods,
    SetContext,
} from '../wailsjs/go/main/App'

type CommandResult<T = unknown> = {
    command: string
    stdout: string
    stderr: string
    exitCode: number
    durationMs: number
    parsedData?: T
}

type Namespace = {
    name: string
}

type Pod = {
    name: string
    status: string
    ready: string
    restarts: number
    age: string
    node: string
    hasOwner: boolean
}

type SortKey = 'name' | 'status' | 'ready' | 'restarts' | 'age' | 'node'

type SortState = {
    key: SortKey
    direction: 'asc' | 'desc'
}

const statusStyles: Record<string, string> = {
    Running: 'bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-400/30',
    Pending: 'bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/30',
    CrashLoopBackOff: 'bg-rose-400/15 text-rose-200 ring-1 ring-rose-400/30',
    Failed: 'bg-rose-400/15 text-rose-200 ring-1 ring-rose-400/30',
    Succeeded: 'bg-slate-400/15 text-slate-200 ring-1 ring-slate-400/30',
}

const fallbackStatus = 'bg-slate-400/10 text-slate-200 ring-1 ring-slate-400/30'
const refreshIntervalMs = 15000
const storageKeys = {
    context: 'kubectl-ui.context',
    namespaces: 'kubectl-ui.namespaceByContext',
    autoRefresh: 'kubectl-ui.autoRefresh',
}

const safeLocalStorage = {
    get(key: string) {
        if (typeof window === 'undefined') {
            return null
        }
        try {
            return window.localStorage.getItem(key)
        } catch (err) {
            console.warn('localStorage get failed', err)
            return null
        }
    },
    set(key: string, value: string) {
        if (typeof window === 'undefined') {
            return
        }
        try {
            window.localStorage.setItem(key, value)
        } catch (err) {
            console.warn('localStorage set failed', err)
        }
    },
}

const parseJSON = <T,>(value: string | null, fallback: T): T => {
    if (!value) {
        return fallback
    }
    try {
        return JSON.parse(value) as T
    } catch {
        return fallback
    }
}

const parseReady = (value: string) => {
    const [ready, total] = value.split('/')
    return {
        ready: Number(ready) || 0,
        total: Number(total) || 0,
    }
}

const parseAge = (value: string) => {
    const match = value.match(/^(\d+)(s|m|h|d|w|mo)$/)
    if (!match) {
        return 0
    }
    const amount = Number(match[1])
    const unit = match[2]
    switch (unit) {
        case 's':
            return amount
        case 'm':
            return amount * 60
        case 'h':
            return amount * 3600
        case 'd':
            return amount * 86400
        case 'w':
            return amount * 604800
        case 'mo':
            return amount * 2592000
        default:
            return amount
    }
}

const copyToClipboard = async (value: string) => {
    if (!value) {
        return
    }
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
        return
    }
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
}

function App() {
    const [contexts, setContexts] = useState<string[]>([])
    const [currentContext, setCurrentContext] = useState('')
    const [namespaces, setNamespaces] = useState<Namespace[]>([])
    const [currentNamespace, setCurrentNamespace] = useState('')
    const [pods, setPods] = useState<Pod[]>([])
    const [selectedPod, setSelectedPod] = useState<Pod | null>(null)
    const [transcript, setTranscript] = useState<CommandResult[]>([])
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [sortState, setSortState] = useState<SortState | null>({key: 'name', direction: 'asc'})
    const [error, setError] = useState<string | null>(null)
    const [loadingContexts, setLoadingContexts] = useState(false)
    const [loadingNamespaces, setLoadingNamespaces] = useState(false)
    const [loadingPods, setLoadingPods] = useState(false)
    const [actionBusy, setActionBusy] = useState(false)
    const [autoRefresh, setAutoRefresh] = useState(
        () => parseJSON<boolean>(safeLocalStorage.get(storageKeys.autoRefresh), false)
    )

    const statusOptions = useMemo(() => {
        const options = new Set<string>()
        pods.forEach((pod) => options.add(pod.status || 'Unknown'))
        return ['all', ...Array.from(options).sort()]
    }, [pods])

    const filteredPods = useMemo(() => {
        const term = search.trim().toLowerCase()
        const status = statusFilter.toLowerCase()
        let next = pods
        if (status !== 'all') {
            next = next.filter((pod) => pod.status.toLowerCase() === status)
        }
        if (term) {
            next = next.filter((pod) => pod.name.toLowerCase().includes(term))
        }
        if (!sortState) {
            return next
        }
        const sorted = [...next]
        sorted.sort((a, b) => {
            const dir = sortState.direction === 'asc' ? 1 : -1
            switch (sortState.key) {
                case 'name':
                    return dir * a.name.localeCompare(b.name)
                case 'status':
                    return dir * a.status.localeCompare(b.status)
                case 'ready': {
                    const aReady = parseReady(a.ready)
                    const bReady = parseReady(b.ready)
                    const aRatio = aReady.total === 0 ? 0 : aReady.ready / aReady.total
                    const bRatio = bReady.total === 0 ? 0 : bReady.ready / bReady.total
                    return dir * (aRatio - bRatio)
                }
                case 'restarts':
                    return dir * (a.restarts - b.restarts)
                case 'age':
                    return dir * (parseAge(a.age) - parseAge(b.age))
                case 'node':
                    return dir * a.node.localeCompare(b.node)
                default:
                    return 0
            }
        })
        return sorted
    }, [pods, search, statusFilter, sortState])

    const podSummary = useMemo(() => {
        const total = pods.length
        const running = pods.filter((pod) => pod.status === 'Running').length
        const pending = pods.filter((pod) => /pending|containercreating|init/i.test(pod.status)).length
        const failing = pods.filter((pod) => /crash|error|failed|backoff/i.test(pod.status)).length
        return {total, running, pending, failing}
    }, [pods])

    const refreshTranscript = async () => {
        try {
            const entries = await GetTranscript()
            setTranscript(entries || [])
        } catch (err) {
            console.warn('Failed to load transcript', err)
        }
    }

    const handleError = (result: CommandResult, fallback: string) => {
        if (result.exitCode !== 0) {
            setError(result.stderr || fallback)
            return true
        }
        setError(null)
        return false
    }

    const loadContexts = async () => {
        setLoadingContexts(true)
        const result = await ListContexts()
        if (!handleError(result, 'Failed to list contexts')) {
            const data = (result.parsedData || []) as string[]
            setContexts(data)
            setLoadingContexts(false)
            return data
        }
        setLoadingContexts(false)
        return [] as string[]
    }

    const loadCurrentContext = async () => {
        const result = await GetCurrentContext()
        if (!handleError(result, 'Failed to get current context')) {
            const data = (result.parsedData || '') as string
            return data
        }
        return ''
    }

    const loadNamespaces = async (contextName: string, preferred?: string) => {
        setLoadingNamespaces(true)
        const result = await ListNamespaces(contextName)
        if (!handleError(result, 'Failed to list namespaces')) {
            const data = (result.parsedData || []) as Namespace[]
            setNamespaces(data)
            const nextNamespace =
                (preferred && data.find((ns) => ns.name === preferred)?.name) ||
                data[0]?.name ||
                ''
            setCurrentNamespace(nextNamespace)
            if (nextNamespace) {
                await loadPods(contextName, nextNamespace)
            } else {
                setPods([])
            }
        }
        setLoadingNamespaces(false)
    }

    const loadPods = async (contextName: string, namespace: string) => {
        if (!namespace) {
            setPods([])
            return
        }
        setLoadingPods(true)
        const result = await ListPods(contextName, namespace)
        if (!handleError(result, 'Failed to list pods')) {
            const data = (result.parsedData || []) as Pod[]
            setPods(data)
            setSelectedPod((current) => {
                if (current && data.find((pod) => pod.name === current.name)) {
                    return current
                }
                return data[0] || null
            })
        }
        setLoadingPods(false)
    }

    const saveContext = (contextName: string) => {
        safeLocalStorage.set(storageKeys.context, contextName)
    }

    const saveNamespace = (contextName: string, namespace: string) => {
        const raw = safeLocalStorage.get(storageKeys.namespaces)
        const map = parseJSON<Record<string, string>>(raw, {})
        map[contextName] = namespace
        safeLocalStorage.set(storageKeys.namespaces, JSON.stringify(map))
    }

    const handleContextChange = async (contextName: string, preferredNamespace?: string) => {
        setCurrentContext(contextName)
        saveContext(contextName)
        if (contextName) {
            setActionBusy(true)
            const result = await SetContext(contextName)
            handleError(result, 'Failed to set context')
            await loadNamespaces(contextName, preferredNamespace)
            await refreshTranscript()
            setActionBusy(false)
        }
    }

    const handleNamespaceChange = async (namespace: string) => {
        setCurrentNamespace(namespace)
        if (currentContext && namespace) {
            saveNamespace(currentContext, namespace)
            await loadPods(currentContext, namespace)
            await refreshTranscript()
        }
    }

    const handleRefresh = async () => {
        if (currentContext && currentNamespace) {
            await loadPods(currentContext, currentNamespace)
            await refreshTranscript()
        }
    }

    const handleDeletePod = async () => {
        if (!selectedPod || !currentContext || !currentNamespace) {
            return
        }
        if (!selectedPod.hasOwner) {
            const confirmSolo = window.confirm(`Pod ${selectedPod.name} has no owner. Delete anyway?`)
            if (!confirmSolo) {
                return
            }
        } else {
            const confirmed = window.confirm(`Delete pod ${selectedPod.name}?`)
            if (!confirmed) {
                return
            }
        }
        setActionBusy(true)
        const result = await DeletePod(currentContext, currentNamespace, selectedPod.name)
        handleError(result, 'Failed to delete pod')
        await loadPods(currentContext, currentNamespace)
        await refreshTranscript()
        setActionBusy(false)
    }

    const handleLogs = async () => {
        if (!selectedPod || !currentContext || !currentNamespace) {
            return
        }
        setActionBusy(true)
        const result = await GetPodLogs(currentContext, currentNamespace, selectedPod.name, 100)
        handleError(result, 'Failed to fetch logs')
        await refreshTranscript()
        setActionBusy(false)
    }

    const handleDescribe = async () => {
        if (!selectedPod || !currentContext || !currentNamespace) {
            return
        }
        setActionBusy(true)
        const result = await DescribePod(currentContext, currentNamespace, selectedPod.name)
        handleError(result, 'Failed to describe pod')
        await refreshTranscript()
        setActionBusy(false)
    }

    const handleCopyPodName = async () => {
        if (!selectedPod) {
            return
        }
        await copyToClipboard(selectedPod.name)
    }

    const handleClearTranscript = async () => {
        await ClearTranscript()
        setTranscript([])
    }

    const handleCopyLastCommand = async () => {
        const last = transcript[transcript.length - 1]
        if (last) {
            await copyToClipboard(last.command)
        }
    }

    const toggleSort = (key: SortKey) => {
        setSortState((current) => {
            if (!current || current.key !== key) {
                return {key, direction: 'asc'}
            }
            if (current.direction === 'asc') {
                return {key, direction: 'desc'}
            }
            return null
        })
    }

    useEffect(() => {
        const bootstrap = async () => {
            const savedContext = safeLocalStorage.get(storageKeys.context) || ''
            const savedNamespaces = parseJSON<Record<string, string>>(
                safeLocalStorage.get(storageKeys.namespaces),
                {}
            )

            const loadedContexts = await loadContexts()
            const current = await loadCurrentContext()

            const initialContext =
                (savedContext && loadedContexts.includes(savedContext) && savedContext) ||
                (current && loadedContexts.includes(current) && current) ||
                loadedContexts[0] ||
                ''

            if (initialContext) {
                await handleContextChange(initialContext, savedNamespaces[initialContext])
            }
            await refreshTranscript()
        }
        bootstrap()
    }, [])

    useEffect(() => {
        safeLocalStorage.set(storageKeys.autoRefresh, JSON.stringify(autoRefresh))
    }, [autoRefresh])

    useEffect(() => {
        if (!autoRefresh || !currentContext || !currentNamespace) {
            return
        }
        const id = window.setInterval(() => {
            handleRefresh()
        }, refreshIntervalMs)
        return () => window.clearInterval(id)
    }, [autoRefresh, currentContext, currentNamespace])

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (event.key === 'r' || event.key === 'R') {
                event.preventDefault()
                handleRefresh()
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [currentContext, currentNamespace])

    const statusChip = (status: string) => statusStyles[status] || fallbackStatus
    const busy = actionBusy || loadingPods

    return (
        <div className="min-h-screen bg-[#0b1020] text-slate-100">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_55%),radial-gradient(circle_at_20%_80%,_rgba(244,114,182,0.14),_transparent_45%)]" />
            <div className="relative">
                <header className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-sky-400/80 via-cyan-400/70 to-emerald-300/70 shadow-lg shadow-sky-500/30" />
                        <div>
                            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Kubectl UI</div>
                            <div className="text-xl font-semibold">Learning Mode Console</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs uppercase tracking-widest text-emerald-200 ring-1 ring-emerald-400/30">
                            {loadingPods ? 'Refreshing' : 'Cluster Connected'}
                        </div>
                        <button
                            className="rounded-full border border-slate-600/60 bg-slate-900/40 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-400 hover:text-white"
                            onClick={handleRefresh}
                            disabled={busy}
                        >
                            Refresh
                        </button>
                    </div>
                </header>

                {error && (
                    <div className="px-6 pb-4">
                        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                            {error}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-12 gap-5 px-6 pb-8">
                    <aside className="col-span-12 space-y-5 rounded-3xl border border-slate-800/60 bg-slate-950/60 p-5 backdrop-blur lg:col-span-3">
                        <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Context</div>
                            <div className="mt-2 flex items-center gap-2">
                                <select
                                    className="w-full rounded-xl border border-slate-700/60 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 focus:border-sky-400/60 focus:outline-none"
                                    value={currentContext}
                                    onChange={(event) => handleContextChange(event.target.value)}
                                    disabled={loadingContexts || actionBusy}
                                >
                                    {contexts.length === 0 && <option>Loading...</option>}
                                    {contexts.map((ctx) => (
                                        <option key={ctx}>{ctx}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="mt-3 text-xs text-slate-400">
                                {loadingContexts ? 'Loading contexts...' : `Contexts: ${contexts.length}`}
                            </div>
                        </div>

                        <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Namespace</div>
                            <div className="mt-3 space-y-2">
                                {loadingNamespaces && (
                                    <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-slate-400">
                                        Loading namespaces...
                                    </div>
                                )}
                                {!loadingNamespaces && namespaces.length === 0 && (
                                    <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-slate-400">
                                        No namespaces found
                                    </div>
                                )}
                                {namespaces.map((ns) => (
                                    <button
                                        key={ns.name}
                                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm transition ${
                                            ns.name === currentNamespace
                                                ? 'border-sky-400/50 bg-sky-400/10 text-sky-100'
                                                : 'border-slate-700/60 bg-slate-900/60 text-slate-200 hover:border-slate-500/60'
                                        }`}
                                        onClick={() => handleNamespaceChange(ns.name)}
                                    >
                                        <span>{ns.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/50 p-4">
                            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Quick Actions</div>
                            <div className="mt-3 grid gap-2">
                                <button
                                    className="rounded-xl border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 hover:border-sky-400/60"
                                    onClick={handleRefresh}
                                    disabled={busy}
                                >
                                    Refresh Pods
                                </button>
                                <button
                                    className="rounded-xl border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 hover:border-emerald-400/60"
                                    onClick={handleLogs}
                                    disabled={busy || !selectedPod}
                                >
                                    View Logs
                                </button>
                                <button
                                    className="rounded-xl border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-sm text-slate-200 hover:border-rose-400/60"
                                    onClick={handleDeletePod}
                                    disabled={busy || !selectedPod}
                                >
                                    Delete Pod
                                </button>
                            </div>
                        </div>
                    </aside>

                    <section className="col-span-12 space-y-5 lg:col-span-9">
                        <div className="grid gap-4 lg:grid-cols-3">
                            <div className="rounded-3xl border border-slate-800/60 bg-slate-950/60 p-5 backdrop-blur">
                                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Pods</div>
                                <div className="mt-3 text-3xl font-semibold">{podSummary.total}</div>
                                <div className="mt-2 text-sm text-slate-400">
                                    Running: {podSummary.running} · Pending: {podSummary.pending} · Failing: {podSummary.failing}
                                </div>
                            </div>
                            <div className="rounded-3xl border border-slate-800/60 bg-slate-950/60 p-5 backdrop-blur">
                                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Auto Refresh</div>
                                <div className="mt-3 flex items-center justify-between">
                                    <div>
                                        <div className="text-xl font-semibold">{autoRefresh ? 'On' : 'Off'}</div>
                                        <div className="text-sm text-slate-400">
                                            {autoRefresh ? `Every ${refreshIntervalMs / 1000}s` : 'Manual refresh'}
                                        </div>
                                    </div>
                                    <button
                                        className={`h-9 w-16 rounded-full p-1 transition ${
                                            autoRefresh ? 'bg-emerald-400/20' : 'bg-slate-700/40'
                                        }`}
                                        onClick={() => setAutoRefresh((value) => !value)}
                                    >
                                        <div
                                            className={`h-7 w-7 rounded-full transition ${
                                                autoRefresh
                                                    ? 'translate-x-7 bg-emerald-300 shadow-lg shadow-emerald-400/40'
                                                    : 'bg-slate-400'
                                            }`}
                                        />
                                    </button>
                                </div>
                            </div>
                            <div className="rounded-3xl border border-slate-800/60 bg-slate-950/60 p-5 backdrop-blur">
                                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Selected</div>
                                <div className="mt-3 text-lg font-semibold">
                                    {selectedPod ? selectedPod.name : 'None'}
                                </div>
                                <div className="mt-2 text-sm text-slate-400">
                                    {selectedPod
                                        ? `${selectedPod.status} · ${selectedPod.restarts} restarts`
                                        : 'Pick a pod to inspect'}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-3xl border border-slate-800/60 bg-slate-950/60 p-5 backdrop-blur">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <div className="text-lg font-semibold">Pods</div>
                                    <div className="text-sm text-slate-400">Namespace: {currentNamespace || '—'}</div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <input
                                        className="w-52 rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-400/60 focus:outline-none"
                                        placeholder="Search pods"
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                    />
                                    <select
                                        className="rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-sky-400/60 focus:outline-none"
                                        value={statusFilter}
                                        onChange={(event) => setStatusFilter(event.target.value)}
                                    >
                                        {statusOptions.map((status) => (
                                            <option key={status} value={status}>
                                                {status}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        className="rounded-xl border border-slate-700/60 bg-slate-900/80 px-3 py-2 text-sm text-slate-200 hover:border-slate-400"
                                        onClick={handleDescribe}
                                        disabled={busy || !selectedPod}
                                    >
                                        Describe
                                    </button>
                                    <button
                                        className="rounded-xl border border-slate-700/60 bg-slate-900/80 px-3 py-2 text-sm text-slate-200 hover:border-sky-400"
                                        onClick={handleRefresh}
                                        disabled={busy}
                                    >
                                        Refresh
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-800/60">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-900/80 text-xs uppercase tracking-[0.2em] text-slate-400">
                                        <tr>
                                            <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('name')}>
                                                Name
                                            </th>
                                            <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('status')}>
                                                Status
                                            </th>
                                            <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('ready')}>
                                                Ready
                                            </th>
                                            <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('restarts')}>
                                                Restarts
                                            </th>
                                            <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('age')}>
                                                Age
                                            </th>
                                            <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort('node')}>
                                                Node
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60">
                                        {loadingPods && (
                                            <tr>
                                                <td className="px-4 py-6 text-slate-400" colSpan={6}>
                                                    Loading pods...
                                                </td>
                                            </tr>
                                        )}
                                        {!loadingPods && filteredPods.length === 0 && (
                                            <tr>
                                                <td className="px-4 py-6 text-slate-400" colSpan={6}>
                                                    No pods found
                                                </td>
                                            </tr>
                                        )}
                                        {filteredPods.map((pod) => (
                                            <tr
                                                key={pod.name}
                                                className={`cursor-pointer bg-slate-950/40 hover:bg-slate-900/60 ${
                                                    selectedPod?.name === pod.name ? 'bg-slate-900/80' : ''
                                                }`}
                                                onClick={() => setSelectedPod(pod)}
                                            >
                                                <td className="px-4 py-3 font-medium text-slate-100">{pod.name}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs ${statusChip(pod.status)}`}>
                                                        {pod.status || 'Unknown'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-slate-300">{pod.ready}</td>
                                                <td className="px-4 py-3 text-slate-300">{pod.restarts}</td>
                                                <td className="px-4 py-3 text-slate-300">{pod.age}</td>
                                                <td className="px-4 py-3 text-slate-300">{pod.node}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                                <div className="flex items-center gap-3">
                                    <span>Selected pod: {selectedPod?.name || 'None'}</span>
                                    {selectedPod && !selectedPod.hasOwner && (
                                        <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-amber-200">
                                            No owner
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        className="rounded-full border border-slate-700/60 px-3 py-1 hover:border-slate-400 hover:text-slate-200"
                                        onClick={handleCopyPodName}
                                        disabled={!selectedPod}
                                    >
                                        Copy Name
                                    </button>
                                    <button
                                        className="rounded-full border border-slate-700/60 px-3 py-1 hover:border-emerald-400/60 hover:text-emerald-200"
                                        onClick={handleLogs}
                                        disabled={busy || !selectedPod}
                                    >
                                        View Logs
                                    </button>
                                    <button
                                        className="rounded-full border border-slate-700/60 px-3 py-1 hover:border-amber-400/60 hover:text-amber-200"
                                        onClick={handleDescribe}
                                        disabled={busy || !selectedPod}
                                    >
                                        Describe
                                    </button>
                                    <button
                                        className="rounded-full border border-slate-700/60 px-3 py-1 hover:border-rose-400/60 hover:text-rose-200"
                                        onClick={handleDeletePod}
                                        disabled={busy || !selectedPod}
                                    >
                                        Delete Pod
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                <div className="px-6 pb-8">
                    <div className="rounded-3xl border border-slate-800/60 bg-slate-950/70 p-5 backdrop-blur">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="text-lg font-semibold">Transcript</div>
                                <div className="text-sm text-slate-400">Commands, stdout, stderr, exit codes</div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    className="rounded-full border border-slate-700/60 px-3 py-1 text-xs text-slate-200 hover:border-slate-400"
                                    onClick={handleCopyLastCommand}
                                >
                                    Copy Last
                                </button>
                                <button
                                    className="rounded-full border border-slate-700/60 px-3 py-1 text-xs text-slate-200 hover:border-slate-400"
                                    onClick={refreshTranscript}
                                >
                                    Refresh
                                </button>
                                <button
                                    className="rounded-full border border-slate-700/60 px-3 py-1 text-xs text-slate-200 hover:border-rose-400/60 hover:text-rose-200"
                                    onClick={handleClearTranscript}
                                >
                                    Clear
                                </button>
                            </div>
                        </div>

                        <div className="mt-4 space-y-3">
                            {transcript.length === 0 && (
                                <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4 text-sm text-slate-400">
                                    No commands yet
                                </div>
                            )}
                            {transcript.map((entry, index) => (
                                <div key={`${entry.command}-${index}`} className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4 text-sm">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="font-mono text-xs text-slate-300">{entry.command}</div>
                                        <div className="flex items-center gap-2 text-xs text-slate-500">
                                            <span>{entry.durationMs}ms</span>
                                            <span className={entry.exitCode === 0 ? 'text-emerald-200' : 'text-rose-200'}>
                                                exit {entry.exitCode}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="mt-2 grid gap-2 text-xs">
                                        <div className="rounded-xl border border-slate-800/60 bg-slate-950/70 p-3 text-slate-200">
                                            <span className="text-slate-500">stdout</span>
                                            <div className="mt-1 font-mono text-[11px] text-slate-200">
                                                {entry.stdout || '—'}
                                            </div>
                                        </div>
                                        <div className="rounded-xl border border-slate-800/60 bg-slate-950/70 p-3 text-slate-200">
                                            <span className="text-slate-500">stderr</span>
                                            <div className="mt-1 font-mono text-[11px] text-rose-200">
                                                {entry.stderr || '—'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default App
