// ship parts catalog (filled in by the parts pass).
import { registerParts } from '../registry';
import type { PartDef } from '../types';

export const SHIP_PARTS: PartDef[] = [];
registerParts(SHIP_PARTS);
