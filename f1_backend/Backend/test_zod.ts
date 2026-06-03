import { z } from 'zod';
import { UpdateStorySchema } from './src/schemas/zod/stories.schema';

const payload = {
  content: []
};

const result = UpdateStorySchema.safeParse(payload);
console.log(JSON.stringify(result, null, 2));
