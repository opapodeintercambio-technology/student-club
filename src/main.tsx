
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { LangProvider } from "./app/i18n.tsx";
  import { ErrorBoundary } from "./app/components/ErrorBoundary.tsx";

  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <LangProvider><App /></LangProvider>
    </ErrorBoundary>
  );
