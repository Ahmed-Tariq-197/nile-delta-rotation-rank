import { PageHero } from "@/components/layout";
import { HeroStats } from "@/components/motion";
import { DataTable, InlineMessage } from "@/components/ui/pieces";
import { REGION_FILES, SCHEMA_ROWS } from "@/lib/app-content";
import type { BundleError } from "@/lib/app-types";

const GROUPS = [
  {
    title: "Replace with data",
    tone: "go",
    items: [
      "Points, climate and vegetation snapshots.",
      "Crop parameters, ranges, units, sources and grades.",
      "Seasons, rotation rules, assumptions and sources.",
    ],
  },
  {
    title: "Needs an engine change",
    tone: "hold",
    items: [
      "The five-crop list.",
      "The winter and summer seasons.",
      "The climate variables and units.",
      "The three-year, six-season horizon.",
    ],
  },
  {
    title: "What to expect",
    tone: "info",
    items: [
      "More provisional or unresolved parameters.",
      "A recorded assumption for each one.",
      "Every coordinate checked on imagery first.",
    ],
  },
];

export default function GlobalView({
  error,
  retry,
}: {
  bundle: unknown;
  error: BundleError | null;
  retry: () => void;
}) {
  return (
    <div className="data-layout">
      <PageHero title="Other river basins">
        <p className="hero-lede">Shown for the Nile Delta only. Not validated anywhere else.</p>
        <HeroStats
          items={[
            { label: "Region pack files", value: REGION_FILES.length },
            { label: "Schemas", value: SCHEMA_ROWS.length },
            { label: "Validated basins", value: 0 },
          ]}
        />
      </PageHero>

      <section className="content-section">
        <h2>What a region pack contains</h2>
        <div className="tree-block" aria-label="Region pack files">
          {REGION_FILES.map((path) => (
            <div className="tree-line" key={path}>
              {path}
            </div>
          ))}
        </div>
      </section>

      <section className="content-section">
        <h2>Schemas involved</h2>
        <DataTable
          headers={["File", "Schema", "What it checks"]}
          rows={SCHEMA_ROWS.map((row) => [...row])}
        />
      </section>

      <section className="content-section">
        <h2>Adapting to another basin</h2>
        <div className="card-grid">
          {GROUPS.map((group) => (
            <article className={`feature-card tone-${group.tone}`} key={group.title}>
              <h3>{group.title}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {error ? (
        <InlineMessage title="Data not available yet" detail={error.detail} variant="error">
          <button className="action-button quiet" onClick={retry}>
            Retry now
          </button>
        </InlineMessage>
      ) : null}
    </div>
  );
}
