import mongoose, { Schema, Document } from 'mongoose';

export type StoryStatus = 'draft' | 'published' | 'archived';
export type BlockType   = 'paragraph' | 'heading' | 'quote' | 'stat' | 'graph_embed' | 'telemetry_clip';
export type StoryScopeKind = 'session' | 'driver' | 'team';

export interface IContentBlock {
  type:     BlockType;
  text?:    string;
  graphId?: mongoose.Types.ObjectId;
  meta?:    Record<string, unknown>;
}

export interface IStoryScope {
  kind:          StoryScopeKind;
  driverNumber?: number | null;
  teamId?:       string | null;
  teamName?:     string | null;
}

export interface IStory extends Document {
  slug:         string;
  status:       StoryStatus;
  category:     string;
  title:        string;
  summary:      string;
  coverImage:   { url: string; alt: string };  // populated by AI worker; defaults to '' for drafts
  content:      IContentBlock[];
  readTimeMin:  number;
  tags:         string[];
  sessionKey:   string | null;
  scope:        IStoryScope;
  parentStoryId: mongoose.Types.ObjectId | null;
  analysisAngleId: mongoose.Types.ObjectId | null;
  publishedAt:  Date | null;
  aiGenerated:  boolean;
  /**
   * Review metadata written by the AI worker:
   *  - needsReview: set true when the claim verifier OR angle-coherence judge
   *    flagged the draft.
   *  - reviewReasons: short human-readable strings (capped).
   *  - angleCoherenceScore: 0–10 LLM judge score on how well the story serves
   *    its angle. Optional — absent for session stories and non-AI drafts.
   */
  needsReview?:        boolean;
  reviewReasons?:      string[];
  angleCoherenceScore?: number;
  authorId:     mongoose.Types.ObjectId | null;
  seo: {
    metaTitle:       string | null;
    metaDescription: string | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ContentBlockSchema = new Schema<IContentBlock>(
  {
    type:    { type: String, enum: ['paragraph', 'heading', 'quote', 'stat', 'graph_embed', 'telemetry_clip'], required: true },
    text:    { type: String },
    graphId: { type: Schema.Types.ObjectId, ref: 'GraphSpec' },
    meta:    { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const StorySchema = new Schema<IStory>(
  {
    slug:        { type: String, required: true, trim: true, lowercase: true },
    status:      { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
    category:    { type: String, required: true, trim: true },
    title:       { type: String, required: true, maxlength: 200, trim: true },
    summary:     { type: String, maxlength: 500, default: '' },
    coverImage:  {
      url: { type: String, default: '' },
      alt: { type: String, default: '' },
    },
    content:     [ContentBlockSchema],
    readTimeMin: { type: Number, default: 5 },
    tags:        [{ type: String, trim: true }],
    sessionKey:  { type: String, default: null },
    scope: {
      kind:         { type: String, enum: ['session', 'driver', 'team'], default: 'session' },
      driverNumber: { type: Number, default: null },
      teamId:       { type: String, default: null },
      teamName:     { type: String, default: null },
      _id:          false,
    },
    parentStoryId: { type: Schema.Types.ObjectId, ref: 'Story', default: null },
    analysisAngleId: { type: Schema.Types.ObjectId, ref: 'AnalysisAngle', default: null },
    publishedAt: { type: Date, default: null },
    aiGenerated: { type: Boolean, default: false },
    needsReview:         { type: Boolean, default: undefined },
    reviewReasons:       { type: [String], default: undefined },
    angleCoherenceScore: { type: Number, min: 0, max: 10, default: undefined },
    authorId:    { type: Schema.Types.ObjectId, ref: 'User', default: null },
    seo: {
      metaTitle:       { type: String, default: null },
      metaDescription: { type: String, default: null },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = String(ret._id);
        return ret;
      },
    },
  }
);

StorySchema.index({ slug: 1 },                  { unique: true });
StorySchema.index({ status: 1, publishedAt: -1 });
StorySchema.index({ category: 1 });
StorySchema.index({ sessionKey: 1 });
StorySchema.index({ sessionKey: 1, 'scope.kind': 1, 'scope.driverNumber': 1 });
StorySchema.index({ sessionKey: 1, 'scope.kind': 1, 'scope.teamId': 1 });
StorySchema.index({ parentStoryId: 1 });
StorySchema.index({ title: 'text', summary: 'text' });

export const Story = mongoose.model<IStory>('Story', StorySchema);
