
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { LangProvider } from "./app/i18n.tsx";

  createRoot(document.getElementById("root")!).render(
    <LangProvider><App /></LangProvider>
  );
  