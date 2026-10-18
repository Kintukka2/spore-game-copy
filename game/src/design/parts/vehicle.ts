// vehicle parts catalog (filled in by the parts pass).
import { registerParts } from '../registry';
import type { PartDef } from '../types';

export const VEHICLE_PARTS: PartDef[] = [];
registerParts(VEHICLE_PARTS);
