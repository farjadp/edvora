import { AssistantDrawer } from '../assistant/AssistantDrawer'
import { drawerProps } from '../../lib/ai/view'

/** E-046 · the assistant drawer in /admin (header action slot; the button itself is fixed-positioned). */
export async function AssistantLauncher() {
  const props = await drawerProps()
  return props ? <AssistantDrawer {...props} /> : null
}
