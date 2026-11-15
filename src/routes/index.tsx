import { createFileRoute } from "@tanstack/react-router";

import { RotaNileApp } from "@/components/rotanile-app";

export const Route = createFileRoute("/")({
  component: RotaNileApp,
  head: () => ({
    meta: [
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
  }),
});
