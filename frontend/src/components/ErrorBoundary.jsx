// frontend/src/components/ErrorBoundary.jsx
import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("UI error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>Une erreur est survenue dans l’interface.</h2>
          <pre className="pre-wrap">
            {String(this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
