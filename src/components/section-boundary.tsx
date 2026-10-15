import { Component, type ReactNode } from "react";

/** Se um bloco da página der erro ao desenhar, mostra um aviso só nele em vez de derrubar a página toda. */
export class SectionBoundary extends Component<{ label: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch(error: unknown) { console.error("[secao]", this.props.label, error); }
  override render() {
    if (this.state.failed) return <p className="rounded-lg border border-border bg-card/60 p-3 text-sm text-muted-foreground">Não consegui mostrar “{this.props.label}” agora. O resto da batalha está completo.</p>;
    return this.props.children;
  }
}
