import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  actorId:    mongoose.Types.ObjectId | null;
  action:     string;
  resource:   string;
  resourceId: string;
  diff:       Record<string, unknown> | null;
  ip:         string;
  userAgent:  string;
  createdAt:  Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actorId:    { type: Schema.Types.ObjectId, ref: 'User', default: null },
    action:     { type: String, required: true },  // e.g. 'story.publish', 'user.role.change'
    resource:   { type: String, required: true },  // collection name
    resourceId: { type: String, required: true },
    diff:       { type: Schema.Types.Mixed, default: null },
    ip:         { type: String, default: '' },
    userAgent:  { type: String, default: '' },
  },
  {
    // Audit logs are append-only; disable updatedAt
    timestamps: { createdAt: true, updatedAt: false },
  }
);

AuditLogSchema.index({ actorId: 1 });
AuditLogSchema.index({ resource: 1, resourceId: 1 });
AuditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
