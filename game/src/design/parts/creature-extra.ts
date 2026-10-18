// Extended creature catalog (filled in by the parts pass). See creature-core.ts for the house style.
import { registerParts } from '../registry';
import type { PartDef } from '../types';

export const CREATURE_EXTRA: PartDef[] = [];
registerParts(CREATURE_EXTRA);
