import { Component } from "react";
import type { ReactNode } from "react";
// Évite d'afficher des totaux inexacts si une donnée dépasse les limites de calcul.
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="auth-shell">
          <section className="panel form-panel">
            <h1>Votre budget n’a pas pu être affiché.</h1>
            <p className="feedback error" role="alert">
              Le chargement ou le calcul a rencontré une erreur. Aucune donnée
              n’a été effacée. Rechargez puis vérifiez vos données et le
              stockage local.
            </p>
            <button
              className="button primary"
              onClick={() => window.location.reload()}
            >
              Recharger
            </button>
          </section>
        </div>
      );
    return this.props.children;
  }
}
