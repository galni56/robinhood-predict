import { Outlet } from 'react-router-dom'

/** Every /onchain sub-route shares the global <RealNavbar> (see App.tsx)
 * for navigation, so this layout is just a mount point for the outlet. */
export function OnchainLayout() {
  return <Outlet />
}
