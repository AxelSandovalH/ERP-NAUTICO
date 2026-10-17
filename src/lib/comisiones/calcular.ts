// Motor de comisiones (puro, sin BD). Todo en centavos enteros; los porcentajes
// van en puntos base (1250 = 12.5 %) para no mezclar flotantes con dinero.

import { dinero } from "@/lib/fechas";

export type TipoTarifa = "FIJO" | "PORCENTAJE" | "PORCENTAJE_BALANCE" | "SIN";

export type Regla = {
  id: string;
  embarcacionId: string | null;
  origen: string | null;
  tipo: TipoTarifa;
  valor: number;
  umbralPax: number | null;
  valorAlto: number | null;
  creadoEn: Date;
};

export type PrecioCasa = {
  precioCasaCentavos: number | null;
  paxIncluidosCasa: number | null;
  extraPaxCasaCentavos: number | null;
};

export type Resultado = { montoCentavos: number; descripcion: string; advertencia?: string };

/** Entre las reglas que aplican a la reserva gana la más específica: coincidir
 *  en origen pesa más que coincidir en embarcación; una regla general (ambos
 *  nulos) es el último recurso. Empates → la más reciente. */
export function elegirRegla(reglas: Regla[], ctx: { embarcacionId: string; origen: string }): Regla | null {
  const aplicables = reglas.filter(
    (r) => (r.origen === null || r.origen === ctx.origen) && (r.embarcacionId === null || r.embarcacionId === ctx.embarcacionId),
  );
  if (aplicables.length === 0) return null;
  const peso = (r: Regla) => (r.origen ? 2 : 0) + (r.embarcacionId ? 1 : 0);
  return [...aplicables].sort((a, b) => peso(b) - peso(a) || b.creadoEn.getTime() - a.creadoEn.getTime() || a.id.localeCompare(b.id))[0];
}

/** Costo base de un tour: precio casa + pasajeros por encima de los incluidos.
 *  null = la embarcación no tiene precio casa configurado. */
export function costoBase(casa: PrecioCasa, pax: number): number | null {
  if (casa.precioCasaCentavos == null) return null;
  const extra = Math.max(0, pax - (casa.paxIncluidosCasa ?? pax));
  return casa.precioCasaCentavos + extra * (casa.extraPaxCasaCentavos ?? 0);
}

const pct = (bp: number) => `${(bp / 100).toLocaleString("es-MX", { maximumFractionDigits: 2 })} %`;

export function calcularComision(
  regla: Regla | null,
  r: { totalCentavos: number; pax: number; casa: PrecioCasa; moneda?: string },
): Resultado {
  if (!regla) return { montoCentavos: 0, descripcion: "Sin tarifa configurada", advertencia: "El beneficiario no tiene una tarifa que aplique a esta reserva" };

  const alto = regla.umbralPax != null && regla.valorAlto != null && r.pax >= regla.umbralPax;
  const valor = alto ? (regla.valorAlto as number) : regla.valor;
  const sufijoPax = alto ? ` (${regla.umbralPax}+ pax)` : "";
  const moneda = r.moneda ?? "MXN";

  switch (regla.tipo) {
    case "SIN":
      return { montoCentavos: 0, descripcion: "Sin comisión" };
    case "FIJO":
      return { montoCentavos: valor, descripcion: `Fijo de ${dinero(valor, moneda)}${sufijoPax}` };
    case "PORCENTAJE":
      return { montoCentavos: Math.round((valor * r.totalCentavos) / 10_000), descripcion: `${pct(valor)} del total${sufijoPax}` };
    case "PORCENTAJE_BALANCE": {
      const base = costoBase(r.casa, r.pax);
      if (base === null)
        return { montoCentavos: 0, descripcion: `${pct(valor)} del balance${sufijoPax}`, advertencia: "La embarcación no tiene precio casa configurado" };
      const balance = r.totalCentavos - base;
      if (balance <= 0)
        return { montoCentavos: 0, descripcion: `${pct(valor)} del balance${sufijoPax}`, advertencia: "La venta no supera el precio casa: sin balance" };
      return { montoCentavos: Math.round((valor * balance) / 10_000), descripcion: `${pct(valor)} del balance${sufijoPax}` };
    }
  }
}

/** Reparte un abono entre comisiones ya ordenadas (las más antiguas primero).
 *  `sobrante` > 0 significa que el abono excede lo pendiente. */
export function repartirAbono(monto: number, comisiones: { id: string; faltante: number }[]) {
  const aplicaciones: { id: string; monto: number }[] = [];
  let resto = monto;
  for (const c of comisiones) {
    if (resto <= 0) break;
    if (c.faltante <= 0) continue;
    const x = Math.min(resto, c.faltante);
    aplicaciones.push({ id: c.id, monto: x });
    resto -= x;
  }
  return { aplicaciones, sobrante: resto };
}

export const periodoDe = (fechaIso: string) => fechaIso.slice(0, 7);
