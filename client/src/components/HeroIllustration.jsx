// Original inline illustration (no third-party licensing). Decorative: hero text conveys the message.
export function HeroIllustration() {
  return (
    <svg className="hero-illustration" viewBox="0 0 560 400" role="img" aria-label="A student enjoying a book in a bright reading space">
      <defs>
        <linearGradient id="reading-room-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--surface-2)" />
          <stop offset="1" stopColor="var(--surface)" />
        </linearGradient>
        <linearGradient id="reading-book" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--brand)" />
          <stop offset="1" stopColor="var(--brand-hover)" />
        </linearGradient>
      </defs>
      <rect x="14" y="12" width="532" height="376" rx="28" fill="url(#reading-room-bg)" />
      <circle cx="448" cy="88" r="50" fill="var(--success)" opacity=".14" />
      <circle cx="110" cy="272" r="66" fill="var(--brand)" opacity=".08" />

      <rect x="370" y="48" width="112" height="126" rx="14" fill="var(--surface)" stroke="var(--border)" strokeWidth="3" />
      <path d="M426 48v126M370 111h112" stroke="var(--border)" strokeWidth="3" />
      <path d="M382 161c16-22 31-27 44-12 11-25 28-33 44-17v33H382Z" fill="var(--success)" opacity=".45" />

      <rect x="52" y="180" width="32" height="136" rx="15" fill="var(--success)" opacity=".82" />
      <path d="M68 205c-34-7-42-27-34-44 24 2 39 17 34 44ZM68 240c31-8 43-27 37-44-23 2-39 17-37 44ZM68 271c-29-4-43-21-39-38 22 0 38 13 39 38Z" fill="var(--success)" opacity=".72" />
      <path d="M40 314h58l-8 18H48Z" fill="var(--brand)" opacity=".76" />

      <ellipse cx="280" cy="345" rx="166" ry="18" fill="var(--brand)" opacity=".12" />
      <path d="M169 250h222l-17 77H185Z" fill="var(--brand)" opacity=".92" />
      <path d="M196 327h168l12 18H184Z" fill="var(--brand-hover)" />
      <rect x="228" y="345" width="12" height="27" rx="5" fill="var(--text-dim)" opacity=".45" />
      <rect x="326" y="345" width="12" height="27" rx="5" fill="var(--text-dim)" opacity=".45" />

      <path d="M217 223c0-53 27-92 67-92 43 0 69 38 69 93v39H217Z" fill="var(--text)" />
      <path d="M242 184c0-34 17-57 43-57 28 0 45 23 45 57v23h-88Z" fill="var(--text)" />
      <ellipse cx="286" cy="186" rx="37" ry="43" fill="#d99a72" />
      <path d="M250 174c5-32 23-48 48-43 18 4 27 17 30 37-16-5-28-15-35-27-8 17-22 28-43 33Z" fill="var(--text)" />
      <path d="M274 191c4 4 8 4 12 0" fill="none" stroke="#7c3f38" strokeWidth="3" strokeLinecap="round" />
      <circle cx="274" cy="181" r="2.6" fill="#1f2937" />
      <circle cx="301" cy="181" r="2.6" fill="#1f2937" />
      <path d="M248 224c13 18 60 20 76 0l25 31-20 41h-87l-18-42Z" fill="var(--success)" />
      <path d="M254 248 222 276l-37-8c-8-2-14 4-11 11 2 5 9 9 18 11l49 12 33-34ZM320 248l34 27 34-12c9-3 15 2 13 9-1 6-7 10-17 14l-47 17-32-34Z" fill="#d99a72" />

      <path d="M226 270c20-17 42-24 62-24 21 0 43 8 65 24v51c-20-14-42-21-65-21s-44 7-62 21Z" fill="url(#reading-book)" stroke="var(--surface)" strokeWidth="4" strokeLinejoin="round" />
      <path d="M288 248v53" stroke="var(--surface)" strokeWidth="3" opacity=".9" />
      <path d="M241 273c14-8 28-12 42-12M241 285c14-8 28-12 42-12M301 261c14 0 28 4 41 12M301 273c14 0 28 4 41 12" stroke="var(--on-brand)" strokeWidth="3" strokeLinecap="round" opacity=".72" />

      <path d="m141 97 7 15 16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2Z" fill="var(--brand)" opacity=".7" />
      <circle cx="341" cy="86" r="5" fill="var(--success)" />
      <circle cx="152" cy="151" r="4" fill="var(--brand)" opacity=".6" />
    </svg>
  );
}
