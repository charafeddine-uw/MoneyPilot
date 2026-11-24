import { Navigate, Route, Routes } from "react-router";
import { FinanceProvider } from "./providers/FinanceProvider";
import AppLayout from "./layouts/AppLayout";
import Dashboard from "./pages/Dashboard";
import AddTransaction from "./pages/AddTransaction";
import History from "./pages/History";
import Setup from "./pages/Setup";
import Budgets from "./pages/Budgets";
import Recurring from "./pages/Recurring";
import Settings from "./pages/Settings";
import LongTerm from "./pages/LongTerm";
const pageRoutes = (
  <>
    <Route index element={<Dashboard />} />
    <Route path="add" element={<AddTransaction />} />
    <Route path="history" element={<History />} />
    <Route path="transactions/:id" element={<History />} />
    <Route path="transactions/:id/edit" element={<AddTransaction />} />
    <Route path="setup" element={<Setup />} />
    <Route path="settings" element={<Settings />} />
    <Route path="budgets" element={<Budgets />} />
    <Route path="long-term" element={<LongTerm />} />
    <Route path="recurring" element={<Recurring />} />
  </>
);
export default function App() {
  return (
    <Routes>
      <Route
        path="demo"
        element={
          <FinanceProvider key="demo" demo>
            <AppLayout />
          </FinanceProvider>
        }
      >
        {pageRoutes}
      </Route>
      <Route
        path="/"
        element={
          <FinanceProvider key="local">
            <AppLayout />
          </FinanceProvider>
        }
      >
        {pageRoutes}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
