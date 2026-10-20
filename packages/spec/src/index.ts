/** Version of the Potluck spec format; every spec declares it as `"potluck": 1`. */
export const SPEC_FORMAT_VERSION = 1;

export { canonicalJson, canonicalSpecBytes, specHash } from "./canonical.js";
export {
  IMPLICIT_COLUMNS,
  type ReconcileRule,
  type Spec,
  type SubstrateEventMatch,
  specSchema,
} from "./schema.js";
export { parseSpec, type ValidationResult, validateSpec } from "./validate.js";
