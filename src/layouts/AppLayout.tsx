import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, Link, Navigate } from "react-router";
import {
  LayoutDashboard,
  Plus,
  List,
  SlidersHorizontal,
  Sprout,
  ChartPie,
  Repeat,
  RefreshCw,
  CalendarRange,
} from "lucide-react";
import { prepareOffline } from "../lib/offline";
import { useFinance } from "../providers/FinanceProvider";

const navigation = [
  { to: "", label: "Vue d’ensemble", mobile: "Accueil", icon: LayoutDashboard },
  {
    to: "/add",
    label: "Ajouter une transaction",
    mobile: "Ajouter",
    icon: Plus,
  },
  { to: "/history", label: "Historique", mobile: "Historique", icon: List },
  {
    to: "/budgets",
    label: "Budgets mensuels",
    mobile: "Budgets",
    icon: ChartPie,
  },
  {
    to: "/long-term",
    label: "Budget longue durée",
    mobile: "Longue durée",
    icon: CalendarRange,
  },
  {
    to: "/recurring",
    label: "Dépenses régulières",
    mobile: "Régulières",
    icon: Repeat,
  },
  {
    to: "/settings",
    label: "Paramètres",
    mobile: "Réglages",
    icon: SlidersHorizontal,
  },
];
export default function AppLayout() {
  const { base, demo, loading, syncing, busy, error, refresh, account } =
    useFinance();
  const [offline, setOffline] = useState(!navigator.onLine);
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    void prepareOffline();
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
    if (pathname.endsWith("/add") || pathname.endsWith("/edit")) {
      main.current
        ?.querySelector<HTMLInputElement>("#amount")
        ?.focus({ preventScroll: true });
    } else {
      main.current?.focus({ preventScroll: true });
    }
  }, [pathname]);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Aller au contenu
      </a>
      <aside className="sidebar">
        <Link to={base || "/"} className="brand">
          <span className="brand-symbol">
            m<span>↗</span>
          </span>
          MoneyPilot<span className="brand-dot">.</span>
        </Link>
        <p className="sidebar-label">VOTRE ESPACE BUDGET</p>
        <nav aria-label="Navigation principale">
          {navigation.map(({ to, label, mobile, icon: Icon }) => (
            <NavLink
              key={to}
              end={!to}
              to={base + to || "/"}
              className={({ isActive }) =>
                `nav-link ${isActive ? "active" : ""}`
              }
            >
              <Icon size={20} aria-hidden="true" />
              <span className="desktop-label">{label}</span>
              <span className="mobile-label">{mobile}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <Sprout size={24} />
            <strong>
              Un peu de clarté.
              <br />
              Plus de sérénité.
            </strong>
            <p>
              {demo
                ? "Explorez librement avec des exemples fictifs."
                : "Un budget estimé, sans accès à votre banque."}
            </p>
          </div>
          <div className="version">
            <span className="status-dot" /> MoneyPilot <span>V1</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <div className="topbar">
          <span>Votre budget, en clair.</span>
          <div className="topbar-actions">
            <span className="demo-badge">
              <span className="status-dot" />
              {demo
                ? "Démo · données fictives"
                : syncing
                  ? "Actualisation…"
                  : "Enregistré sur cet appareil"}
            </span>
            {demo ? (
              <Link to="/" className="text-link">
                Mon espace local
              </Link>
            ) : (
              <button
                className="icon-button"
                aria-label="Actualiser les données"
                disabled={busy || syncing}
                onClick={() => void refresh()}
              >
                <RefreshCw size={17} />
              </button>
            )}
          </div>
        </div>
        <main id="main" ref={main} tabIndex={-1}>
          {demo && (
            <p className="demo-notice">
              Démonstration interactive : données fictives, changements
              conservés uniquement jusqu’au rechargement. Aucun compte connecté.
            </p>
          )}
          {offline && (
            <p className="feedback info" role="status">
              Vous êtes hors ligne.{" "}
              {demo
                ? "La démo reste disponible."
                : "La consultation et les enregistrements locaux restent disponibles."}
            </p>
          )}
          {error && (
            <div className="feedback error" role="alert">
              <p>{error}</p>
              <button
                className="button secondary"
                disabled={syncing || busy}
                onClick={() => void refresh()}
              >
                Actualiser les données
              </button>
            </div>
          )}
          {loading ? (
            <p className="empty-state" role="status">
              Chargement de votre espace…
            </p>
          ) : error && !account ? (
            <p className="empty-state">
              Votre budget n’a pas pu être chargé. Réessayez avant de le
              modifier.
            </p>
          ) : !demo &&
            !account &&
            pathname !== "/setup" &&
            pathname !== "/settings" ? (
            <Navigate to="/setup" replace />
          ) : (
            <Outlet />
          )}
        </main>
        <footer>
          {demo
            ? "Données fictives · Démonstration indépendante"
            : "Données locales · Aucune synchronisation · Aucun accès bancaire"}
          <span>MoneyPilot V1</span>
        </footer>
      </div>
    </div>
  );
}
