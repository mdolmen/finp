import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";
import { AppLayout } from "./components/AppLayout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toaster } from "./components/ui/sonner";
import {
  AutomatisationsPage,
  BilanPage,
  CategoriesPage,
  ComptesPage,
  OperationsPage,
  ReglesPage,
} from "./pages";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
    <Toaster richColors position="bottom-right" />
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/bilan" replace />} />
          <Route path="/bilan" element={<BilanPage />} />
          <Route path="/operations" element={<OperationsPage />} />
          <Route path="/automatisations" element={<AutomatisationsPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/regles" element={<ReglesPage />} />
          <Route path="/comptes" element={<ComptesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
