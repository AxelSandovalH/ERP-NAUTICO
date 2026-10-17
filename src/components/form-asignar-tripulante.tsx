"use client";
import { useState } from "react";
import { Campo, Input, Select } from "./ui";
import { Formulario } from "./formulario";
import { ROLES_TRIPULANTE } from "@/lib/etiquetas";
import { asignarTripulante } from "@/app/(app)/tripulacion/actions";

type Opcion = { id: string; etiqueta: string; rol: keyof typeof ROLES_TRIPULANTE };

export function FormAsignarTripulante({ reservaId, opciones, horaLlegada }: { reservaId: string; opciones: Opcion[]; horaLlegada: string }) {
  const [rol, setRol] = useState<string>(opciones[0]?.rol ?? "MARINERO");
  if (opciones.length === 0) return <p className="mt-4 text-sm text-muted">No hay tripulantes activos disponibles. Agrégalos en Tripulación.</p>;
  return (
    <Formulario accion={asignarTripulante.bind(null, reservaId)} enviar="Asignar" className="mt-4 grid gap-3 sm:grid-cols-3">
      <Campo etiqueta="Tripulante">
        <Select name="tripulanteId" defaultValue={opciones[0].id} onChange={(e) => { const o = opciones.find((x) => x.id === e.target.value); if (o) setRol(o.rol); }}>
          {opciones.map((o) => <option key={o.id} value={o.id}>{o.etiqueta}</option>)}
        </Select>
      </Campo>
      <Campo etiqueta="Rol en el tour">
        <Select name="rol" value={rol} onChange={(e) => setRol(e.target.value)}>
          {Object.entries(ROLES_TRIPULANTE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </Campo>
      <Campo etiqueta="Hora de llegada"><Input name="horaLlegada" type="time" defaultValue={horaLlegada} /></Campo>
    </Formulario>
  );
}
