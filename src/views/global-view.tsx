import { DataTable, InlineMessage } from "@/components/ui/pieces";
import { REGION_FILES, SCHEMA_ROWS } from "@/lib/app-content";
import type { BundleError } from "@/lib/app-types";

export default function GlobalView({ error, retry }: { bundle: unknown; error: BundleError | null; retry: () => void }) {
  return (
    <div className="data-layout">
      <header className="page-heading">
        <h1 id="view-heading">Other river basins</h1>
        <p>RotaNile is demonstrated for the Nile Delta only. It has not been validated in any other basin, and no claim is made that the results would be usable there.</p>
      </header>

      <section className="content-section">
        <h2>What a region pack contains</h2>
        <p>A region pack is the set of inputs that describe one region: points, climate and vegetation snapshots, crop configuration and the source register.</p>
        <div className="tree-block" aria-label="Region pack files">{REGION_FILES.map((path) => <div className="tree-line" key={path}>{path}</div>)}</div>
      </section>

      <section className="content-section">
        <h2>Schemas involved</h2>
        <DataTable headers={["File", "Schema", "What it checks"]} rows={SCHEMA_ROWS.map((row) => [...row])} />
      </section>

      <section className="content-section">
        <h2>What can be replaced</h2>
        <ul>
          <li>The points, climate snapshots and vegetation snapshots.</li>
          <li>Parameters, ranges, units, sources and evidence grades for the five crops.</li>
          <li>Season month lists, rotation rules, assumptions and the source register.</li>
        </ul>
      </section>

      <section className="content-section">
        <h2>What needs an engine change</h2>
        <ul>
          <li>The crop list: wheat, berseem, cotton, maize and rice.</li>
          <li>The winter and summer seasons.</li>
          <li>The climate-variable set and units.</li>
          <li>The three-year, six-season horizon.</li>
        </ul>
      </section>

      <section className="content-section">
        <h2>What to expect</h2>
        <ul>
          <li>A new region will usually have more provisional or unresolved parameters than the Nile Delta pack.</li>
          <li>Every provisional or unresolved parameter needs a recorded assumption.</li>
          <li>Each coordinate must be checked on imagery before release.</li>
        </ul>
      </section>

      {error ? <InlineMessage title="Data bundle not available" detail={error.detail} variant="error"><button className="action-button" onClick={retry}>Try again</button></InlineMessage> : null}
    </div>
  );
}