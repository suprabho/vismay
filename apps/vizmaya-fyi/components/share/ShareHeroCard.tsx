'use client'

interface Props {
  title: string
  /** Paragraph below the title (the "dek"). Optional. */
  dek?: string
}

export default function ShareHeroCard({ title, dek }: Props) {
  return (
    <div className="flex flex-col justify-start h-full p-[20px]">
      <h1
        className="font-serif font-bold leading-[1.2] text-[28px]"
        style={{ color: 'white' }}
      >
        {title}
      </h1>
      {dek && (
        <p
          className="font-serif text-[19px] leading-[1.45] mt-[20px]"
          style={{ color: 'var(--color-muted)' }}
        >
          {dek}
        </p>
      )}
    </div>
  )
}
