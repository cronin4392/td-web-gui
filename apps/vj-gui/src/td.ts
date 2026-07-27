/**
 * The `createTDClient` factories, shared across the app's components — a
 * factory must be created once per *schema*, not per-component.
 *
 * Two factories for three instances, because a factory is purely compile-time:
 * its components bind to whichever `<Provider>` they render inside, so the two
 * scene instances — same project, same wire names — share one. `SceneClient`
 * rendered under sceneA's provider reads sceneA; the identical markup under
 * sceneB's reads sceneB.
 */

import { createTDClient } from 'td-core';
import type { SceneParams, VjGuiParams } from './td.config';

/** The GUI project: loader selection and the eight loaders' text params. */
export const GuiClient = createTDClient<VjGuiParams>();

/** Both scene projects: performance readouts and the scene video stream. */
export const SceneClient = createTDClient<SceneParams>();

export type VjGuiParamName = keyof VjGuiParams & string;
export type { SceneId, SceneTextParamName } from './td.config';
