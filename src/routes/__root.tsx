import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useRouter,
} from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#050B1E" },
      { title: "RotaNile: crop rotation planning support for the Nile Delta" },
      {
        name: "description",
        content:
          "Crop rotation planning support for the Nile Delta with clear data sources, evidence grades and limits.",
      },
      {
        property: "og:title",
        content: "RotaNile: crop rotation planning support for the Nile Delta",
      },
      {
        property: "og:description",
        content:
          "Crop rotation planning support for the Nile Delta with clear data sources, evidence grades and limits.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", href: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { rel: "icon", href: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  errorComponent: RootErrorComponent,
  notFoundComponent: RootNotFound,
});

function RootNotFound() {
  return (
    <main className="grid min-h-screen place-content-center gap-4 bg-background px-6 py-12 text-center text-foreground">
      <h1>This page does not exist</h1>
      <p>The address may be mistyped or out of date.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <a className="action-button primary" href="/#/">
          Open the planner
        </a>
      </div>
    </main>
  );
}

function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-content-center gap-4 bg-background px-6 py-12 text-center text-foreground">
      <h1>RotaNile could not open this page</h1>
      <p>This view hit an unexpected problem. Reopen it, or return to the planner.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>Reopen this view</Button>
        <Button variant="secondary" onClick={() => void router.navigate({ to: "/" })}>
          Open planner
        </Button>
      </div>
    </main>
  );
}

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
