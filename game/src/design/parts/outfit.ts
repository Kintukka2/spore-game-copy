// outfit parts catalog (filled in by the parts pass).
import { registerParts } from '../registry';
import type { PartDef } from '../types';

export const OUTFIT_PARTS: PartDef[] = [];
registerParts(OUTFIT_PARTS);
