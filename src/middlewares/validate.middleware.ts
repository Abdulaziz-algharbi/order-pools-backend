import { validateRequest } from 'zod-express-middleware';
// import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

type PayloadType = 'body' | 'query' | 'params';

const validate = (schema: z.ZodType, payloadType: PayloadType = 'body') => {
  return validateRequest({ [payloadType]: schema });
  // return (req: Request, res: Response, next: NextFunction) => {
  //   const result = schema.safeParse(req[payloadType]);

  //   if (!result.success) {
  //     return res.status(400).json({
  //       message: 'Validation Error',
  //       errors: z.treeifyError(result.error),
  //     });
  //   }

  //   req.body = result.data;

  //   next();
  // };
};

export default validate;
