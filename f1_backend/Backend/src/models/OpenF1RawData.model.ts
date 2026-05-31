import mongoose, { Schema, Document } from 'mongoose';

export interface IOpenF1RawData extends Document {
  sessionKey:  string;
  endpoint:    string;
  fetchedAt:   Date;
  recordCount: number;
  data:        mongoose.Schema.Types.Mixed[];
}

const OpenF1RawDataSchema = new Schema<IOpenF1RawData>(
  {
    sessionKey:  { type: String, required: true },
    endpoint:    { type: String, required: true },
    fetchedAt:   { type: Date,   default: Date.now },
    recordCount: { type: Number, default: 0 },
    data:        [Schema.Types.Mixed],
  },
  { timestamps: false },
);

OpenF1RawDataSchema.index({ sessionKey: 1, endpoint: 1 }, { unique: true });

export const OpenF1RawData = mongoose.model<IOpenF1RawData>('OpenF1RawData', OpenF1RawDataSchema);
