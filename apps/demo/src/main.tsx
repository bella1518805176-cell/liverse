import { createRoot } from "react-dom/client";
import { PreviewApp } from "../../admin/src/preview";
import { demoLayout } from "../../../fixtures/beijing-demo";
import live from "../../../assets/public/beijing-live.jpg?url";
import balcony from "../../../assets/public/beijing-balcony.jpg?url";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <PreviewApp demoLayout={demoLayout()} images={{ live, balcony }} />,
);
