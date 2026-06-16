import mongoose, { Schema, Document } from 'mongoose';

export interface ICircuitCorner {
  number:   number;
  letter:   string;
  x:        number;
  y:        number;
  angle:    number;
  distance: number;
}

export interface ICircuit extends Document {
  circuitKey:  string;
  year:        number;
  gpName:      string;
  circuitName: string;
  country:     string;
  rotationDeg: number;
  corners:     ICircuitCorner[];
  outline:     { x: number[]; y: number[]; z?: number[] };
  bounds:      { minX: number; maxX: number; minY: number; maxY: number } | null;
  sectorBoundaries: { index1: number; index2: number } | null;
  createdAt:   Date;
  updatedAt:   Date;
}

const CircuitSchema = new Schema<ICircuit>(
  {
    circuitKey:  { type: String, required: true },
    year:        { type: Number, required: true },
    gpName:      { type: String, default: '' },
    circuitName: { type: String, default: '' },
    country:     { type: String, default: '' },
    rotationDeg: { type: Number, default: 0 },
    corners: [
      {
        number:   { type: Number, default: 0 },
        letter:   { type: String, default: '' },
        x:        { type: Number, default: 0 },
        y:        { type: Number, default: 0 },
        angle:    { type: Number, default: 0 },
        distance: { type: Number, default: 0 },
        _id:      false,
      },
    ],
    outline: {
      x: { type: [Number], default: [] },
      y: { type: [Number], default: [] },
      // elevation polyline; undefined on pre-elevation circuit revisions
      z: { type: [Number], default: undefined },
    },
    bounds: {
      type: {
        minX: Number,
        maxX: Number,
        minY: Number,
        maxY: Number,
      },
      default: null,
    },
    sectorBoundaries: {
      type: {
        index1: Number,
        index2: Number,
      },
      default: null,
    },
  },
  { timestamps: true }
);

CircuitSchema.index({ circuitKey: 1, year: 1 }, { unique: true });

export const Circuit = mongoose.model<ICircuit>('Circuit', CircuitSchema);
