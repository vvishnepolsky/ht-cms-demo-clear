/**
 * Sidebar nav for the demo admin shell — the app is trimmed to the cases
 * flow, so the nav is a single "Cases" item plus the signed-in identity and
 * a sign-out affordance pinned to the bottom.
 */

import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FolderOpen, LogOut } from 'lucide-react';
import { SidebarNavItem, SidebarNavSeparator } from './ui';
import { useSidebarOpen } from './ui/sidebar-nav';
import { setAdmin, useAdmin } from '../lib/auth-store';
import { logout as identityLogout } from '../lib/identity-client';
import { client } from '../lib/apollo';
import { initials } from '../lib/utils';

const CASES_PATH = '/ee/cases';

export function EeSidebarNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const admin = useAdmin();
  const sidebarOpen = useSidebarOpen();
  const [signingOut, setSigningOut] = useState(false);

  const casesActive = pathname === CASES_PATH || pathname.startsWith(`${CASES_PATH}/`);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await identityLogout();
    } catch {
      // best-effort — local state is cleared regardless
    } finally {
      setAdmin(null);
      await client.clearStore().catch(() => undefined);
      setSigningOut(false);
      navigate('/login', { replace: true });
    }
  }

  return (
    <div data-slot="ee-sidebar-nav" className="flex flex-col h-full min-h-0">
      <SidebarNavItem icon={FolderOpen} label="Cases" isActive={casesActive} onClick={() => navigate(CASES_PATH)} />

      <div className="mt-auto">
        <SidebarNavSeparator />
        {admin && (
          <div
            className="flex items-center gap-2 px-2 py-2 min-w-0"
            data-slot="ee-sidebar-identity"
            title={`${admin.firstName} ${admin.lastName} · ${admin.email}`}
          >
            <span
              aria-hidden="true"
              className="w-7 h-7 rounded-full bg-primary/15 text-primary text-[11px] font-semibold flex items-center justify-center flex-shrink-0"
            >
              {initials(admin.firstName, admin.lastName)}
            </span>
            {sidebarOpen && (
              <div className="min-w-0 leading-tight">
                <p className="text-xs font-semibold text-foreground truncate">
                  {admin.firstName} {admin.lastName}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">{admin.email}</p>
              </div>
            )}
          </div>
        )}
        <SidebarNavItem
          icon={LogOut}
          label={signingOut ? 'Signing out…' : 'Sign out'}
          onClick={() => {
            if (!signingOut) void handleSignOut();
          }}
          showTooltip
        />
      </div>
    </div>
  );
}
