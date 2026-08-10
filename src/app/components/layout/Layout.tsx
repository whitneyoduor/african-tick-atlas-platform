import { Outlet } from "react-router";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { ErrorBoundary } from "../ErrorBoundary";

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--page-bg)" }}>
      <Header />
      <main className="flex-1">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}
