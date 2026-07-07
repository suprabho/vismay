import type { TelemetryClipConfig } from './index'
import { buildSampleClip } from './sampleClip'

export const sample: TelemetryClipConfig = {
  type: 'f1:telemetry-clip',
  sessionKey: 'sample',
  lapFrom: 1,
  lapTo: 2,
  driverNumbers: [1, 16],
  focalDriverNumber: 1,
  caption: 'Verstappen vs Leclerc — opening laps',
  autoPlay: true,
  clip: buildSampleClip(),
}
