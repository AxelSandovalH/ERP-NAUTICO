export default function AuthLayout({ children }: { children: React.ReactNode }) {

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-3xl">⚓</div>
          <p className="mt-1 text-lg font-semibold">ERP Náutico</p>
        </div>
        {children}
      </div>
    </main>
  );
}
