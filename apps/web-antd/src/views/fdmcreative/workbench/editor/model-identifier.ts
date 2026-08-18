import { normalizeCreativeLongId } from './creative-long-id';

/** Backend Long identifiers remain decimal strings all the way back to the API. */
const normalizeModelIdentifier = normalizeCreativeLongId;

export { normalizeModelIdentifier };
