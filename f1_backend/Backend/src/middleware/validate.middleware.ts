import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

type Target = 'body' | 'query' | 'params';

/**
 * Zod validation middleware factory.
 * Usage: router.post('/', validate(MySchema), handler)
 *        router.get('/',  validate(QuerySchema, 'query'), handler)
 */
export function validate(schema: ZodSchema, target: Target = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      res.status(422).json({
        message: 'Validation error',
        errors:  (result.error as ZodError).flatten().fieldErrors,
      });
      return;
    }
    // Replace the target with the parsed (and coerced) value
    (req as unknown as Record<string, unknown>)[target] = result.data;
    next();
  };
}
