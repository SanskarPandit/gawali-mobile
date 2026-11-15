import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { homePathFor, useAuth } from '@/lib/auth';
import type { Role } from '@/lib/types';
import { Spinner } from '@/components/ui';
import { Logo } from '@/components/Logo';
import LoginPage from '@/features/auth/LoginPage';
import SignupPage from '@/features/auth/SignupPage';
import CustomerLayout from '@/features/customer/CustomerLayout';
import DairyLayout from '@/features/dairy/DairyLayout';
import DeliveryLayout from '@/features/delivery/DeliveryLayout';
import AdminLayout from '@/features/admin/AdminLayout';

const HomePage = lazy(() => import('@/features/customer/HomePage'));
const ShopPage = lazy(() => import('@/features/customer/ShopPage'));
const PlanPage = lazy(() => import('@/features/customer/PlanPage'));
const WalletPage = lazy(() => import('@/features/customer/WalletPage'));
const AccountPage = lazy(() => import('@/features/customer/AccountPage'));
const BottlesPage = lazy(() => import('@/features/customer/BottlesPage'));

const OverviewPage = lazy(() => import('@/features/dairy/OverviewPage'));
const DispatchPage = lazy(() => import('@/features/dairy/DispatchPage'));
const CustomersPage = lazy(() => import('@/features/dairy/CustomersPage'));
const CatalogPage = lazy(() => import('@/features/dairy/CatalogPage'));
const TeamPage = lazy(() => import('@/features/dairy/TeamPage'));
const QualityPage = lazy(() => import('@/features/dairy/QualityPage'));
const RefundsPage = lazy(() => import('@/features/dairy/RefundsPage'));
const FinancePage = lazy(() => import('@/features/dairy/FinancePage'));
const SettingsPage = lazy(() => import('@/features/dairy/SettingsPage'));

const RoutePage = lazy(() => import('@/features/delivery/RoutePage'));
const AdminPages = () => import('@/features/admin/pages');
const AdminOverviewPage = lazy(() => AdminPages().then((m) => ({ default: m.AdminOverviewPage })));
const AdminDairiesPage = lazy(() => AdminPages().then((m) => ({ default: m.AdminDairiesPage })));
const AdminUsersPage = lazy(() => AdminPages().then((m) => ({ default: m.AdminUsersPage })));
const AdminRefundsPage = lazy(() => AdminPages().then((m) => ({ default: m.AdminRefundsPage })));
const AdminAIPage = lazy(() => AdminPages().then((m) => ({ default: m.AdminAIPage })));
const AdminBroadcastPage = lazy(() => AdminPages().then((m) => ({ default: m.AdminBroadcastPage })));
const AdminSystemPage = lazy(() => AdminPages().then((m) => ({ default: m.AdminSystemPage })));
const HistoryPage = lazy(() => import('@/features/delivery/HistoryPage'));
const PartnerProfilePage = lazy(() => import('@/features/delivery/PartnerProfilePage'));

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <Logo />
      <Spinner />
    </div>
  );
}

function Guard({ role, children }: { role: Role; children: ReactNode }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <Splash />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (user.role !== role) return <Navigate to={homePathFor(user.role)} replace />;
  return <>{children}</>;
}

function Root() {
  const { user, ready } = useAuth();
  if (!ready) return <Splash />;
  return <Navigate to={user ? homePathFor(user.role) : '/login'} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<Splash />}>
      <Routes>
        <Route path="/" element={<Root />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        <Route path="/app" element={<Guard role="customer"><CustomerLayout /></Guard>}>
          <Route index element={<HomePage />} />
          <Route path="shop" element={<ShopPage />} />
          <Route path="plan" element={<PlanPage />} />
          <Route path="wallet" element={<WalletPage />} />
          <Route path="bottles" element={<BottlesPage />} />
          <Route path="account" element={<AccountPage />} />
        </Route>

        <Route path="/console" element={<Guard role="dairy"><DairyLayout /></Guard>}>
          <Route index element={<OverviewPage />} />
          <Route path="dispatch" element={<DispatchPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="quality" element={<QualityPage />} />
          <Route path="refunds" element={<RefundsPage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        <Route path="/route" element={<Guard role="delivery_boy"><DeliveryLayout /></Guard>}>
          <Route index element={<RoutePage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="profile" element={<PartnerProfilePage />} />
        </Route>

        <Route path="/control" element={<Guard role="admin"><AdminLayout /></Guard>}>
          <Route index element={<AdminOverviewPage />} />
          <Route path="dairies" element={<AdminDairiesPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="refunds" element={<AdminRefundsPage />} />
          <Route path="ai" element={<AdminAIPage />} />
          <Route path="broadcast" element={<AdminBroadcastPage />} />
          <Route path="system" element={<AdminSystemPage />} />
        </Route>

        <Route path="*" element={<Root />} />
      </Routes>
    </Suspense>
  );
}
