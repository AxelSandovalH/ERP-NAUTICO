import { describe, expect, it } from "vitest";
import { MAX_BYTES, nombreSeguro, nuevaRuta, rutaPerteneceA, tipoRealDe, validarArchivo } from "./reglas";
import { crearLimitador } from "@/lib/ia/limite";
import { ESQUEMA_TICKET, normalizarTicket } from "@/lib/ia/ticket";

describe("validación de archivos", () => {
  it("acepta fotos y PDF dentro del límite", () => {
    for (const mime of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) expect(validarArchivo({ mime, tamano: 1000 })).toBeNull();
    expect(validarArchivo({ mime: "image/jpeg", tamano: MAX_BYTES })).toBeNull();
  });
  it("rechaza otros tipos, vacíos y demasiado grandes", () => {
    expect(validarArchivo({ mime: "image/svg+xml", tamano: 100 })).toMatch(/Solo se aceptan/);
    expect(validarArchivo({ mime: "text/html", tamano: 100 })).toMatch(/Solo se aceptan/);
    expect(validarArchivo({ mime: "application/x-msdownload", tamano: 100 })).toMatch(/Solo se aceptan/);
    expect(validarArchivo({ mime: "image/png", tamano: 0 })).toMatch(/vacío/);
    expect(validarArchivo({ mime: "image/png", tamano: MAX_BYTES + 1 })).toMatch(/10 MB/);
  });
});

describe("rutas del bucket", () => {
  it("se construyen bajo la carpeta de la empresa y el gasto", () => {
    expect(nuevaRuta("t1", "g1", "image/jpeg", "abc-123")).toBe("t1/g1/abc-123.jpg");
    expect(nuevaRuta("t1", "g1", "application/pdf", "x")).toBe("t1/g1/x.pdf");
  });
  it("solo reconoce rutas propias, sin escapes", () => {
    expect(rutaPerteneceA("t1/g1/abc-123.jpg", "t1", "g1")).toBe(true);
    expect(rutaPerteneceA("t2/g1/abc.jpg", "t1", "g1")).toBe(false); // otra empresa
    expect(rutaPerteneceA("t1/g2/abc.jpg", "t1", "g1")).toBe(false); // otro gasto
    expect(rutaPerteneceA("t1/g1/../g2/abc.jpg", "t1", "g1")).toBe(false);
    expect(rutaPerteneceA("t1/g1/a/b.jpg", "t1", "g1")).toBe(false);
    expect(rutaPerteneceA("t1/g1/abc.exe", "t1", "g1")).toBe(false);
    expect(rutaPerteneceA("t1/g1/abc.jpg.html", "t1", "g1")).toBe(false);
    expect(rutaPerteneceA("t1//abc.jpg", "t1", "g1")).toBe(false);
    expect(rutaPerteneceA("", "t1", "g1")).toBe(false);
  });
  it("limpia el nombre original", () => {
    expect(nombreSeguro("C:\\Users\\x\\ticket.jpg")).toBe("ticket.jpg");
    expect(nombreSeguro("../../etc/passwd")).toBe("passwd");
    expect(nombreSeguro("a\u0000b.png")).toBe("ab.png");
    expect(nombreSeguro("")).toBe("archivo");
    expect(nombreSeguro("x".repeat(500)).length).toBe(120);
  });
});

describe("tipo real por contenido", () => {
  const bytes = (...n: number[]) => new Uint8Array(n);
  const texto = (t: string) => new Uint8Array([...t].map((c) => c.charCodeAt(0)));
  it("reconoce JPEG, PNG, WebP y PDF por sus primeros bytes", () => {
    expect(tipoRealDe(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe("image/jpeg");
    expect(tipoRealDe(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(tipoRealDe(new Uint8Array([...texto("RIFF"), 0, 0, 0, 0, ...texto("WEBP")]))).toBe("image/webp");
    expect(tipoRealDe(texto("%PDF-1.7\n"))).toBe("application/pdf");
  });
  it("rechaza lo que se disfraza (HTML, ejecutables, SVG) o está vacío", () => {
    expect(tipoRealDe(texto("<html><script>alert(1)</script>"))).toBeNull();
    expect(tipoRealDe(texto('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(tipoRealDe(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull(); // .exe
    expect(tipoRealDe(bytes())).toBeNull();
    expect(tipoRealDe(texto("RIFF....WAVE"))).toBeNull();
  });
});

describe("limitador de uso", () => {
  it("permite hasta el máximo por ventana y después bloquea", () => {
    const l = crearLimitador(3, 1000);
    expect([1, 2, 3, 4].map(() => l.intentar("u", 0))).toEqual([true, true, true, false]);
  });
  it("se libera al pasar la ventana y cuenta cada usuario por separado", () => {
    const l = crearLimitador(1, 1000);
    expect(l.intentar("a", 0)).toBe(true);
    expect(l.intentar("a", 500)).toBe(false);
    expect(l.intentar("b", 500)).toBe(true);
    expect(l.intentar("a", 1001)).toBe(true);
  });
});

describe("normalización del ticket leído", () => {
  const cats = ["Combustible", "Insumos", "Otros"];
  const hoy = "2026-10-17";
  it("acepta una lectura correcta y la deja lista para el formulario", () => {
    const t = normalizarTicket({ esTicket: true, concepto: " Gasolina ", proveedor: "Pemex", montoTotal: 1234.56, moneda: "MXN", fecha: "2026-10-15", categoria: "combustible", rfc: "pem840212xy4" }, cats, hoy);
    expect(t).toEqual({ esTicket: true, concepto: "Gasolina", proveedor: "Pemex", montoCentavos: 123_456, moneda: "MXN", fecha: "2026-10-15", categoria: "Combustible", rfc: "PEM840212XY4" });
  });
  it("descarta lo dudoso en lugar de inventarlo", () => {
    const t = normalizarTicket({ esTicket: true, concepto: "x", montoTotal: -5, moneda: "EUR", fecha: "2099-01-01", categoria: "Yates", rfc: "no es rfc" }, cats, hoy);
    expect(t).toMatchObject({ montoCentavos: null, moneda: null, fecha: null, categoria: null, rfc: null });
    expect(normalizarTicket({ montoTotal: Infinity, fecha: "2026-02-31" }, cats, hoy)).toMatchObject({ montoCentavos: null, fecha: null });
    expect(normalizarTicket({ montoTotal: "100" }, cats, hoy).montoCentavos).toBeNull();
  });
  it("tolera basura y acota los textos", () => {
    expect(normalizarTicket(null, cats, hoy)).toMatchObject({ concepto: "", montoCentavos: null });
    expect(normalizarTicket("hola", cats, hoy).proveedor).toBeNull();
    expect(normalizarTicket({ concepto: "c".repeat(500), proveedor: "p".repeat(500) }, cats, hoy)).toMatchObject({ concepto: "c".repeat(80), proveedor: "p".repeat(120) });
  });
  it("reconoce cuando no es un ticket", () => {
    expect(normalizarTicket({ esTicket: false }, cats, hoy).esTicket).toBe(false);
  });
  it("el esquema pide todos los campos y no admite extras (requisito de la salida estructurada)", () => {
    expect(ESQUEMA_TICKET.additionalProperties).toBe(false);
    expect([...ESQUEMA_TICKET.required].sort()).toEqual(Object.keys(ESQUEMA_TICKET.properties).sort());
  });
});
