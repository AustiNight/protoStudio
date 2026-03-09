import { useEffect, useMemo, useRef, useState } from 'react';

import { runtimeConfig } from '@/config/runtime-config';
import { useLogStore, type StudioLogLevel } from '@/store/log-store';

type LogViewerPanelProps = {
  label: string;
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

export function LogViewerPanel({ label }: LogViewerPanelProps) {
  const entries = useLogStore((state) => state.entries);
  const clearLogs = useLogStore((state) => state.clear);
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

  const isAllLevelsSelected = selectedLevels.length === LOG_LEVELS.length;
  const isSourceFilterActive = selectedSources.length > 0;
  const isSearchActive = searchQuery.trim().length > 0;

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [filteredEntries.length]);

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

  return (
    <>
      <header className="flex items-center justify-between">
        <h2 className="font-['JetBrains_Mono'] text-lg font-bold uppercase tracking-[0.22em] text-slate-100">
          {label}
        </h2>
        <span className="rounded-full border border-slate-800/80 px-3 py-1 font-['JetBrains_Mono'] text-xs uppercase tracking-[0.2em] text-slate-300">
          {filteredEntries.length}
        </span>
      </header>

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
    </>
  );
}
