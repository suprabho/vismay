/**
 * Renders one or more JSON-LD documents into a server-side
 * `<script type="application/ld+json">`. Server component — the markup ships in
 * the initial HTML so crawlers and AI engines read the structured data without
 * executing JS.
 *
 * Pass a single schema object or an array; arrays render one <script> each
 * (Google reads multiple blocks fine, and it keeps each entity independently
 * validatable).
 */

type JsonLdDoc = Record<string, unknown>

export default function JsonLd({ data }: { data: JsonLdDoc | JsonLdDoc[] }) {
  const docs = Array.isArray(data) ? data : [data]
  return (
    <>
      {docs.map((doc, i) => (
        <script
          key={i}
          type="application/ld+json"
          // Serialised server-side; values are our own data, not user HTML.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(doc) }}
        />
      ))}
    </>
  )
}
