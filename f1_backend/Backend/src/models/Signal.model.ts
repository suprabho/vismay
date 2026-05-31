import mongoose, { Schema, Document } from 'mongoose';

export type SignalPriority = 'high' | 'med' | 'low';
export type SignalScopeKind = 'session' | 'driver' | 'team';

export interface ITelemetryField {
  label:      string;
  value:      string;
  colorToken: string;
  percentage?: number;
}

export interface ISignal extends Document {
  sessionKey:     string;
  lap:            number | null;
  location:       string;
  priority:       SignalPriority;
  title:          string;
  meaning:        string;
  implication:    string;
  telemetryFields: ITelemetryField[];
  driverNumber:   number | null;
  teamId:         string | null;
  teamName:       string | null;
  scopeKind:      SignalScopeKind;
  isActive:       boolean;
  aiGenerated:    boolean;
  createdAt:      Date;
  updatedAt:      Date;
}

const SignalSchema = new Schema<ISignal>(
  {
    sessionKey:   { type: String, required: true },
    lap:          { type: Number, default: null },
    location:     { type: String, required: true },
    priority:     { type: String, enum: ['high', 'med', 'low'], required: true },
    title:        { type: String, required: true, maxlength: 300 },
    meaning:      { type: String, required: true },
    implication:  { type: String, required: true },
    telemetryFields: [
      {
        label:      { type: String, required: true },
        value:      { type: String, required: true },
        colorToken: { type: String, required: true },
        percentage: { type: Number, min: 0, max: 100 },
        _id:        false,
      },
    ],
    driverNumber: { type: Number, default: null },
    teamId:       { type: String, default: null },
    teamName:     { type: String, default: null },
    scopeKind:    { type: String, enum: ['session', 'driver', 'team'], default: 'session' },
    isActive:     { type: Boolean, default: true },
    aiGenerated:  { type: Boolean, default: false },
  },
  { timestamps: true }
);

SignalSchema.index({ sessionKey: 1, lap: -1 });
SignalSchema.index({ priority: 1 });
SignalSchema.index({ isActive: 1 });
SignalSchema.index({ sessionKey: 1, driverNumber: 1 });
SignalSchema.index({ sessionKey: 1, teamId: 1 });
SignalSchema.index({ sessionKey: 1, scopeKind: 1 });

export const Signal = mongoose.model<ISignal>('Signal', SignalSchema);
