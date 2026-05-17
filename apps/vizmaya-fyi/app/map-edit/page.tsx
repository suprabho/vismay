import MapEditShell from '@/components/map-edit/MapEditShell'

export const metadata = {
  title: 'Map Editor — vizmaya',
}

export default function MapEditPage() {
  return (
    <MapEditShell accessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''} />
  )
}
