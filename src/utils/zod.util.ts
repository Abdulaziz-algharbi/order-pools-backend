import { z } from 'zod';

// Mongoose ObjectId as sent over the wire (ref fields, :_id params, etc.)
export const objectId = (message = 'Invalid ID') =>
  z.string().regex(/^[0-9a-fA-F]{24}$/, message);
