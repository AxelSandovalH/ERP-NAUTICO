// Lector de CSV tolerante (puro). Los bancos mexicanos exportan con coma, punto y coma o tabulador,
// a veces con BOM y con líneas de encabezado antes de la tabla.

export function detectarSeparador(texto: string): string {
  const muestra = texto.split(/\r?\n/).filter((l) => l.trim()).slice(0, 12);
  let mejor = ",", mayor = 0;
  for (const sep of [",", ";", "\t", "|"]) {
    // Se cuentan los separadores fuera de comillas
    const total = muestra.reduce((n, linea) => {
      let dentro = false, c = 0;
      for (const ch of linea) { if (ch === '"') dentro = !dentro; else if (ch === sep && !dentro) c++; }
      return n + c;
    }, 0);
    if (total > mayor) { mayor = total; mejor = sep; }
  }
  return mejor;
}

export function leerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, "");
  const sep = detectarSeparador(t);
  const filas: string[][] = [];
  let fila: string[] = [], campo = "", comillas = false;
  const cerrarCampo = () => { fila.push(campo.trim()); campo = ""; };
  const cerrarFila = () => { cerrarCampo(); if (fila.some((c) => c !== "")) filas.push(fila); fila = []; };
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else comillas = false; }
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) cerrarCampo();
    else if (ch === "\n") cerrarFila();
    else if (ch !== "\r") campo += ch;
  }
  if (campo !== "" || fila.length > 0) cerrarFila();
  return filas;
}
