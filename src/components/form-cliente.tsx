import { Campo, Input, Textarea } from "./ui";

type Valores = {
  nombre?: string; email?: string | null; telefono?: string | null; notas?: string | null;
  rfc?: string | null; razonSocialFiscal?: string | null; regimenFiscal?: string | null; codigoPostalFiscal?: string | null; usoCfdi?: string | null; correoFactura?: string | null;
};

export function CamposCliente({ v = {}, conFiscal = false }: { v?: Valores; conFiscal?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Nombre"><Input name="nombre" defaultValue={v.nombre} required /></Campo>
      <Campo etiqueta="Teléfono"><Input name="telefono" type="tel" defaultValue={v.telefono ?? ""} /></Campo>
      <Campo etiqueta="Correo" className="sm:col-span-2"><Input name="email" type="email" defaultValue={v.email ?? ""} /></Campo>
      <Campo etiqueta="Notas" className="sm:col-span-2"><Textarea name="notas" defaultValue={v.notas ?? ""} /></Campo>
      {conFiscal && (
        <fieldset className="grid gap-4 border-t border-line pt-4 sm:col-span-2 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-semibold">Datos fiscales (para facturar)</legend>
          <p className="text-xs text-muted sm:col-span-2">Tal como aparecen en la constancia de situación fiscal del cliente. Son opcionales hasta que se le facture.</p>
          <Campo etiqueta="RFC"><Input name="rfc" defaultValue={v.rfc ?? ""} maxLength={13} className="uppercase" autoComplete="off" /></Campo>
          <Campo etiqueta="Razón social"><Input name="razonSocialFiscal" defaultValue={v.razonSocialFiscal ?? ""} /></Campo>
          <Campo etiqueta="Régimen fiscal" ayuda="3 dígitos: 601, 612, 616…"><Input name="regimenFiscal" defaultValue={v.regimenFiscal ?? ""} inputMode="numeric" maxLength={3} /></Campo>
          <Campo etiqueta="Código postal fiscal"><Input name="codigoPostalFiscal" defaultValue={v.codigoPostalFiscal ?? ""} inputMode="numeric" maxLength={5} /></Campo>
          <Campo etiqueta="Uso del CFDI" ayuda="G03 gastos en general, S01 sin efectos fiscales…"><Input name="usoCfdi" defaultValue={v.usoCfdi ?? ""} maxLength={3} className="uppercase" /></Campo>
          <Campo etiqueta="Correo para la factura"><Input name="correoFactura" type="email" defaultValue={v.correoFactura ?? ""} /></Campo>
        </fieldset>
      )}
    </div>
  );
}
