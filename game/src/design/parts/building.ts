// building parts catalog (filled in by the parts pass).
import { registerParts } from '../registry';
import type { PartDef } from '../types';

export const BUILDING_PARTS: PartDef[] = [];
registerParts(BUILDING_PARTS);
