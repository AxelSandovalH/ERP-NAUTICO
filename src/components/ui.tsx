import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cx("rounded-xl border border-line bg-surface p-5 shadow-sm", className)} {...p} />;
}

export function PageHeader({ titulo, sub, acciones }: { titulo: string; sub?: string; acciones?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {acciones && <div className="flex gap-2">{acciones}</div>}
    </div>
  );
}

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none";
const btnVar = {
  primario: "bg-brand text-brand-fg hover:opacity-90",
  suave: "border border-line bg-surface hover:bg-brand-soft",
  peligro: "border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950",
};

export function Boton({ variante = "primario", className, ...p }: ComponentProps<"button"> & { variante?: keyof typeof btnVar }) {
  return <button className={cx(btnBase, btnVar[variante], className)} {...p} />;
}

export function BotonLink({ variante = "primario", className, ...p }: ComponentProps<typeof Link> & { variante?: keyof typeof btnVar }) {
  return <Link className={cx(btnBase, btnVar[variante], className)} {...p} />;
}

const campo =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40";

export function Campo({ etiqueta, ayuda, children, className }: { etiqueta: string; ayuda?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block text-sm", className)}>
      <span className="mb-1 block font-medium">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-muted">{ayuda}</span>}
    </label>
  );
}

export const Input = (p: ComponentProps<"input">) => <input className={campo} {...p} />;
export const Select = (p: ComponentProps<"select">) => <select className={campo} {...p} />;
export const Textarea = (p: ComponentProps<"textarea">) => <textarea className={cx(campo, "min-h-20")} {...p} />;

const tonos = {
  gris: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  verde: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  ambar: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  rojo: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
  azul: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
};

export function Insignia({ tono = "gris", children }: { tono?: keyof typeof tonos; children: ReactNode }) {
  return <span className={cx("inline-block rounded-full px-2 py-0.5 text-xs font-medium", tonos[tono])}>{children}</span>;
}

export function Vacio({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">{children}</div>;
}

export function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}
export const Th = ({ className, ...p }: ComponentProps<"th">) => (
  <th className={cx("border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted", className)} {...p} />
);
export const Td = ({ className, ...p }: ComponentProps<"td">) => <td className={cx("border-b border-line px-4 py-2.5 last:border-b-0", className)} {...p} />;
