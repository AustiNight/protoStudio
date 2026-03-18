import { useEffect, useMemo, useRef, useState } from 'react';

import { runtimeConfig } from '@/config/runtime-config';
import { useLogStore, type StudioLogLevel } from '@/store/log-store';
import { useTelemetryStore } from '@/store/telemetry-store';
import type { TelemetryEvent } from '@/types/telemetry';

type LogViewerPanelProps = {
  label: string;
};

type ViewerTab = 'logs' | 'token_analysis';
type MetricMode = 'tokens' | 'cost';
type SeriesKey = 'api_calls' | 'estimated_prompt' | 'builder_tasks' | 'chat_tasks';

type ChartPoint = {
  x: number;
  y: number;
};

type ChartSeries = {
  key: SeriesKey;
  label: string;
  colorClass: string;
  colorHex: string;
  points: ChartPoint[];
};

type LlmResponseSample = {
  index: number;
  role: 'chat' | 'builder';
  provider: 'openai' | 'anthropic' | 'google';
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  estimatedPromptTokens: number | null;
};

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const levelTone: Record<StudioLogLevel, string> = {
  debug: 'bg-slate-800/80 text-slate-300 border-slate-700/80',
  info: 'bg-emerald-300/20 text-emerald-200 border-emerald-300/40',
  warn: 'bg-amber-300/20 text-amber-200 border-amber-300/40',
  error: 'bg-rose-400/20 text-rose-200 border-rose-400/40',
};

const LOG_LEVELS: StudioLogLevel[] = ['debug', 'info', 'warn', 'error'];
const CHART_WIDTH = 860;
const CHART_HEIGHT = 260;
const CHART_PADDING = { left: 48, right: 16, top: 16, bottom: 32 };

const SERIES_STYLES: Record<
  SeriesKey,
  { label: string; colorClass: string; colorHex: string }
> = {
  api_calls: {
    label: 'Outgoing API calls',
    colorClass: 'text-sky-300',
    colorHex: '#7dd3fc',
  },
  estimated_prompt: {
    label: 'Estimated prompt',
    colorClass: 'text-fuchsia-300',
    colorHex: '#f0abfc',
  },
  builder_tasks: {
    label: 'Builder tasks',
    colorClass: 'text-emerald-300',
    colorHex: '#86efac',
  },
  chat_tasks: {
    label: 'Chat tasks',
    colorClass: 'text-amber-300',
    colorHex: '#fcd34d',
  },
};

function toSortedUniqueSources(
  entries: ReadonlyArray<{ source: string; timestamp: number }>,
): string[] {
  const latestBySource = new Map<string, number>();
  for (const entry of entries) {
    const existing = latestBySource.get(entry.source) ?? 0;
    if (entry.timestamp > existing) {
      latestBySource.set(entry.source, entry.timestamp);
    }
  }
  return Array.from(latestBySource.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([source]) => source);
}

function toCurrency(value: number): string {
  return `$${value.toFixed(6)}`;
}

function toRounded(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : '0';
}

function buildLinePath(points: ChartPoint[]): string {
  if (points.length === 0) {
    return '';
  }
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
}

function projectPoint(index: number, value: number, count: number, maxValue: number): ChartPoint {
  const innerWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const xStep = count <= 1 ? 0 : innerWidth / (count - 1);
  const normalized = maxValue <= 0 ? 0 : value / maxValue;
  return {
    x: CHART_PADDING.left + index * xStep,
    y: CHART_PADDING.top + innerHeight * (1 - normalized),
  };
}

function buildResponseSamples(events: TelemetryEvent[], sessionId: string | null): LlmResponseSample[] {
  if (!sessionId) {
    return [];
  }
  const orderedEvents = events
    .filter((event) => event.sessionId === sessionId)
    .sort((left, right) => left.timestamp - right.timestamp);
  const requestQueues = new Map<string, number[]>();

  for (const event of orderedEvents) {
    if (event.event !== 'llm.request') {
      continue;
    }
    const key = `${event.data.role}::${event.data.provider}::${event.data.model}`;
    const queue = requestQueues.get(key) ?? [];
    if (typeof event.data.estimatedPromptTokens === 'number') {
      queue.push(event.data.estimatedPromptTokens);
    } else {
      queue.push(0);
    }
    requestQueues.set(key, queue);
  }

  const responses = orderedEvents
    .filter(
      (event): event is Extract<TelemetryEvent, { event: 'llm.response' }> =>
        event.event === 'llm.response',
    );

  return responses.map((event, index) => {
    const promptTokens = event.data.promptTokens;
    const completionTokens = event.data.completionTokens;
    const key = `${event.data.role}::${event.data.provider}::${event.data.model}`;
    const queue = requestQueues.get(key) ?? [];
    const estimatedPromptTokens = queue.length > 0 ? queue.shift() ?? null : null;
    requestQueues.set(key, queue);
    return {
      index: index + 1,
      role: event.data.role,
      provider: event.data.provider,
      model: event.data.model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      cost: event.data.cost,
      estimatedPromptTokens:
        typeof estimatedPromptTokens === 'number' && estimatedPromptTokens > 0
          ? estimatedPromptTokens
          : null,
    };
  });
}

export function LogViewerPanel({ label }: LogViewerPanelProps) {
  const entries = useLogStore((state) => state.entries);
  const clearLogs = useLogStore((state) => state.clear);
  const telemetryEvents = useTelemetryStore((state) => state.events);
  const telemetrySessionId = useTelemetryStore((state) => state.sessionId);
  const [activeTab, setActiveTab] = useState<ViewerTab>('logs');
  const [metricMode, setMetricMode] = useState<MetricMode>('tokens');
  const [selectedLevels, setSelectedLevels] = useState<StudioLogLevel[]>(
    runtimeConfig.debugLogs ? LOG_LEVELS : LOG_LEVELS.filter((level) => level !== 'debug'),
  );
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sourceOptions = useMemo(() => toSortedUniqueSources(entries), [entries]);

  const filteredEntries = useMemo(() => {
    const levelSet = new Set(selectedLevels);
    const sourceSet = new Set(selectedSources);
    const filterBySource = selectedSources.length > 0;
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filterByQuery = normalizedQuery.length > 0;

    return entries.filter((entry) => {
      if (!levelSet.has(entry.level)) {
        return false;
      }
      if (filterBySource && !sourceSet.has(entry.source)) {
        return false;
      }
      if (filterByQuery) {
        const haystack = `${entry.source}\n${entry.message}\n${entry.details ?? ''}`.toLowerCase();
        if (!haystack.includes(normalizedQuery)) {
          return false;
        }
      }
      return true;
    });
  }, [entries, searchQuery, selectedLevels, selectedSources]);

  const resolvedTelemetrySessionId = useMemo(() => {
    if (telemetrySessionId) {
      return telemetrySessionId;
    }
    return [...telemetryEvents]
      .reverse()
      .find((event) => event.event === 'llm.response')?.sessionId ?? null;
  }, [telemetryEvents, telemetrySessionId]);

  const tokenSamples = useMemo(
    () => buildResponseSamples(telemetryEvents, resolvedTelemetrySessionId),
    [resolvedTelemetrySessionId, telemetryEvents],
  );

  const chartSeries = useMemo<ChartSeries[]>(() => {
    const count = tokenSamples.length;
    if (count === 0) {
      return [];
    }
    const apiRaw = tokenSamples.map((sample) =>
      metricMode === 'tokens' ? sample.promptTokens : sample.cost,
    );
    const estimatedPromptRaw = tokenSamples.map((sample) =>
      metricMode === 'tokens' ? sample.estimatedPromptTokens : null,
    );
    const builderRaw = tokenSamples.map((sample) => {
      if (sample.role !== 'builder') {
        return null;
      }
      return metricMode === 'tokens' ? sample.totalTokens : sample.cost;
    });
    const chatRaw = tokenSamples.map((sample) => {
      if (sample.role !== 'chat') {
        return null;
      }
      return metricMode === 'tokens' ? sample.totalTokens : sample.cost;
    });
    const maxValue = Math.max(
      1,
      ...apiRaw,
      ...estimatedPromptRaw.map((value) => value ?? 0),
      ...builderRaw.map((value) => value ?? 0),
      ...chatRaw.map((value) => value ?? 0),
    );
    const buildSeries = (key: SeriesKey, values: Array<number | null>): ChartSeries => {
      const points = values.flatMap((value, index) =>
        value === null ? [] : [projectPoint(index, value, count, maxValue)],
      );
      return {
        key,
        label: SERIES_STYLES[key].label,
        colorClass: SERIES_STYLES[key].colorClass,
        colorHex: SERIES_STYLES[key].colorHex,
        points,
      };
    };
    return [
      buildSeries('api_calls', apiRaw),
      buildSeries('estimated_prompt', estimatedPromptRaw),
      buildSeries('builder_tasks', builderRaw),
      buildSeries('chat_tasks', chatRaw),
    ];
  }, [metricMode, tokenSamples]);

  const totals = useMemo(() => {
    const totalPrompt = tokenSamples.reduce((sum, sample) => sum + sample.promptTokens, 0);
    const totalCompletion = tokenSamples.reduce(
      (sum, sample) => sum + sample.completionTokens,
      0,
    );
    const totalCost = tokenSamples.reduce((sum, sample) => sum + sample.cost, 0);
    const totalEstimatedPrompt = tokenSamples.reduce(
      (sum, sample) => sum + (sample.estimatedPromptTokens ?? 0),
      0,
    );
    const builderCalls = tokenSamples.filter((sample) => sample.role === 'builder').length;
    const chatCalls = tokenSamples.filter((sample) => sample.role === 'chat').length;
    const estimatedCalls = tokenSamples.filter(
      (sample) => typeof sample.estimatedPromptTokens === 'number',
    ).length;
    const promptDelta = totalEstimatedPrompt - totalPrompt;
    const promptDeltaRatio = totalPrompt > 0 ? (promptDelta / totalPrompt) * 100 : 0;
    return {
      totalPrompt,
      totalCompletion,
      totalCost,
      totalEstimatedPrompt,
      estimatedCalls,
      promptDelta,
      promptDeltaRatio,
      totalCalls: tokenSamples.length,
      builderCalls,
      chatCalls,
    };
  }, [tokenSamples]);

  const modelBreakdown = useMemo(() => {
    const map = new Map<
      string,
      {
        model: string;
        role: 'chat' | 'builder';
        calls: number;
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        cost: number;
      }
    >();
    for (const sample of tokenSamples) {
      const key = `${sample.role}::${sample.model}`;
      const current = map.get(key) ?? {
        model: sample.model,
        role: sample.role,
        calls: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: 0,
      };
      current.calls += 1;
      current.promptTokens += sample.promptTokens;
      current.completionTokens += sample.completionTokens;
      current.totalTokens += sample.totalTokens;
      current.cost += sample.cost;
      map.set(key, current);
    }
    return Array.from(map.values()).sort(
      (left, right) =>
        right.cost - left.cost ||
        right.totalTokens - left.totalTokens ||
        right.calls - left.calls,
    );
  }, [tokenSamples]);

  const isAllLevelsSelected = selectedLevels.length === LOG_LEVELS.length;
  const isSourceFilterActive = selectedSources.length > 0;
  const isSearchActive = searchQuery.trim().length > 0;

  useEffect(() => {
    if (activeTab !== 'logs') {
      return;
    }
    const container = scrollRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [activeTab, filteredEntries.length]);

  useEffect(() => {
    if (selectedSources.length === 0) {
      return;
    }
    const availableSources = new Set(sourceOptions);
    setSelectedSources((current) =>
      current.filter((source) => availableSources.has(source)),
    );
  }, [sourceOptions, selectedSources.length]);

  const toggleLevel = (level: StudioLogLevel) => {
    setSelectedLevels((current) => {
      if (current.includes(level)) {
        return current.filter((item) => item !== level);
      }
      return [...current, level];
    });
  };

  const toggleSource = (source: string) => {
    setSelectedSources((current) => {
      if (current.includes(source)) {
        return current.filter((item) => item !== source);
      }
      return [...current, source];
    });
  };

  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const yAxisLabel = metricMode === 'tokens' ? 'Tokens' : 'USD';

  return (
    <>
      <header className="flex items-center justify-between gap-3">
        <h2 className="font-['JetBrains_Mono'] text-lg font-bold uppercase tracking-[0.22em] text-slate-100">
          {label}
        </h2>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-slate-800/80 px-3 py-1 font-['JetBrains_Mono'] text-xs uppercase tracking-[0.2em] text-slate-300">
            {activeTab === 'logs' ? filteredEntries.length : tokenSamples.length}
          </span>
          <div
            role="tablist"
            aria-label="Log viewer tabs"
            className="flex items-center gap-1 rounded-full border border-slate-800/80 bg-slate-950/70 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'logs'}
              onClick={() => setActiveTab('logs')}
              className={`rounded-full px-3 py-1 font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.2em] transition ${
                activeTab === 'logs'
                  ? 'bg-emerald-300/25 text-emerald-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Logs
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'token_analysis'}
              onClick={() => setActiveTab('token_analysis')}
              className={`rounded-full px-3 py-1 font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.2em] transition ${
                activeTab === 'token_analysis'
                  ? 'bg-emerald-300/25 text-emerald-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Token Analysis
            </button>
          </div>
        </div>
      </header>

      {activeTab === 'logs' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="space-y-2 rounded-2xl border border-slate-800/80 bg-slate-950/50 px-3 py-2">
            <div className="flex items-center gap-2 rounded-xl border border-slate-800/80 bg-slate-900/50 px-2 py-2">
              <label htmlFor="log-search" className="sr-only">
                Search logs
              </label>
              <input
                id="log-search"
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search source, message, details..."
                className="w-full bg-transparent text-sm text-slate-100 placeholder:text-xs placeholder:uppercase placeholder:tracking-[0.2em] placeholder:text-slate-500 focus:outline-none"
              />
              {isSearchActive && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="rounded-full border border-slate-700/80 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300 transition hover:border-emerald-300/50 hover:text-emerald-200"
                >
                  Clear search
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  Levels
                </span>
                {LOG_LEVELS.map((level) => {
                  const active = selectedLevels.includes(level);
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => toggleLevel(level)}
                      className={`rounded-full border px-2 py-1 font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.2em] transition ${
                        active
                          ? `${levelTone[level]} hover:brightness-110`
                          : 'border-slate-700/80 bg-slate-900/60 text-slate-500 hover:border-slate-600'
                      }`}
                      aria-pressed={active}
                    >
                      {level}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                {!isAllLevelsSelected && (
                  <button
                    type="button"
                    onClick={() => setSelectedLevels(LOG_LEVELS)}
                    className="rounded-full border border-slate-700/80 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300 transition hover:border-emerald-300/70 hover:text-emerald-200"
                  >
                    All levels
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearLogs}
                  className="rounded-full border border-slate-700/80 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300 transition hover:border-emerald-300/70 hover:text-emerald-200"
                >
                  Clear
                </button>
              </div>
            </div>

            <details className="group rounded-xl border border-slate-800/80 bg-slate-900/50 p-2">
              <summary className="cursor-pointer list-none select-none text-[10px] uppercase tracking-[0.2em] text-slate-300">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-['JetBrains_Mono']">Sources</span>
                  <span className="text-slate-500">
                    {isSourceFilterActive
                      ? `${selectedSources.length} selected`
                      : `All (${sourceOptions.length})`}
                  </span>
                </div>
              </summary>

              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedSources([])}
                    className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.2em] transition ${
                      !isSourceFilterActive
                        ? 'border-emerald-300/40 bg-emerald-300/20 text-emerald-200'
                        : 'border-slate-700/80 bg-slate-900/60 text-slate-300 hover:border-emerald-300/50 hover:text-emerald-200'
                    }`}
                    aria-pressed={!isSourceFilterActive}
                  >
                    All sources
                  </button>
                  {isSourceFilterActive && (
                    <button
                      type="button"
                      onClick={() => setSelectedSources(sourceOptions)}
                      className="rounded-full border border-slate-700/80 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-300 transition hover:border-emerald-300/50 hover:text-emerald-200"
                    >
                      Select all
                    </button>
                  )}
                </div>

                {sourceOptions.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-800/80 bg-slate-900/50 px-3 py-2 text-xs text-slate-500">
                    No sources yet.
                  </div>
                ) : (
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-800/80 bg-slate-950/60 p-2">
                    <div className="space-y-1">
                      {sourceOptions.map((source) => {
                        const active =
                          !isSourceFilterActive || selectedSources.includes(source);
                        return (
                          <label
                            key={source}
                            className="flex items-center gap-2 rounded-md px-1 py-1 text-xs text-slate-300"
                          >
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={() => toggleSource(source)}
                              className="h-3 w-3 rounded border border-slate-700 bg-slate-900 text-emerald-300 focus:ring-emerald-300/60"
                            />
                            <span className="truncate">{source}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </details>

            {selectedLevels.length === 0 && (
              <div className="rounded-lg border border-dashed border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                Your current filter selection hides all logs.
              </div>
            )}
            <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Showing {filteredEntries.length} of {entries.length}
            </div>
          </div>

          <div
            ref={scrollRef}
            className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-2xl border border-slate-800/80 bg-slate-950/50 p-3"
          >
            {filteredEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800/80 bg-slate-900/50 p-4 text-sm text-slate-400">
                {entries.length === 0
                  ? 'Logs will appear here as the studio runs.'
                  : 'No logs match the current filter. Adjust levels or sources.'}
              </div>
            ) : (
              filteredEntries.map((entry) => (
                <article
                  key={entry.id}
                  className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                    <span
                      className={`rounded-full border px-2 py-1 font-['JetBrains_Mono'] ${levelTone[entry.level]}`}
                    >
                      {entry.level}
                    </span>
                    <span className="font-['JetBrains_Mono'] text-slate-500">
                      {timeFormatter.format(new Date(entry.timestamp))}
                    </span>
                    <span className="rounded-full border border-slate-700/80 px-2 py-1 text-slate-300">
                      {entry.source}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-200">{entry.message}</p>
                  {entry.details && (
                    <pre className="mt-2 overflow-x-auto rounded-lg border border-slate-800/80 bg-slate-950/80 p-2 text-xs text-slate-300">
                      {entry.details}
                    </pre>
                  )}
                </article>
              ))
            )}
          </div>
        </div>
      ) : (
        <section className="min-h-0 flex-1 space-y-3 rounded-2xl border border-slate-800/80 bg-slate-950/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Session {resolvedTelemetrySessionId ?? 'N/A'}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMetricMode('tokens')}
                className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
                  metricMode === 'tokens'
                    ? 'border-emerald-300/50 bg-emerald-300/20 text-emerald-200'
                    : 'border-slate-700/80 text-slate-300 hover:border-emerald-300/60'
                }`}
              >
                Tokens
              </button>
              <button
                type="button"
                onClick={() => setMetricMode('cost')}
                className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
                  metricMode === 'cost'
                    ? 'border-emerald-300/50 bg-emerald-300/20 text-emerald-200'
                    : 'border-slate-700/80 text-slate-300 hover:border-emerald-300/60'
                }`}
              >
                Cost (USD)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Calls</div>
              <div className="font-['JetBrains_Mono'] text-sm text-slate-100">
                {totals.totalCalls}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Prompt</div>
              <div className="font-['JetBrains_Mono'] text-sm text-slate-100">
                {toRounded(totals.totalPrompt)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Completion
              </div>
              <div className="font-['JetBrains_Mono'] text-sm text-slate-100">
                {toRounded(totals.totalCompletion)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Estimated Cost
              </div>
              <div className="font-['JetBrains_Mono'] text-sm text-slate-100">
                {toCurrency(totals.totalCost)}
              </div>
            </div>
          </div>
          {metricMode === 'tokens' && totals.estimatedCalls > 0 && (
            <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 px-3 py-2 text-[11px] text-slate-300">
              <span className="font-['JetBrains_Mono'] uppercase tracking-[0.2em] text-slate-500">
                Prompt Estimate Drift
              </span>{' '}
              actual {toRounded(totals.totalPrompt)} vs est. {toRounded(totals.totalEstimatedPrompt)} (
              {totals.promptDelta >= 0 ? '+' : ''}
              {toRounded(totals.promptDelta)} / {totals.promptDeltaRatio.toFixed(1)}%)
            </div>
          )}

          <div className="space-y-2 rounded-xl border border-slate-800/80 bg-slate-950/70 p-2">
            {tokenSamples.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-800/80 bg-slate-900/60 p-4 text-sm text-slate-400">
                Token telemetry will appear after LLM responses are recorded.
              </div>
            ) : (
              <>
                <div className="w-full overflow-x-auto">
                  <svg
                    viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                    className="min-w-[760px]"
                    role="img"
                    aria-label="Token analysis chart"
                  >
                    <rect x="0" y="0" width={CHART_WIDTH} height={CHART_HEIGHT} fill="transparent" />
                    {ticks.map((tick) => {
                      const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
                      const y = CHART_PADDING.top + innerHeight * (1 - tick);
                      const maxRaw = (() => {
                        if (metricMode === 'tokens') {
                          return Math.max(
                            1,
                            ...tokenSamples.map((sample) => sample.promptTokens),
                            ...tokenSamples.map((sample) => sample.estimatedPromptTokens ?? 0),
                            ...tokenSamples.map((sample) => sample.totalTokens),
                          );
                        }
                        return Math.max(0.000001, ...tokenSamples.map((sample) => sample.cost));
                      })();
                      const tickValue = maxRaw * tick;
                      const labelValue =
                        metricMode === 'tokens'
                          ? `${Math.round(tickValue)}`
                          : toCurrency(tickValue);
                      return (
                        <g key={tick}>
                          <line
                            x1={CHART_PADDING.left}
                            x2={CHART_WIDTH - CHART_PADDING.right}
                            y1={y}
                            y2={y}
                            stroke="rgba(100,116,139,0.25)"
                            strokeWidth="1"
                          />
                          <text
                            x={CHART_PADDING.left - 8}
                            y={y + 4}
                            textAnchor="end"
                            className="fill-slate-400 text-[10px]"
                          >
                            {labelValue}
                          </text>
                        </g>
                      );
                    })}
                    <line
                      x1={CHART_PADDING.left}
                      x2={CHART_PADDING.left}
                      y1={CHART_PADDING.top}
                      y2={CHART_HEIGHT - CHART_PADDING.bottom}
                      stroke="rgba(148,163,184,0.5)"
                      strokeWidth="1"
                    />
                    <line
                      x1={CHART_PADDING.left}
                      x2={CHART_WIDTH - CHART_PADDING.right}
                      y1={CHART_HEIGHT - CHART_PADDING.bottom}
                      y2={CHART_HEIGHT - CHART_PADDING.bottom}
                      stroke="rgba(148,163,184,0.5)"
                      strokeWidth="1"
                    />
                    {chartSeries.map((series) => (
                      <g key={series.key}>
                        <path
                          d={buildLinePath(series.points)}
                          fill="none"
                          stroke={series.colorHex}
                          strokeWidth="2"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                        {series.points.map((point, index) => (
                          <circle
                            key={`${series.key}-${index}`}
                            cx={point.x}
                            cy={point.y}
                            r="2"
                            fill={series.colorHex}
                          />
                        ))}
                      </g>
                    ))}
                    <text
                      x={CHART_WIDTH / 2}
                      y={CHART_HEIGHT - 6}
                      textAnchor="middle"
                      className="fill-slate-400 text-[10px]"
                    >
                      Message / response order (1..N)
                    </text>
                    <text
                      x="14"
                      y={CHART_HEIGHT / 2}
                      textAnchor="middle"
                      transform={`rotate(-90 14 ${CHART_HEIGHT / 2})`}
                      className="fill-slate-400 text-[10px]"
                    >
                      {yAxisLabel}
                    </text>
                  </svg>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs">
                  {chartSeries
                    .filter((series) => series.points.length > 0)
                    .map((series) => (
                    <span key={series.key} className="flex items-center gap-1 text-slate-300">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${series.colorClass}`}
                        style={{ backgroundColor: series.colorHex }}
                      />
                      {series.label}
                    </span>
                  ))}
                  <span className="text-slate-500">
                    Builder calls: {totals.builderCalls} | Chat calls: {totals.chatCalls}
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="space-y-2 rounded-xl border border-slate-800/80 bg-slate-950/70 p-2">
            <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Per-model breakdown
            </div>
            {modelBreakdown.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-800/80 bg-slate-900/60 p-3 text-xs text-slate-400">
                No model usage recorded yet.
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-800/80 bg-slate-950/80">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-900/90 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                    <tr>
                      <th className="px-2 py-2 text-left">Role</th>
                      <th className="px-2 py-2 text-left">Model</th>
                      <th className="px-2 py-2 text-right">Calls</th>
                      <th className="px-2 py-2 text-right">Tokens</th>
                      <th className="px-2 py-2 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelBreakdown.map((row) => (
                      <tr key={`${row.role}-${row.model}`} className="border-t border-slate-800/70 text-slate-300">
                        <td className="px-2 py-2">
                          <span className="rounded-full border border-slate-700/80 px-2 py-1 text-[10px] uppercase tracking-[0.2em]">
                            {row.role}
                          </span>
                        </td>
                        <td className="px-2 py-2 font-['JetBrains_Mono'] text-[11px] text-slate-200">
                          {row.model}
                        </td>
                        <td className="px-2 py-2 text-right">{row.calls}</td>
                        <td className="px-2 py-2 text-right">{toRounded(row.totalTokens)}</td>
                        <td className="px-2 py-2 text-right">{toCurrency(row.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
