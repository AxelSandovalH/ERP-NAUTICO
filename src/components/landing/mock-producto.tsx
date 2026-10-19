import { CalendarDays, ClipboardList, LayoutDashboard, Receipt, Ship, UsersRound } from "lucide-react";

const SALIDAS = [
  { dia: 2, chip: "Catamarán Luna", tono: "bg-teal-400/90" },
  { dia: 4, chip: "Sunseeker 80", tono: "bg-sky-400/90" },
  { dia: 9, chip: "Velero Brisa", tono: "bg-emerald-400/90" },
  { dia: 11, chip: "Catamarán Luna", tono: "bg-teal-400/90" },
  { dia: 11, chip: "Sunseeker 80", tono: "bg-sky-400/90" },
  { dia: 17, chip: "Velero Brisa", tono: "bg-emerald-400/90" },
  { dia: 23, chip: "Catamarán Luna", tono: "bg-teal-400/90" },
  { dia: 23, chip: "Sunseeker 80", tono: "bg-sky-400/90" },
];

/** Vista estilizada del producto (no es una captura: se dibuja con HTML para que siempre se vea nítida y no envejezca). */
export function MockProducto() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-3xl select-none text-left">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-pato/20 blur-3xl" />
      <div className="overflow-hidden rounded-2xl border border-white/15 bg-[#f5f7fa] shadow-2xl shadow-black/40">
        <div className="flex items-center gap-1.5 border-b border-slate-200 bg-white px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" /><span className="h-2.5 w-2.5 rounded-full bg-slate-300" /><span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="ml-3 rounded-md bg-slate-100 px-3 py-0.5 text-[11px] text-slate-500">fleetnautic.com</span>
        </div>
        <div className="flex">
          <div className="hidden w-14 shrink-0 flex-col items-center gap-4 bg-navy py-4 sm:flex">
            {[LayoutDashboard, CalendarDays, ClipboardList, Ship, UsersRound, Receipt].map((I, i) => (
              <I key={i} className={`h-4 w-4 ${i === 1 ? "text-pato" : "text-slate-400"}`} />
            ))}
          </div>
          <div className="min-w-0 flex-1 p-4 sm:p-5">
            <p className="text-sm font-semibold text-slate-900">Calendario operativo</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[["Salidas hoy", "4"], ["Ventas del mes", "$135,000"], ["Cobrado", "$98,500"]].map(([t, v]) => (
                <div key={t} className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <p className="text-[10px] text-slate-500">{t}</p>
                  <p className="text-sm font-semibold text-slate-900 sm:text-base">{v}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-7 overflow-hidden rounded-lg border border-slate-200 bg-white text-[10px]">
              {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <div key={i} className="border-b border-slate-200 bg-slate-50 py-1 text-center font-medium text-slate-500">{d}</div>)}
              {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => (
                <div key={n} className="h-12 border-b border-r border-slate-100 p-1 last:border-r-0 sm:h-14">
                  <span className={n === 11 ? "rounded-full bg-pato px-1 font-semibold text-navy" : "text-slate-400"}>{n}</span>
                  <div className="mt-0.5 space-y-0.5">
                    {SALIDAS.filter((s) => s.dia === n).map((s, i) => <div key={i} className={`truncate rounded px-1 text-[8px] font-medium leading-3 text-navy ${s.tono}`}>{s.chip}</div>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
