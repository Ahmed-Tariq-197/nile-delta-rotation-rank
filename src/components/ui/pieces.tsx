import type { ButtonHTMLAttributes, ReactNode } from "react";

import type { CropId, EvidenceGrade, Label } from "@/lib/contract";
import { CROP_LIST } from "@/lib/app-content";

const LABEL_COPY: Record<Label, string> = {
  observed: "Measured or satellite-observed data.",
  modeled: "Output of a model at grid-cell scale.",
  assumed: "Parameter chosen from literature or judgment, not measured here.",
};

const GRADE_COPY: Record<EvidenceGrade, string> = {
  verified: "Value read in an opened source.",
  provisional: "Value not confirmed in an opened source. Treated as an assumption.",
  unresolved: "No value confirmed. The documented fallback is used.",
};

const LABEL_COLORS: Record<Label, string> = {
  observed: "var(--observed)",
  modeled: "var(--modeled)",
  assumed: "var(--assumed)",
};

export function Button({
  children,
  variant = "secondary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "quiet" }) {
  return (
    <button className={`action-button ${variant} ${className}`} type={type} {...props}>
      {children}
    </button>
  );
}

export function CropBadge({ cropId }: { cropId: CropId }) {
  const crop = CROP_LIST.find((item) => item.id === cropId);
  if (!crop) return null;
  return (
    <span className="crop-legend-item" aria-label={`${crop.name} (${crop.letter})`}>
      <span className="crop-chip" style={{ backgroundColor: crop.color }} aria-hidden="true">
        {crop.letter}
      </span>
      {crop.name}
    </span>
  );
}

export function CropCell({ cropId, label }: { cropId: CropId; label: string }) {
  const crop = CROP_LIST.find((item) => item.id === cropId);
  if (!crop) return null;
  return (
    <span
      className="crop-cell"
      style={{ backgroundColor: crop.color }}
      role="img"
      aria-label={`${label}: ${crop.name}`}
    >
      {crop.letter}
    </span>
  );
}

export function LabelChip({ label }: { label: Label }) {
  return (
    <span className="label-chip" title={LABEL_COPY[label]}>
      <span className="label-dot" style={{ backgroundColor: LABEL_COLORS[label] }} aria-hidden="true" />
      {label[0]?.toUpperCase()}{label.slice(1)}
    </span>
  );
}

export function GradeChip({ grade }: { grade: EvidenceGrade }) {
  const symbol = grade === "verified" ? "✓ " : grade === "unresolved" ? "– " : "";
  return (
    <span className={`grade-chip ${grade}`} title={GRADE_COPY[grade]}>
      {symbol}{grade[0]?.toUpperCase()}{grade.slice(1)}
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  unit,
  optional,
  inputId,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  unit?: string;
  optional?: boolean;
  inputId: string;
  children: ReactNode;
}) {
  return (
    <div className="field-block">
      <label className="field-label" htmlFor={inputId}>
        {label}{optional ? " (optional)" : ""}
      </label>
      <div className="number-row">
        {children}
        {unit ? <span className="muted">{unit}</span> : null}
      </div>
      {hint ? <span className="field-hint">{hint}</span> : null}
      <span className="control-error" id={`${inputId}-error`} role={error ? "alert" : undefined}>
        {error ?? ""}
      </span>
    </div>
  );
}

export function InlineMessage({
  title,
  detail,
  variant = "info",
  children,
}: {
  title: string;
  detail?: string;
  variant?: "info" | "warning" | "error";
  children?: ReactNode;
}) {
  return (
    <div className={`inline-message ${variant}`} role={variant === "error" ? "alert" : "status"}>
      <strong>{title}</strong>
      {detail ? <p>{detail}</p> : null}
      {children}
    </div>
  );
}

export function DataTable({
  headers,
  rows,
  caption,
}: {
  headers: readonly string[];
  rows: readonly (readonly ReactNode[])[];
  caption?: string;
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        {caption ? <caption>{caption}</caption> : null}
        <thead>
          <tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${String(row[0] ?? "row")}-${index}`}>
              {row.map((cell, cellIndex) => <td key={`${index}-${cellIndex}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatusLine({ children }: { children: ReactNode }) {
  return <p className="notice-text" role="status">{children}</p>;
}