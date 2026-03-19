import type React from 'react';

const PATH_D =
  'M0 0C0 -28 -32 -28 -32 0C-32 28 0 28 0 0C0 -28 32 -28 32 0C32 28 0 28 0 0Z';

export const OuroborosLoader: React.FC<{ label?: string }> = ({ label }) => {
  return (
    <div className="pointer-events-none flex h-full w-full flex-col items-center justify-center gap-4 text-center text-slate-400">
      <div className="relative h-48 w-48">
        <svg viewBox="-60 -40 120 80" className="h-full w-full" role="img" aria-label="Building prototype">
          <defs>
            <linearGradient id="ouroborosBody" x1="0%" x2="100%" y1="0%" y2="0%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#f97316" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0.9" />
            </linearGradient>
            <radialGradient id="ouroborosGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g opacity="0.85">
            <path
              d={PATH_D}
              fill="none"
              stroke="url(#ouroborosBody)"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <circle cx="0" cy="0" r="24" fill="url(#ouroborosGlow)" opacity="0.15" />
          </g>
          <path
            d={PATH_D}
            fill="none"
            stroke="#fde68a"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="6 12"
            opacity="0.35"
          >
            <animate attributeName="stroke-dashoffset" values="0;40" dur="3.8s" repeatCount="indefinite" />
          </path>
          <g>
            <g>
              <path
                d="M6 0c0 -3 -2.3 -5.3 -5.3 -5.3s-5.3 2.3 -5.3 5.3 2.3 5.3 5.3 5.3 5.3 -2.3 5.3 -5.3z"
                fill="#1f2937"
                stroke="#facc15"
                strokeWidth="1.2"
              />
              <circle cx="-1" cy="-1" r="1.1" fill="#fef3c7" />
            </g>
            <animateMotion dur="3.8s" repeatCount="indefinite" rotate="auto" path={PATH_D} />
          </g>
        </svg>
      </div>
      <div className="max-w-xs text-sm text-slate-400">
        {label ??
          'Synthesizing your live preview. Hang tight while the studio links everything together.'}
      </div>
    </div>
  );
};
