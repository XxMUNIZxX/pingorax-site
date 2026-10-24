import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/800.css";
import "./styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
