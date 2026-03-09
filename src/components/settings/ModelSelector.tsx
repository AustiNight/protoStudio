export interface ModelSelectorProviderOption {
  id: string;
  label: string;
}

export interface ModelSelectorModelOption {
  id: string;
  label: string;
  providerId: string;
}

export interface ModelSelectorProps {
  title: string;
  providerId: string;
  modelId: string;
  providers: ModelSelectorProviderOption[];
  models: ModelSelectorModelOption[];
  onProviderChange: (providerId: string) => void;
  onModelChange: (modelId: string) => void;
}

export function ModelSelector({
  title,
  providerId,
  modelId,
  providers,
  models,
  onProviderChange,
  onModelChange,
}: ModelSelectorProps) {
  const modelsForProvider = models.filter((model) => model.providerId === providerId);

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4">
      <h4 className="text-sm font-semibold text-slate-100">{title}</h4>
      <div className="mt-3 grid gap-3">
        <label className="text-xs uppercase tracking-[0.2em] text-slate-400">
          Provider
          <select
            value={providerId}
            onChange={(event) => onProviderChange(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-300/70"
          >
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs uppercase tracking-[0.2em] text-slate-400">
          Model
          <select
            value={modelId}
            onChange={(event) => onModelChange(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-300/70"
          >
            {modelsForProvider.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
