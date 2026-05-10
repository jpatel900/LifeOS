interface EmptyStateProps {
  title: string;
  description?: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div
      style={{
        padding: "1.5rem",
        borderRadius: "0.75rem",
        border: "1px dashed #d1d5db",
        backgroundColor: "#f9fafb",
        color: "#4b5563",
      }}
    >
      <div
        style={{ fontWeight: 500, marginBottom: description ? "0.25rem" : 0 }}
      >
        {title}
      </div>
      {description ? (
        <p style={{ margin: 0, fontSize: "0.9rem" }}>{description}</p>
      ) : null}
    </div>
  );
}
