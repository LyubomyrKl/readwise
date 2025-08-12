export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section style={{ maxWidth: 420, margin: "64px auto", padding: 24 }}>
      {children}
    </section>
  );
}
