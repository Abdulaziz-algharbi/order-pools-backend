import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

type PayloadType = 'body' | 'query' | 'params';

const validate = (schema: z.ZodType, payloadType: PayloadType = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[payloadType]);

    if (!result.success) {
      const { fieldErrors, formErrors } = z.flattenError(result.error);

      res.status(400).send({
        message: 'Validation Error',
        errors: {
          ...fieldErrors,
          // top-level issues (e.g. unrecognized keys under .strict()) have no
          // field path, so flattenError puts them in formErrors instead
          ...(formErrors.length > 0 ? { _root: formErrors } : {}),
        },
      });
      return;
    }

    req[payloadType] = result.data;
    next();
  };
};

export default validate;
