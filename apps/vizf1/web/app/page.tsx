import { F1_BRAND } from '@vizf1/brand'

export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        gap: '1rem',
      }}
    >
      <div
        style={{
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.2em',
          color: F1_BRAND.colors.accent,
        }}
      >
        VizF1
      </div>
      <h1 style={{ fontSize: '2.5rem', fontWeight: 700, textAlign: 'center', maxWidth: '24ch' }}>
        Data journalism for Formula 1
      </h1>
      <p style={{ opacity: 0.7, textAlign: 'center', maxWidth: '52ch' }}>
        Scaffold. Hello-world page proves the workspace is wired. Real stories arrive after the
        engine adoption (Phase B) and a first F1 ingest pipeline land.
      </p>
    </main>
  )
}
