import mongoose, { Schema, Document } from 'mongoose';

export interface ICarPositionFrames {
  t:      number[];
  x:      number[];
  y:      number[];
  lap:    number[];
  status: number[];
}

export interface ICarPosition extends Document {
  sessionKey:   string;
  circuitKey:   string;
  driverNumber: number;
  sampleRateHz: number;
  frameCount:   number;
  t0Ms:         number;
  tEndMs:       number;
  frames:       ICarPositionFrames;
  updatedAt:    Date;
  createdAt:    Date;
}

const CarPositionSchema = new Schema<ICarPosition>(
  {
    sessionKey:   { type: String, required: true },
    circuitKey:   { type: String, default: '' },
    driverNumber: { type: Number, required: true },
    sampleRateHz: { type: Number, default: 4 },
    frameCount:   { type: Number, default: 0 },
    t0Ms:         { type: Number, default: 0 },
    tEndMs:       { type: Number, default: 0 },
    frames: {
      t:      { type: [Number], default: [] },
      x:      { type: [Number], default: [] },
      y:      { type: [Number], default: [] },
      lap:    { type: [Number], default: [] },
      status: { type: [Number], default: [] },
    },
  },
  { timestamps: true, collection: 'car_positions' }
);

CarPositionSchema.index({ sessionKey: 1, driverNumber: 1 }, { unique: true });
CarPositionSchema.index({ sessionKey: 1 });

export const CarPosition = mongoose.model<ICarPosition>('CarPosition', CarPositionSchema);
