// Categorías con las que arranca cada empresa (editables). Las que llevan `clave` las
// usa el sistema para las conexiones automáticas: no se pueden renombrar sin perderlas.

export type CategoriaBase = { tipo: "GASTO" | "INGRESO"; nombre: string; clave?: string };

export const CATEGORIAS_BASE: CategoriaBase[] = [
  { tipo: "GASTO", nombre: "Combustible" },
  { tipo: "GASTO", nombre: "Mantenimiento y reparaciones" },
  { tipo: "GASTO", nombre: "Nómina", clave: "NOMINA" },
  { tipo: "GASTO", nombre: "Comisiones", clave: "COMISIONES" },
  { tipo: "GASTO", nombre: "Insumos" },
  { tipo: "GASTO", nombre: "Muelle y marina" },
  { tipo: "GASTO", nombre: "Seguros" },
  { tipo: "GASTO", nombre: "Renta" },
  { tipo: "GASTO", nombre: "Publicidad" },
  { tipo: "GASTO", nombre: "Impuestos" },
  { tipo: "GASTO", nombre: "Administrativos" },
  { tipo: "GASTO", nombre: "Otros" },
  { tipo: "INGRESO", nombre: "Reservas", clave: "RESERVAS" },
  { tipo: "INGRESO", nombre: "Extras y propinas" },
  { tipo: "INGRESO", nombre: "Otros ingresos" },
];

export const CLAVES = { NOMINA: "NOMINA", COMISIONES: "COMISIONES", RESERVAS: "RESERVAS" } as const;
