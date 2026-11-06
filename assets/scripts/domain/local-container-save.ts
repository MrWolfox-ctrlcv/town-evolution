import {
  cloneLocalContainer,
  validateLocalContainer,
  type LocalContainer,
} from './local-container';

/** Absence is handled by the owning save schema, never converted into an empty container here. */
export function parseLocalContainer(value: unknown): LocalContainer {
  validateLocalContainer(value);
  return cloneLocalContainer(value);
}
