import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import React from "react";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: "monospace", background: "#1a1a2e", color: "#e0e0e0", minHeight: "100vh" }}>
          <h2 style={{ color: "#ff6b6b" }}>React render error caught:</h2>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", color: "#ffd700" }}>
            {this.state.error.message}
          </pre>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: "0.8em", color: "#aaa" }}>
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// Debug: verify root element exists
const rootEl = document.getElementById("root");
console.log("Root element:", rootEl);

createRoot(rootEl!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
