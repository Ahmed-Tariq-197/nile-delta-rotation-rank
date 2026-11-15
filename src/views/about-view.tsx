import { PageHero } from "@/components/layout";
import type { EngineResponse } from "@/lib/contract";
import { sourceSentence } from "@/lib/data/snapshot-export";
import { formatDate } from "@/lib/format";
import type { ActualBundle } from "@/lib/app-types";

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
      </PageHero>

      <section className="content-section">
        <h2>What it does</h2>
        <p>
          Ranks three-year rotations of wheat, berseem, cotton, maize and rice for five proposed
          Delta points, on water demand, soil health and climate risk.
        </p>
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
