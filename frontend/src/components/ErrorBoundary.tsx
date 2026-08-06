import { Component, ReactNode } from "react";

/** Fängt Render-Fehler eines Teilbereichs ab, damit nicht die ganze Seite
 *  weiß wird. Zeigt eine kurze Meldung statt Absturz. */
export default class ErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Für die Diagnose in der Konsole.
    console.error("Bereich abgestürzt:", this.props.label, error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="section" style={{ borderLeft: "3px solid #f87171" }}>
          <strong>{this.props.label || "Dieser Bereich"} konnte nicht geladen werden.</strong>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{String(this.state.error.message || this.state.error)}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
