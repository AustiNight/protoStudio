type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid' | 'error';

export interface ApiKeyInputProps {
  label: string;
  description: string;
  value: string;
  placeholder: string;
  status: ValidationStatus;
  statusMessage: string;
  onChange: (value: string) => void;
  onValidate: () => void;
}

export function ApiKeyInput({
  label,
  description,
  value,
  placeholder,
  status,
  statusMessage,
  onChange,
  onValidate,
}: ApiKeyInputProps) {
  const statusTone =
    status === 'valid'
      ? 'text-emerald-200'
      : status === 'invalid' || status === 'error'
        ? 'text-rose-200'
        : 'text-slate-400';

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-100">{label}</h4>
          <p className="mt-1 text-xs text-slate-400">{description}</p>
        </div>
        <button
          type="button"
          onClick={onValidate}
          className="rounded-full border border-slate-800/80 bg-slate-900/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-200 transition hover:border-emerald-300/60 hover:text-emerald-200"
        >
          {status === 'validating' ? 'Pinging' : 'Ping'}
        </button>
      </div>
      <input
        type="password"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 w-full rounded-2xl border border-slate-800/80 bg-slate-950/60 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-300/70"
      />
      <p className={`mt-2 text-xs ${statusTone}`}>{statusMessage}</p>
    </div>
  );
}
