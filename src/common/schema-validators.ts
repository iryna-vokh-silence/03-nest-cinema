import { Types } from 'mongoose';

/** Schema-level validator: the value must be an integer (Mongoose has no built-in one). */
export const integerValidator = {
  validator: (value: number): boolean => Number.isInteger(value),
  message: '{PATH} must be an integer',
};

/** A plain document read with .lean(): schema fields plus the ObjectId _id. */
export type WithId<T> = T & { _id: Types.ObjectId };
