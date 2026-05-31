export type RunStatus   = 'queued' | 'running' | 'done' | 'failed';
export type RunPipeline = 'langraph_telemetry' | 'crew_story' | 'full';
export type RunStage    = 'angles' | 'stories';

export interface StoryRun {
  _id:         string;
  sessionKey:  string;
  pipeline:    RunPipeline;
  stage?:      RunStage | null;
  status:      RunStatus;
  createdAt:   string;
  startedAt:   string | null;
  completedAt: string | null;
  logs:        string[];
  error:       string | null;
  outputRef?: {
    storyId?:   string;
    graphIds?:  string[];
    signalIds?: string[];
  };
  triggeredBy?:            { _id: string; displayName?: string; email?: string } | null;
  sessionTelemetryStatus?: TelemetryStatus;
  sessionTelemetryError?:  string | null;
  durationMs?:             number | null;
}

export type TelemetryStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface TelemetrySession {
  sessionKey:            string;
  sessionName:           string;
  circuitName:           string;
  country:               string;
  year:                  number;
  dateStart:             string | null;
  ingestedAt:            string | null;
  telemetryStatus:       TelemetryStatus;
  telemetryError?:       string | null;
  positionsStatus?:      TelemetryStatus;
  positionsError?:       string | null;
  circuitKey?:           string;
  driverCount?:          number;
  lapCount?:             number;
  aggregateCount?:       number;
  weatherRowCount?:      number;
  raceControlCount?:     number;
  resultsCount?:         number;
  stintCount?:           number;
  positionsDriverCount?: number;
}

export interface SessionDriver {
  driverNumber:  number;
  abbreviation:  string;
  fullName:      string;
  firstName?:    string;
  lastName?:     string;
  broadcastName?: string;
  driverId?:     string;
  teamName:      string;
  teamId?:       string;
  teamColour:    string;
  headshotUrl?:  string | null;
  countryCode?:  string | null;
}

export interface SessionSummary {
  sessionKey:      string;
  sessionName:     string;
  circuitName:     string;
  country:         string;
  year:            number;
  dateStart:       string | null;
  ingestedAt:      string | null;
  telemetryStatus: TelemetryStatus;
  telemetryError:  string | null;
  positionsStatus: TelemetryStatus;
  positionsError:  string | null;
  circuitKey:      string;
  circuitPresent:  boolean;
  counts: {
    drivers:           number;
    laps:              number;
    aggregates:        number;
    weatherRows:       number;
    raceControlEvents: number;
    results:           number;
    stints:            number;
    positionsDrivers:  number;
    rawTelemetryDocs:  number;
  };
  drivers: SessionDriver[];
  samples: {
    processedLap:      Record<string, unknown> | null;
    lapAggregate:      Record<string, unknown> | null;
    sessionResult:     Record<string, unknown> | null;
    weatherRow:        Record<string, unknown> | null;
    raceControlEvent:  Record<string, unknown> | null;
    stint:             Record<string, unknown> | null;
    rawTelemetryFrame: {
      sessionKey:   string;
      driverNumber: number;
      lap:          number;
      frameCount:   number;
      firstFrame:   Record<string, number | null>;
    } | null;
    carPositionFrame: {
      driverNumber: number;
      frameCount:   number;
      sampleRateHz: number;
      firstFrame:   { t: number | null; x: number | null; y: number | null; lap: number | null; status: number | null };
    } | null;
  };
}

export interface AuditEntry {
  _id:       string;
  actorId:   string;
  action:    string;
  resource:  string;
  metadata:  Record<string, unknown>;
  createdAt: string;
}
