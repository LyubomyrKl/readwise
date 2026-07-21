export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="relative min-h-svh w-full overflow-hidden">
      {children}
    </section>
  );
}
