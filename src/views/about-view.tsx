import { PageHero } from "@/components/layout";
import { HeroStats } from "@/components/motion";
import { CROP_LIST } from "@/lib/app-content";
import type { EngineResponse } from "@/lib/contract";
import { sourceSentence } from "@/lib/data/snapshot-export";
import { formatDate } from "@/lib/format";
import type { ActualBundle } from "@/lib/app-types";

const CRITERIA = [
  {
    title: "Water demand",
    text: "Crop water use over six seasons, from NASA climate data.",
    icon: "M12 3c3 4.2 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 3-6.8 6-11Z",
  },
  {
    title: "Soil health",
    text: "Legumes, nitrogen balance and how often a crop repeats.",
    icon: "M5 19c0-7 5-12 14-13-1 9-6 14-13 14M5 19l7-7",
  },
  {
    title: "Climate risk",
    text: "Heat exposure during sensitive crop stages.",
    icon: "M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  },
];

export default function AboutView({
  bundle,
  response,
  retrievedAt,
}: {
  bundle: ActualBundle | null;
  response: EngineResponse | null;
  retrievedAt: string | null;
}) {
  return (
    <div className="data-layout">
      <PageHero title="About RotaNile">
        <p className="hero-lede">
          Crop-rotation planning support for the Nile Delta, built by Nile Orbit Lab from NASA
          satellite and model data.
        </p>
        <HeroStats
          items={[
            { label: "Delta points", value: bundle?.points.points.length ?? 5 },
            { label: "Crops", value: CROP_LIST.length },
            { label: "Seasons per plan", value: 6 },
            { label: "Criteria", value: CRITERIA.length },
          ]}
        />
      </PageHero>

      <section className="content-section">
        <h2>What it ranks</h2>
        <div className="card-grid">
          {CRITERIA.map((item) => (
            <article className="feature-card" key={item.title}>
              <svg viewBox="0 0 24 24" className="feature-icon" aria-hidden="true">
                <path d={item.icon} />
              </svg>
              <h3>{item.title}</h3>
              <p className="muted">{item.text}</p>
            </article>
          ))}
        </div>
        <div className="crop-row" aria-label="Crops in the rotation">
          {CROP_LIST.map((crop) => (
            <span className="crop-pill" key={crop.id}>
              <span className="crop-chip" style={{ backgroundColor: crop.color }}>
                {crop.letter}
              </span>
              {crop.name}
              <span className="muted">{crop.season}</span>
            </span>
          ))}
        </div>
      </section>

      <section className="content-section">
        <h2>What it does not do</h2>
        <ul className="tick-list">
          <li>Forecast yields, weather, income or costs.</li>
          <li>Use real-time data. Data are the latest available at retrieval.</li>
          <li>
            Claim validation. Real-world validation was not performed and no outside review took
            place.
          </li>
          <li>Cover places outside the Nile Delta.</li>
        </ul>
      </section>

      <section className="content-section">
        <h2>Data version</h2>
        <p>
          Latest available data through{" "}
          {bundle?.manifest.data.end_date
            ? formatDate(bundle.manifest.data.end_date)
            : "date not loaded"}
          . Engine {response?.engine_version ?? "1.1.0"}.
        </p>
        {bundle ? <p className="muted">{sourceSentence(bundle, retrievedAt)}</p> : null}
      </section>
    </div>
  );
}
