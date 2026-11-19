import { createRoot } from "react-dom/client";
import { demoLayout } from "../../fixtures/beijing-demo";
import "../admin/src/style.css";
import { PreviewApp } from "../admin/src/preview";

createRoot(document.getElementById("root")!).render(
  <PreviewApp demoLayout={demoLayout()} guest />,
);
