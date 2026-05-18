import type { EmbedLayerConfig } from './index'

export const sample: EmbedLayerConfig = {
  type: 'embed',
  src: 'https://en.wikipedia.org/wiki/Special:RandomInCategory/Visualization',
  poster:
    'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=70',
  aspect: '16 / 9',
  sandbox: 'allow-scripts allow-same-origin',
  title: 'Embedded webpage',
}
