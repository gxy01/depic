import type * as models from './models';
import { type User as LocalUser } from './models';
export type { User as PublicUser } from './models';
export interface Config { user: LocalUser }
export type Response = Config | models.Error;
export const handle: (value: Response) => Config = (value: Response): Config => value;
