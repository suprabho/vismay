import mongoose, { Schema, Document } from 'mongoose';

export interface IDriverInfo {
  driverNumber:          number;
  abbreviation:          string;
  fullName:              string;
  firstName:             string;
  lastName:              string;
  broadcastName:         string;
  driverId:              string;
  teamName:              string;
  teamId:                string;
  teamColour:            string;
  headshotUrl:           string | null;
  countryCode:           string | null;
  championshipPosition?: number | null;
  championshipPoints?:   number | null;
  championshipWins?:     number | null;
}

export interface IProcessedLap {
  driverNumber: number;
  lap:          number;
  lapTimeSec:   number | null;
  sectors:      Array<number | null>;
  compound:     string;
  stintLap:     number;
  tyreLife:     number;
  freshTyre:    boolean;
  events:       string[];
  position?:    number | null;
}

export interface ISessionResult {
  driverNumber:       number;
  abbreviation:       string;
  gridPosition:       number | null;
  position:           number | null;
  classifiedPosition: string | null;
  points:             number;
  status:             string;
  dnf:                boolean;
  dnfReason:          string | null;
  timeSec:            number | null;
  laps:               number | null;
  q1TimeSec:          number | null;
  q2TimeSec:          number | null;
  q3TimeSec:          number | null;
  headshotUrl:        string | null;
  countryCode:        string | null;
}

export interface IWeatherDataPoint {
  lap:           number | null;
  airTemp:       number;
  trackTemp:     number;
  humidity:      number;
  windSpeed:     number;
  windDirection: number;
  rainfall:      boolean;
}

export interface IRaceControlMessage {
  lap:      number | null;
  category: string;
  message:  string;
  flag:     string | null;
  status:   string | null;
}

export interface IStint {
  driverNumber:     number;
  stintNumber:      number;
  compound:         string;
  startLap:         number;
  endLap:           number;
  totalLaps:        number;
  pitInLap:         number | null;
  pitOutLap:        number | null;
  pitDeltaSec:      number | null;
  averageDegPerLap: number | null;
}

export interface ILapTelemetryAggregate {
  driverNumber:    number;
  lap:             number;
  avgSpeed:        number;
  maxSpeed:        number;
  avgThrottlePct:  number;
  brakingEvents:   number;
  drsActivations:  number;
  topGear:         number;
  lapDistanceM:    number;
  sector1MaxSpeed: number;
  sector2MaxSpeed: number;
  sector3MaxSpeed: number;
  avgGapToAheadM:  number;
  minGapToAheadM:  number;
  maxRpm:          number;
  avgRpm:          number;
  elevationGainM:  number;
}

export interface ITelemetrySession extends Document {
  sessionKey:              string;
  sessionName:             string;
  circuitName:             string;
  country:                 string;
  year:                    number;
  meetingKey:              string;
  dateStart:               Date | null;
  dateEnd:                 Date | null;
  ingestedAt:              Date | null;
  drivers:                 IDriverInfo[];
  processedLaps:           IProcessedLap[];
  sessionResults:          ISessionResult[];
  weatherData:             IWeatherDataPoint[];
  raceControlMessages:     IRaceControlMessage[];
  stints:                  IStint[];
  lapTelemetryAggregates:  ILapTelemetryAggregate[];
  telemetryStatus:         'pending' | 'processing' | 'done' | 'failed';
  telemetryError:          string | null;
  positionsStatus:         'pending' | 'processing' | 'done' | 'failed';
  positionsError:          string | null;
  circuitKey:              string;
  rawDataRef: {
    lapsPath:    string | null;
    carDataPath: string | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

const TelemetrySessionSchema = new Schema<ITelemetrySession>(
  {
    sessionKey:  { type: String, required: true },
    sessionName: { type: String, default: '' },
    circuitName: { type: String, default: '' },
    country:     { type: String, default: '' },
    year:        { type: Number, default: 0 },
    meetingKey:  { type: String, default: '' },
    dateStart:   { type: Date, default: null },
    dateEnd:     { type: Date, default: null },
    ingestedAt:  { type: Date, default: null },
    drivers: [
      {
        driverNumber:         Number,
        abbreviation:         { type: String, default: '' },
        fullName:             { type: String, default: '' },
        firstName:            { type: String, default: '' },
        lastName:             { type: String, default: '' },
        broadcastName:        { type: String, default: '' },
        driverId:             { type: String, default: '' },
        teamName:             { type: String, default: '' },
        teamId:               { type: String, default: '' },
        teamColour:           { type: String, default: '#ffffff' },
        headshotUrl:          { type: String, default: null },
        countryCode:          { type: String, default: null },
        championshipPosition: { type: Number, default: null },
        championshipPoints:   { type: Number, default: null },
        championshipWins:     { type: Number, default: null },
        _id:                  false,
      },
    ],
    processedLaps: [
      {
        driverNumber: Number,
        lap:          Number,
        lapTimeSec:   { type: Number, default: null },
        sectors:      [{ type: Number, default: null }],
        compound:     String,
        stintLap:     Number,
        tyreLife:     { type: Number, default: 0 },
        freshTyre:    { type: Boolean, default: false },
        events:       [String],
        position:     { type: Number, default: null },
        _id:          false,
      },
    ],
    sessionResults: [
      {
        driverNumber:       Number,
        abbreviation:       String,
        gridPosition:       { type: Number, default: null },
        position:           { type: Number, default: null },
        classifiedPosition: { type: String, default: null },
        points:             { type: Number, default: 0 },
        status:             { type: String, default: '' },
        dnf:                { type: Boolean, default: false },
        dnfReason:          { type: String, default: null },
        timeSec:            { type: Number, default: null },
        laps:               { type: Number, default: null },
        q1TimeSec:          { type: Number, default: null },
        q2TimeSec:          { type: Number, default: null },
        q3TimeSec:          { type: Number, default: null },
        headshotUrl:        { type: String, default: null },
        countryCode:        { type: String, default: null },
        _id:                false,
      },
    ],
    weatherData: [
      {
        lap:           { type: Number, default: null },
        airTemp:       { type: Number, default: 0 },
        trackTemp:     { type: Number, default: 0 },
        humidity:      { type: Number, default: 0 },
        windSpeed:     { type: Number, default: 0 },
        windDirection: { type: Number, default: 0 },
        rainfall:      { type: Boolean, default: false },
        _id:           false,
      },
    ],
    raceControlMessages: [
      {
        lap:      { type: Number, default: null },
        category: { type: String, default: '' },
        message:  { type: String, default: '' },
        flag:     { type: String, default: null },
        status:   { type: String, default: null },
        _id:      false,
      },
    ],
    stints: [
      {
        driverNumber:     { type: Number, default: 0 },
        stintNumber:      { type: Number, default: 0 },
        compound:         { type: String, default: 'UNKNOWN' },
        startLap:         { type: Number, default: 0 },
        endLap:           { type: Number, default: 0 },
        totalLaps:        { type: Number, default: 0 },
        pitInLap:         { type: Number, default: null },
        pitOutLap:        { type: Number, default: null },
        pitDeltaSec:      { type: Number, default: null },
        averageDegPerLap: { type: Number, default: null },
        _id:              false,
      },
    ],
    lapTelemetryAggregates: [
      {
        driverNumber:    { type: Number, default: 0 },
        lap:             { type: Number, default: 0 },
        avgSpeed:        { type: Number, default: 0 },
        maxSpeed:        { type: Number, default: 0 },
        avgThrottlePct:  { type: Number, default: 0 },
        brakingEvents:   { type: Number, default: 0 },
        drsActivations:  { type: Number, default: 0 },
        topGear:         { type: Number, default: 0 },
        lapDistanceM:    { type: Number, default: 0 },
        sector1MaxSpeed: { type: Number, default: 0 },
        sector2MaxSpeed: { type: Number, default: 0 },
        sector3MaxSpeed: { type: Number, default: 0 },
        avgGapToAheadM:  { type: Number, default: 0 },
        minGapToAheadM:  { type: Number, default: 0 },
        maxRpm:          { type: Number, default: 0 },
        avgRpm:          { type: Number, default: 0 },
        elevationGainM:  { type: Number, default: 0 },
        _id:             false,
      },
    ],
    telemetryStatus: {
      type:    String,
      enum:    ['pending', 'processing', 'done', 'failed'],
      default: 'pending',
    },
    telemetryError: { type: String, default: null },
    positionsStatus: {
      type:    String,
      enum:    ['pending', 'processing', 'done', 'failed'],
      default: 'pending',
    },
    positionsError: { type: String, default: null },
    circuitKey:     { type: String, default: '' },
    rawDataRef: {
      lapsPath:    { type: String, default: null },
      carDataPath: { type: String, default: null },
    },
  },
  { timestamps: true, collection: 'telemetry_sessions' }
);

TelemetrySessionSchema.index({ sessionKey: 1 }, { unique: true });
TelemetrySessionSchema.index({ year: -1 });
TelemetrySessionSchema.index({ meetingKey: 1 });

export const TelemetrySession = mongoose.model<ITelemetrySession>(
  'TelemetrySession',
  TelemetrySessionSchema
);
