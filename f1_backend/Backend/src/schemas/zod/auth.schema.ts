import { z } from 'zod';

export const UpdateMeSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  photoURL:    z.string().url().nullable().optional(),
  bio:         z.string().max(400).nullable().optional(),
});

export const SetRoleSchema = z.object({
  role: z.enum(['viewer', 'editor', 'admin']),
});

export type UpdateMeInput = z.infer<typeof UpdateMeSchema>;
export type SetRoleInput  = z.infer<typeof SetRoleSchema>;
