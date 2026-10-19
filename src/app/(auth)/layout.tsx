import { LogoMarca } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <LogoMarca className="mx-auto h-14 w-auto" titulo="FleetNautic" />
          <p className="mt-2 text-lg font-semibold tracking-tight">FleetNautic</p>
        </div>
        {children}
      </div>
    </main>
  );
}
