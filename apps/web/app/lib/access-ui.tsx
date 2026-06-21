import Link from "next/link";

export function AccessRequired({
  title,
  message,
  href = "/"
}: {
  title: string;
  message: string;
  href?: string;
}) {
  return (
    <main className="shell">
      <section className="panel">
        <p className="eyebrow">Project Autopsy</p>
        <h1>{title}</h1>
        <p className="muted">{message}</p>
        <Link className="action-link" href={href}>
          Back to inspector
        </Link>
      </section>
    </main>
  );
}
