"use client";
import { useMemo, useState } from "react";
import { Formulario, type EstadoForm } from "./formulario";
import { Campo, Input, Select, Tabla, Td, Th } from "./ui";
import { leerCsv } from "@/lib/conciliacion/csv";
import { aplicarMapeo, detectarEncabezado, detectarMapeo, type Mapeo } from "@/lib/conciliacion/importar";
import { dinero } from "@/lib/fechas";

type Accion = (prev: EstadoForm, fd: FormData) => Promise<EstadoForm>;
const MAX_LINEAS = 5000;

/** Celdas de Excel a texto: fechas como YYYY-MM-DD (Excel las guarda en UTC) y decimales con dos lugares. */
function aTexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v).trim();
}

async function leerArchivo(archivo: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(archivo.name)) {
    const { readSheet } = await import("read-excel-file/browser");
    return (await readSheet(archivo)).map((fila) => fila.map(aTexto));
  }
  if (/\.xls$/i.test(archivo.name)) throw new Error("Los .xls antiguos no se pueden leer: en Excel usa «Guardar como» y elige CSV o .xlsx.");
  const bytes = await archivo.arrayBuffer();
  // Muchos bancos exportan en Windows-1252; si no es UTF-8 válido se lee así para no romper los acentos
  let texto: string;
  try { texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { texto = new TextDecoder("windows-1252").decode(bytes); }
  return leerCsv(texto);
}

export function ImportarEstadoCuenta({ accion, mapeoGuardado, moneda }: { accion: Accion; mapeoGuardado: Mapeo | null; moneda: string }) {
  const [nombre, setNombre] = useState("");
  const [filas, setFilas] = useState<string[][] | null>(null);
  const [encabezado, setEncabezado] = useState(1);
  const [mapeo, setMapeo] = useState<Mapeo | null>(null);
  const [error, setError] = useState("");

  async function elegir(archivo: File | undefined) {
    setError(""); setFilas(null); setMapeo(null);
    if (!archivo) return;
    if (archivo.size > 3_000_000) { setError("El archivo pesa más de 3 MB."); return; }
    try {
      const f = await leerArchivo(archivo);
      if (f.length < 2) { setError("El archivo no tiene movimientos."); return; }
      const h = detectarEncabezado(f);
      const detectado = detectarMapeo(f[h]);
      const columnas = f[h].length;
      // Si esta cuenta ya se importó antes, se reutiliza el mapeo mientras sus columnas sigan existiendo
      const guardado = mapeoGuardado && [mapeoGuardado.fecha, mapeoGuardado.descripcion, mapeoGuardado.monto, mapeoGuardado.cargo, mapeoGuardado.abono].every((i) => i === null || i < columnas) ? mapeoGuardado : null;
      setNombre(archivo.name); setFilas(f); setEncabezado(h + 1); setMapeo(guardado ?? detectado);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    }
  }

  const resultado = useMemo(() => {
    if (!filas || !mapeo) return null;
    return aplicarMapeo(filas.slice(encabezado), mapeo, encabezado + 1);
  }, [filas, mapeo, encabezado]);

  const columnas = filas ? Math.max(...filas.slice(0, 50).map((f) => f.length)) : 0;
  const nombresColumnas = filas ? Array.from({ length: columnas }, (_, i) => `${i + 1}. ${filas[encabezado - 1]?.[i] || "(sin título)"}`) : [];
  const set = (c: Partial<Mapeo>) => setMapeo((m) => (m ? { ...m, ...c } : m));
  const col = (nombreCampo: keyof Mapeo, etiqueta: string, opcional = false) => (
    <Campo etiqueta={etiqueta}>
      <Select value={mapeo?.[nombreCampo] === null ? "" : String(mapeo?.[nombreCampo] ?? "")} onChange={(e) => set({ [nombreCampo]: e.target.value === "" ? null : Number(e.target.value) } as Partial<Mapeo>)}>
        {opcional && <option value="">(ninguna)</option>}
        {nombresColumnas.map((n, i) => <option key={i} value={i}>{n}</option>)}
      </Select>
    </Campo>
  );

  const total = resultado?.lineas.length ?? 0;
  const sumaEntradas = resultado?.lineas.filter((l) => l.montoCentavos > 0).reduce((n, l) => n + l.montoCentavos, 0) ?? 0;
  const sumaSalidas = resultado?.lineas.filter((l) => l.montoCentavos < 0).reduce((n, l) => n + l.montoCentavos, 0) ?? 0;

  return (
    <div className="space-y-4">
      <Campo etiqueta="Estado de cuenta (CSV o Excel .xlsx)" ayuda="Descárgalo de la banca en línea. Máximo 5,000 movimientos y 3 MB por archivo. Subir dos veces el mismo no duplica nada.">
        <Input type="file" accept=".csv,.txt,.xlsx" onChange={(e) => elegir(e.target.files?.[0])} />
      </Campo>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}

      {filas && mapeo && resultado && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo etiqueta="Fila de encabezados"><Input type="number" min={1} max={Math.min(filas.length - 1, 50)} value={encabezado} onChange={(e) => { const n = Math.max(1, Number(e.target.value) || 1); setEncabezado(n); if (filas[n - 1]) setMapeo({ ...detectarMapeo(filas[n - 1]), invertir: mapeo.invertir, ordenFecha: mapeo.ordenFecha }); }} /></Campo>
            {col("fecha", "Columna de fecha")}
            {col("descripcion", "Columna de descripción")}
            <Campo etiqueta="Los importes vienen en">
              <Select value={mapeo.modo} onChange={(e) => set({ modo: e.target.value as Mapeo["modo"], monto: mapeo.monto ?? 0, cargo: mapeo.cargo ?? 0, abono: mapeo.abono ?? Math.min(1, columnas - 1) })}>
                <option value="unico">Una columna (− sale, + entra)</option>
                <option value="separado">Dos columnas (cargos y abonos)</option>
              </Select>
            </Campo>
            {mapeo.modo === "unico" ? col("monto", "Columna de importe") : <>{col("cargo", "Columna de cargos")}{col("abono", "Columna de abonos")}</>}
            {col("saldo", "Columna de saldo", true)}
            {col("referencia", "Columna de referencia", true)}
            <Campo etiqueta="Orden de las fechas ambiguas">
              <Select value={mapeo.ordenFecha} onChange={(e) => set({ ordenFecha: e.target.value as Mapeo["ordenFecha"] })}>
                <option value="dmy">Día/mes/año (México)</option>
                <option value="mdy">Mes/día/año</option>
              </Select>
            </Campo>
            <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={mapeo.invertir} onChange={(e) => set({ invertir: e.target.checked })} /> Invertir signos (tarjetas de crédito)</label>
          </div>

          <p className="text-sm">
            <strong>{total}</strong> movimiento{total === 1 ? "" : "s"} leído{total === 1 ? "" : "s"}: entradas {dinero(sumaEntradas, moneda)}, salidas {dinero(Math.abs(sumaSalidas), moneda)}.
            {resultado.errores.length > 0 && <span className="text-amber-700 dark:text-amber-300"> {resultado.errores.length} fila{resultado.errores.length === 1 ? "" : "s"} no se pudo{resultado.errores.length === 1 ? "" : "n"} leer (p. ej. fila {resultado.errores[0].fila}: {resultado.errores[0].motivo}).</span>}
          </p>
          {total > 0 && (
            <Tabla>
              <thead><tr><Th>Fecha</Th><Th>Descripción</Th><Th>Importe</Th><Th>Saldo</Th></tr></thead>
              <tbody>
                {resultado.lineas.slice(0, 6).map((l, i) => (
                  <tr key={i}><Td>{l.fecha}</Td><Td>{l.descripcion}</Td><Td className={l.montoCentavos < 0 ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}>{dinero(l.montoCentavos, moneda)}</Td><Td>{l.saldoCentavos === null ? "—" : dinero(l.saldoCentavos, moneda)}</Td></tr>
                ))}
              </tbody>
            </Tabla>
          )}
          {total > MAX_LINEAS ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">El archivo tiene más de {MAX_LINEAS} movimientos: divídelo por periodos.</p>
          ) : total > 0 ? (
            <Formulario accion={accion} enviar={`Importar ${total} movimiento${total === 1 ? "" : "s"}`}>
              <input type="hidden" name="datos" value={JSON.stringify({ archivo: nombre, mapeo, lineas: resultado.lineas })} />
            </Formulario>
          ) : <p className="text-sm text-muted">Ajusta las columnas hasta que se lean los movimientos.</p>}
        </>
      )}
    </div>
  );
}
