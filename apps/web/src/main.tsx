import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router';
import { ApiError } from './api/client';
import { useMe } from './api/hooks';
import { ConfirmProvider, ToastProvider } from './components/feedback';
import { Layout } from './components/Layout';
import './index.css';
import { AdminPage } from './pages/Admin';
import { InvitePage, LoginPage } from './pages/auth';
import { DashboardPage } from './pages/Dashboard';
import { FocusPage } from './pages/Focus';
import { GraphPage } from './pages/Graph';
import { InboxPage } from './pages/Inbox';
import { NotesPage, SearchPage, TrashPage } from './pages/lists';
import { SettingsPage } from './pages/Settings';
import { GoalsPage, ProjectsPage } from './pages/structure';
import { BacklogPage, BlockedPage, TodayPage, UpcomingPage } from './pages/views';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

// A request that comes back 401 means the session expired: send the user to login.
queryClient.getQueryCache().subscribe((event) => {
  const err = event.query.state.error;
  if (err instanceof ApiError && err.status === 401 && event.query.queryKey[0] !== 'me') {
    queryClient.setQueryData(['me'], null);
  }
});

function RequireAuth() {
  const { data: me, isLoading } = useMe();
  const location = useLocation();
  if (isLoading) return null;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/invite/:token', element: <InvitePage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'inbox', element: <InboxPage /> },
          { path: 'today', element: <TodayPage /> },
          { path: 'upcoming', element: <UpcomingPage /> },
          { path: 'blocked', element: <BlockedPage /> },
          { path: 'backlog', element: <BacklogPage /> },
          { path: 'projects', element: <ProjectsPage /> },
          { path: 'goals', element: <GoalsPage /> },
          { path: 'graph', element: <GraphPage /> },
          { path: 'notes', element: <NotesPage /> },
          { path: 'trash', element: <TrashPage /> },
          { path: 'search', element: <SearchPage /> },
          { path: 'focus/:id', element: <FocusPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'admin', element: <AdminPage /> },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
