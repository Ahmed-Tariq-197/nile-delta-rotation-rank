import type { EngineResponse } from "@/lib/contract";
import { sourceSentence } from "@/components/data-status";
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
      <header className="page-heading">
        <h1 id="view-heading">About RotaNile</h1>
      </header>

      <section className="content-section">
        <p>RotaNile is built by Nile Orbit Lab.</p>
        <p>
          It is an entry to a space-applications competition, using satellite-derived and model data
          to support crop-rotation planning in the Nile Delta.
        </p>
        <p>
          For five proposed points in the Delta, it combines daily climate snapshots, vegetation
          composites and a crop configuration with graded evidence. A deterministic engine, run in
          the browser, ranks three-year rotations of five crops on water demand, soil health and
          climate risk, and every number carries a label and an evidence grade.
        </p>
      </section>

      <section className="content-section">
        <h2>What it does not do</h2>
        <ul>
          <li>It does not forecast yields or weather.</li>
          <li>It does not model income or costs.</li>
          <li>It has not been validated against field trials or reviewed by anyone outside the team.</li>
          <li>It is demonstrated for the Nile Delta only.</li>
          <li>
            It does not use real-time data; the data are the latest available at retrieval.
          </li>
        </ul>
      </section>

      <section className="content-section">
        <h2>Data version</h2>
        <p>
          Bundle {bundle?.manifest.bundle_version ?? "not supplied"}. Engine{" "}
          {response?.engine_version ?? "not supplied"}. Latest available data through{" "}
          {bundle?.manifest.data.end_date
            ? formatDate(bundle.manifest.data.end_date)
            : "date not supplied"}
          .
        </p>
        {bundle ? <p>Data source: {sourceSentence(bundle, retrievedAt)}</p> : null}
      </section>
    </div>
  );
}
