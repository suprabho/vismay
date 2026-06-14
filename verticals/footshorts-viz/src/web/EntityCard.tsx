'use client';

type Props = {
  name: string;
  crestUrl: string | null;
  country?: string | null;
  selected: boolean;
  onClick: () => void;
};

export function EntityCard({ name, crestUrl, country, selected, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`relative flex flex-col items-center gap-3 rounded-2xl border p-4 text-center transition-colors ${
        selected ? 'border-accent bg-accent/10' : 'border-border bg-surface hover:border-muted'
      }`}
    >
      {selected ? (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-bg">
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ) : null}
      {crestUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-white/10">
          <img src={crestUrl} alt="" className="h-10 w-10 object-contain" />
        </div>
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-lg font-bold text-muted">
          {name.charAt(0)}
        </div>
      )}
      <span className={`text-sm leading-tight ${selected ? 'font-semibold text-accent' : 'font-medium text-text'}`}>
        {name}
      </span>
      {country ? <span className="-mt-1 text-xs text-muted">{country}</span> : null}
    </button>
  );
}
