'use client';

type Props = {
  name: string;
  crestUrl: string | null;
  selected: boolean;
  onClick: () => void;
};

export function EntityChip({ name, crestUrl, selected, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mr-2 mb-2 gap-2 flex items-center rounded-full border px-3 py-2 transition-colors ${
        selected ? 'border-accent bg-accent/20 text-accent' : 'border-border bg-surface text-text hover:border-muted '
      }`}
    >
      {crestUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <div className="bg-white/20 rounded-full overflow-hidden">
          <img src={crestUrl} alt="" className="h-5 w-5 object-contain" />
        </div>
      ) : null}
      <span className={`text-sm ${selected ? 'font-medium' : '' }`}>{name}</span>
    </button>
  );
}
