// Unicode prefix: 中文😀
import * as api from './source';
export { original as renamed } from './source';
export * as namespace from './source';
export const consumer = () => {
  return api['fetch']();
};
