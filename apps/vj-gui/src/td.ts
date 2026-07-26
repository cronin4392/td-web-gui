/**
 * One `createTDClient` factory instance shared across the app's components
 * (`App`, `TextField`, …) — the factory must be created once per instance,
 * not per-component.
 */

import { createTDClient } from 'td-core'
import type { VjGuiParams } from './td.config'

export const TDClient = createTDClient<VjGuiParams>()

export type VjGuiParamName = keyof VjGuiParams & string
export type { SceneId, SceneTextParamName } from './td.config'
