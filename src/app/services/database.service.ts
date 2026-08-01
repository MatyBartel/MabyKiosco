import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type TipoVenta = 'unidad' | 'kg';

export interface Producto {
  id?: number;
  codigo: string;
  codigoBarras?: string;
  nombre: string;
  descripcion: string;
  precioCosto: number;
  porcentajeGanancia: number;
  precio: number;
  tipoVenta: TipoVenta;
  stock: number;
  stockMinimo: number;
  categoria: string;
  proveedor: string;
  fechaCreacion: Date;
}

export interface Venta {
  id?: number;
  numeroTicket: string;
  fecha: Date;
  productos: VentaProducto[];
  total: number;
  redondeo?: number;
  totalManual?: number;
  descuentoPct?: number;
  descuentoMonto?: number;
  metodoPago: string;
  pagos?: PagoVenta[];
  cliente?: string;
  vendedor: string;
  vuelto?: number;
}

export interface VentaProducto {
  productoId: number;
  codigo: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface PagoVenta {
  metodo: string;
  monto: number;
  referencia?: string;
}

export interface ItemListaProveedor {
  codigo: string;
  nombre: string;
  precio: number;
}

export interface ListaPreciosProveedor {
  id: number;
  proveedorId: number;
  nombreArchivo: string;
  fechaCarga: Date;
  items: ItemListaProveedor[];
}

export interface Proveedor {
  id: number;
  nombre: string;
  ubicacion: string;
  descripcion: string;
  listas: ListaPreciosProveedor[];
}

export interface PedidoItemProveedor {
  codigo: string;
  nombre: string;
  precio: number;
  cantidad: number;
  subtotal: number;
}

export interface PedidoProveedor {
  id: number;
  proveedorId: number;
  fecha: Date;
  items: PedidoItemProveedor[];
  total: number;
  entregado: boolean;
  pagado: boolean;
}

export interface Gasto {
  id?: number;
  fecha: Date;
  descripcion: string;
  categoria: string;
  monto: number;
}

/** Solo para migrar instalaciones que guardaron la lista inicial fija. */
const CATEGORIAS_GASTO_LEGACY = [
  'Alquiler',
  'Servicios',
  'Sueldos',
  'Mercadería',
  'Mantenimiento',
  'Impuestos',
  'Otros'
];

@Injectable({
  providedIn: 'root'
})
export class DatabaseService {
  private productosSubject = new BehaviorSubject<Producto[]>([]);
  private ventasSubject = new BehaviorSubject<Venta[]>([]);
  private categoriasSubject = new BehaviorSubject<string[]>([]);
  private proveedoresListaSubject = new BehaviorSubject<string[]>([]);
  private vendedoresSubject = new BehaviorSubject<string[]>([]);
  private proveedoresSubject = new BehaviorSubject<Proveedor[]>([]);
  private pedidosSubject = new BehaviorSubject<PedidoProveedor[]>([]);
  private gastosSubject = new BehaviorSubject<Gasto[]>([]);
  private categoriasGastoSubject = new BehaviorSubject<string[]>([]);

  productos$ = this.productosSubject.asObservable();
  ventas$ = this.ventasSubject.asObservable();
  categorias$ = this.categoriasSubject.asObservable();
  proveedoresLista$ = this.proveedoresListaSubject.asObservable();
  vendedores$ = this.vendedoresSubject.asObservable();
  proveedores$ = this.proveedoresSubject.asObservable();
  pedidos$ = this.pedidosSubject.asObservable();
  gastos$ = this.gastosSubject.asObservable();
  categoriasGasto$ = this.categoriasGastoSubject.asObservable();

  constructor() {
    this.inicializarBaseDatos();
  }

  private inicializarBaseDatos(): void {
    const electronAPI: any = (typeof window !== 'undefined') ? (window as any).electronAPI : null;
    if (electronAPI?.kvGet) {
      this.cargarDesdeSqlite();
      return;
    }
    this.inicializarEjemplo();
  }

  private async cargarDesdeSqlite(): Promise<void> {
    try {
      const electronAPI: any = (window as any)?.electronAPI;
      if (!electronAPI || typeof electronAPI.kvGet !== 'function') {
        this.inicializarEjemplo();
        return;
      }
      const productosRaw = JSON.parse((await electronAPI.kvGet('productos')) || '[]');
      const productos = productosRaw.map((p: any) => this.normalizarProducto(p));
      const ventasRaw = JSON.parse((await electronAPI.kvGet('ventas')) || '[]');
      const ventas = this.normalizarVentas(ventasRaw);
      const categorias = JSON.parse((await electronAPI.kvGet('categorias')) || '[]');
      const proveedoresListaRaw = JSON.parse((await electronAPI.kvGet('proveedoresLista')) || 'null');
      const vendedores = JSON.parse((await electronAPI.kvGet('vendedores')) || '[]');
      const proveedores = JSON.parse((await electronAPI.kvGet('proveedores')) || '[]');
      const pedidos = JSON.parse((await electronAPI.kvGet('pedidos')) || '[]');
      const gastos = JSON.parse((await electronAPI.kvGet('gastos')) || '[]');
      const categoriasGastoRaw = JSON.parse((await electronAPI.kvGet('categoriasGasto')) || 'null');

      productos.forEach((p: any) => p.fechaCreacion && (p.fechaCreacion = new Date(p.fechaCreacion)));
      ventas.forEach((v: any) => v.fecha && (v.fecha = new Date(v.fecha)));
      pedidos.forEach((p: any) => p.fecha && (p.fecha = new Date(p.fecha)));
      gastos.forEach((g: any) => g.fecha && (g.fecha = new Date(g.fecha)));

      this.productosSubject.next(productos);
      this.ventasSubject.next(ventas);
      this.categoriasSubject.next(categorias);
      const proveedoresLista = this.resolverProveedoresLista(
        Array.isArray(proveedoresListaRaw) ? proveedoresListaRaw : [],
        productos,
        proveedores
      );
      this.proveedoresListaSubject.next(proveedoresLista);
      if (this.debePersistirProveedoresLista(proveedoresListaRaw, proveedoresLista)) {
        this.persistirProveedoresLista();
      }
      this.vendedoresSubject.next(vendedores.length ? vendedores : ['Vendedor 1']);
      this.proveedoresSubject.next(proveedores);
      this.pedidosSubject.next(pedidos);
      this.gastosSubject.next(gastos);
      const categoriasGasto = this.resolverCategoriasGasto(
        Array.isArray(categoriasGastoRaw) ? categoriasGastoRaw : [],
        gastos
      );
      this.categoriasGastoSubject.next(categoriasGasto);
      if (this.debePersistirCategoriasGasto(categoriasGastoRaw, categoriasGasto)) {
        this.persistirCategoriasGasto();
      }
      if (productosRaw.some((p: any) => this.necesitaMigracion(p) || p?.tipoVenta === 'litro')) {
        this.persistirProductos();
      }
      if (ventasRaw.some((v: any) => !Number(v?.id) || Number(v.id) <= 0)) {
        this.persistirVentas();
      }
    } catch { this.inicializarEjemplo(); }
  }

  private necesitaMigracion(p: any): boolean {
    return p.precioCosto == null || p.porcentajeGanancia == null || !p.tipoVenta;
  }

  private normalizarProducto(raw: any): Producto {
    const attrs = raw?.caracteristicas || {};
    const costoAttr = Number(String(attrs.precioCosto ?? '').replace(',', '.'));
    const pctAttr = Number(String(attrs.gananciaPct ?? '').replace(',', '.'));
    const precio = Number(raw?.precio) || 0;

    let precioCosto = Number(raw?.precioCosto);
    if (!isFinite(precioCosto) || precioCosto < 0) {
      precioCosto = isFinite(costoAttr) && costoAttr >= 0 ? costoAttr : precio;
    }

    let porcentajeGanancia = Number(raw?.porcentajeGanancia);
    if (!isFinite(porcentajeGanancia)) {
      if (isFinite(pctAttr)) {
        porcentajeGanancia = pctAttr;
      } else if (precioCosto > 0 && precio > 0) {
        porcentajeGanancia = Number((((precio / precioCosto) - 1) * 100).toFixed(2));
      } else {
        porcentajeGanancia = 0;
      }
    }

    const tipoVenta: TipoVenta = raw?.tipoVenta === 'kg' ? 'kg' : 'unidad';

    return {
      id: raw?.id,
      codigo: String(raw?.codigo || '').trim(),
      codigoBarras: raw?.codigoBarras ? String(raw.codigoBarras).trim() : undefined,
      nombre: String(raw?.nombre || '').trim(),
      descripcion: String(raw?.descripcion || '').trim(),
      precioCosto,
      porcentajeGanancia,
      precio: precio > 0 ? precio : Number((precioCosto * (1 + porcentajeGanancia / 100)).toFixed(2)),
      tipoVenta,
      stock: Number(raw?.stock) || 0,
      stockMinimo: Number(raw?.stockMinimo) || 0,
      categoria: String(raw?.categoria || '').trim(),
      proveedor: String(raw?.proveedor || '').trim(),
      fechaCreacion: raw?.fechaCreacion ? new Date(raw.fechaCreacion) : new Date()
    };
  }

  private normalizarVentas(rawVentas: any[]): Venta[] {
    let maxId = 0;
    const ventas = (Array.isArray(rawVentas) ? rawVentas : []).map(raw => {
      const idNum = Number(raw?.id);
      const id = Number.isFinite(idNum) && idNum > 0 ? idNum : 0;
      if (id > maxId) maxId = id;
      return {
        ...raw,
        id,
        fecha: raw?.fecha ? new Date(raw.fecha) : new Date(),
        productos: Array.isArray(raw?.productos) ? raw.productos : [],
        pagos: Array.isArray(raw?.pagos) ? raw.pagos : [],
        total: Number(raw?.total) || 0,
      } as Venta;
    });

    let nextId = maxId + 1;
    for (const v of ventas) {
      if (!v.id || v.id <= 0) {
        v.id = nextId++;
      }
    }
    return ventas;
  }

  generarCodigoInterno(): string {
    const productos = this.productosSubject.value;
    const nextId = productos.length ? Math.max(...productos.map(p => p.id || 0)) + 1 : 1;
    return `PRD-${String(nextId).padStart(5, '0')}`;
  }

  getProductoByCodigoBarras(codigoBarras: string): Producto | undefined {
    const code = this.normalizarCodigoEscaneado(codigoBarras);
    if (!code) return undefined;
    return this.productosSubject.value.find(p =>
      this.codigosEscaneoEquivalentes(code, p.codigoBarras || '') ||
      this.codigosEscaneoEquivalentes(code, p.codigo || '')
    );
  }

  productoConCodigoDuplicado(codigo: string, excluirId?: number | null): Producto | undefined {
    const normalizado = this.normalizarCodigoEscaneado(codigo);
    if (!normalizado) return undefined;
    return this.productosSubject.value.find(p => {
      if (excluirId != null && p.id === excluirId) return false;
      return (
        this.codigosEscaneoEquivalentes(normalizado, p.codigoBarras || '') ||
        this.codigosEscaneoEquivalentes(normalizado, p.codigo || '')
      );
    });
  }

  private normalizarCodigoEscaneado(codigo: string): string {
    const limpio = (codigo || '').replace(/[\r\n\t]/g, '').trim();
    const digitos = limpio.replace(/\D/g, '');
    if (digitos.length >= 4 && /^\d+$/.test(digitos)) return digitos;
    return limpio.toLowerCase();
  }

  private codigosEscaneoEquivalentes(a: string, b: string): boolean {
    const na = this.normalizarCodigoEscaneado(a);
    const nb = this.normalizarCodigoEscaneado(b);
    if (!na || !nb) return false;
    return na === nb;
  }

  calcularPrecioVenta(costo: number, porcentaje: number): number {
    const c = Number(costo) || 0;
    const pct = Number(porcentaje) || 0;
    return Number((c * (1 + pct / 100)).toFixed(2));
  }

  private inicializarEjemplo(): void {
    const productosEjemplo: Producto[] = [
      {
        id: 1,
        codigo: 'MART-001',
        nombre: 'Martillo 16oz',
        descripcion: 'Martillo de acero con mango de madera',
        precioCosto: 18,
        porcentajeGanancia: 44.39,
        precio: 25.99,
        tipoVenta: 'unidad',
        stock: 50,
        stockMinimo: 10,
        categoria: 'Herramientas Manuales',
        proveedor: 'Herramientas Pro',
        fechaCreacion: new Date()
      },
      {
        id: 2,
        codigo: 'DEST-001',
        nombre: 'Destornillador Phillips #2',
        descripcion: 'Destornillador Phillips de 6 pulgadas',
        precioCosto: 5.5,
        porcentajeGanancia: 54.55,
        precio: 8.50,
        tipoVenta: 'unidad',
        stock: 100,
        stockMinimo: 20,
        categoria: 'Herramientas Manuales',
        proveedor: 'Herramientas Pro',
        fechaCreacion: new Date()
      }
    ];

    const ventasEjemplo: Venta[] = [
      {
        id: 1,
        numeroTicket: 'T001-2024',
        fecha: new Date(),
        productos: [
          {
            productoId: 1,
            codigo: 'MART-001',
            nombre: 'Martillo 16oz',
            cantidad: 1,
            precioUnitario: 25.99,
            subtotal: 25.99
          }
        ],
        total: 25.99,
        metodoPago: 'Efectivo',
        vendedor: 'Vendedor 1'
      }
    ];

    this.productosSubject.next(productosEjemplo);
    this.ventasSubject.next(ventasEjemplo);
    this.vendedoresSubject.next(['Vendedor 1']);
    this.proveedoresSubject.next([]);
    this.pedidosSubject.next([]);
    this.gastosSubject.next([]);
    this.categoriasGastoSubject.next([]);

    const categoriasUnicas = Array.from(
      new Set(productosEjemplo.map(p => p.categoria.trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
    this.categoriasSubject.next(categoriasUnicas);

    const proveedoresUnicos = Array.from(
      new Set(productosEjemplo.map(p => p.proveedor.trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
    this.proveedoresListaSubject.next(proveedoresUnicos);
  }

  private persistirProductos(): void {
    this.persistirSqliteKv('productos', this.productosSubject.value);
  }

  private persistirVentas(): void {
    this.persistirSqliteKv('ventas', this.ventasSubject.value);
  }

  private persistirCategorias(): void {
    this.persistirSqliteKv('categorias', this.categoriasSubject.value);
  }

  private persistirProveedoresLista(): void {
    this.persistirSqliteKv('proveedoresLista', this.proveedoresListaSubject.value);
  }

  private persistirVendedores(): void {
    this.persistirSqliteKv('vendedores', this.vendedoresSubject.value);
  }

  private persistirProveedores(): void {
    this.persistirSqliteKv('proveedores', this.proveedoresSubject.value);
  }

  private persistirPedidos(): void {
    this.persistirSqliteKv('pedidos', this.pedidosSubject.value);
  }

  private persistirGastos(): void {
    this.persistirSqliteKv('gastos', this.gastosSubject.value);
  }

  private persistirCategoriasGasto(): void {
    this.persistirSqliteKv('categoriasGasto', this.categoriasGastoSubject.value);
  }

  private esListaCategoriasGastoLegacy(categorias: string[]): boolean {
    if (categorias.length !== CATEGORIAS_GASTO_LEGACY.length) return false;
    const normalizadas = [...categorias].map(c => c.trim().toLowerCase()).sort();
    const legacy = [...CATEGORIAS_GASTO_LEGACY].map(c => c.toLowerCase()).sort();
    return normalizadas.every((c, i) => c === legacy[i]);
  }

  private categoriasDesdeGastos(gastos: Gasto[]): string[] {
    return Array.from(
      new Set(gastos.map(g => (g.categoria || '').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }

  private resolverCategoriasGasto(stored: string[], gastos: Gasto[]): string[] {
    const limpias = stored.map(c => (c || '').trim()).filter(Boolean);
    if (this.esListaCategoriasGastoLegacy(limpias)) {
      return this.categoriasDesdeGastos(gastos);
    }
    if (limpias.length) return [...limpias].sort((a, b) => a.localeCompare(b));
    return this.categoriasDesdeGastos(gastos);
  }

  private debePersistirCategoriasGasto(raw: unknown, resueltas: string[]): boolean {
    if (!Array.isArray(raw)) return true;
    if (this.esListaCategoriasGastoLegacy(raw.map(c => String(c || '').trim()).filter(Boolean))) {
      return true;
    }
    return !raw.length && resueltas.length > 0;
  }

  private proveedoresDesdeProductos(productos: Producto[]): string[] {
    return Array.from(
      new Set(productos.map(p => (p.proveedor || '').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }

  private resolverProveedoresLista(stored: string[], productos: Producto[], legacyProveedores: Proveedor[]): string[] {
    const limpias = stored.map(p => (p || '').trim()).filter(Boolean);
    if (limpias.length) return [...limpias].sort((a, b) => a.localeCompare(b));

    const desdeProductos = this.proveedoresDesdeProductos(productos);
    const desdeLegacy = (legacyProveedores || [])
      .map(p => (p.nombre || '').trim())
      .filter(Boolean);
    return Array.from(new Set([...desdeProductos, ...desdeLegacy])).sort((a, b) => a.localeCompare(b));
  }

  private debePersistirProveedoresLista(raw: unknown, resueltas: string[]): boolean {
    if (!Array.isArray(raw)) return resueltas.length > 0;
    return !raw.length && resueltas.length > 0;
  }

  private sincronizarProveedorEnLista(nombre: string): void {
    const n = (nombre || '').trim();
    if (!n) return;
    const actuales = this.proveedoresListaSubject.value;
    if (actuales.some(p => p.toLowerCase() === n.toLowerCase())) return;
    this.proveedoresListaSubject.next([...actuales, n].sort((a, b) => a.localeCompare(b)));
    this.persistirProveedoresLista();
  }

  getProductos(): Observable<Producto[]> {
    return this.productos$;
  }

  getProductoById(id: number): Producto | undefined {
    return this.productosSubject.value.find(p => p.id === id);
  }

  getProductoByCodigo(codigo: string): Producto | undefined {
    return this.productosSubject.value.find(p => p.codigo === codigo);
  }

  agregarProducto(producto: Producto): void {
    const productos = this.productosSubject.value;
    const nextId = productos.length ? Math.max(...productos.map(p => p.id || 0)) + 1 : 1;
    producto.id = nextId;
    producto.fechaCreacion = new Date();

    const barras = (producto.codigoBarras || '').trim();
    if (barras && !producto.codigo?.trim()) {
      producto.codigo = barras;
    }
    if (!producto.codigo?.trim()) {
      producto.codigo = this.generarCodigoInterno();
    }

    producto.precio = this.calcularPrecioVenta(producto.precioCosto, producto.porcentajeGanancia);
    this.productosSubject.next([...productos, producto]);

    const categorias = this.categoriasSubject.value;
    const cat = (producto.categoria || '').trim();
    if (cat && !categorias.map(c => c.toLowerCase()).includes(cat.toLowerCase())) {
      this.categoriasSubject.next([...categorias, cat].sort((a, b) => a.localeCompare(b)));
    }
    this.sincronizarProveedorEnLista(producto.proveedor);

    this.persistirProductos();
    this.persistirCategorias();
    this.persistirProveedoresLista();
    this.persistirSqliteKv('productos', this.productosSubject.value);
    this.persistirSqliteKv('categorias', this.categoriasSubject.value);
    this.persistirSqliteKv('proveedoresLista', this.proveedoresListaSubject.value);
  }

  actualizarProducto(producto: Producto): void {
    const productos = this.productosSubject.value;
    const index = productos.findIndex(p => p.id === producto.id);
    if (index !== -1) {
      productos[index] = { ...producto };
      this.productosSubject.next([...productos]);
      this.sincronizarProveedorEnLista(producto.proveedor);
      this.persistirProductos();
      this.persistirProveedoresLista();
      this.persistirSqliteKv('productos', this.productosSubject.value);
      this.persistirSqliteKv('proveedoresLista', this.proveedoresListaSubject.value);
    }
  }

  actualizarProductosEnBloquePorId(actualizados: Producto[]): number {
    if (!Array.isArray(actualizados) || !actualizados.length) return 0;
    const productos = this.productosSubject.value;
    const idToIndex = new Map<number, number>();
    for (let i = 0; i < productos.length; i++) {
      const id = productos[i].id;
      if (typeof id === 'number') idToIndex.set(id, i);
    }
    let count = 0;
    for (const nuevo of actualizados) {
      const id = nuevo.id;
      if (typeof id !== 'number') continue;
      const idx = idToIndex.get(id);
      if (idx === undefined) continue;
      const actual = productos[idx];
      const changed = (
        actual.nombre !== nuevo.nombre ||
        actual.descripcion !== nuevo.descripcion ||
        actual.categoria !== nuevo.categoria ||
        actual.proveedor !== nuevo.proveedor ||
        actual.precio !== nuevo.precio ||
        actual.precioCosto !== nuevo.precioCosto ||
        actual.porcentajeGanancia !== nuevo.porcentajeGanancia ||
        actual.tipoVenta !== nuevo.tipoVenta ||
        actual.codigoBarras !== nuevo.codigoBarras ||
        actual.stock !== nuevo.stock ||
        actual.stockMinimo !== nuevo.stockMinimo
      );
      if (!changed) continue;
      productos[idx] = { ...nuevo };
      count++;
    }
    if (count > 0) {
      this.productosSubject.next([...productos]);
      this.persistirProductos();
      this.persistirSqliteKv('productos', this.productosSubject.value);
    }
    return count;
  }

  eliminarProducto(id: number): void {
    const productos = this.productosSubject.value;
    this.productosSubject.next(productos.filter(p => p.id !== id));
    this.persistirProductos();
    this.persistirSqliteKv('productos', this.productosSubject.value);
  }

  eliminarProductosPorCodigoEnBloque(codigos: string[]): number {
    if (!Array.isArray(codigos) || !codigos.length) return 0;
    const set = new Set(codigos.map(c => (c || '').trim()).filter(Boolean));
    if (!set.size) return 0;
    const antes = this.productosSubject.value;
    const despues = antes.filter(p => !set.has((p.codigo || '').trim()));
    const eliminados = antes.length - despues.length;
    if (eliminados <= 0) return 0;
    this.productosSubject.next(despues);

    const categoriasUnicas = Array.from(
      new Set(despues.map(p => (p.categoria || '').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
    this.categoriasSubject.next(categoriasUnicas);

    this.persistirProductos();
    this.persistirCategorias();
    this.persistirSqliteKv('productos', this.productosSubject.value);
    this.persistirSqliteKv('categorias', this.categoriasSubject.value);
    return eliminados;
  }

  actualizarStocksPorCodigoBatch(updates: Record<string, number>): { updated: number; unknown: string[] } {
    const productos = this.productosSubject.value;
    if (!updates || typeof updates !== 'object') return { updated: 0, unknown: [] };
    const codigoToIndex = new Map<string, number>();
    for (let i = 0; i < productos.length; i++) {
      const c = (productos[i].codigo || '').trim();
      if (c) codigoToIndex.set(c, i);
    }
    const unknown: string[] = [];
    let updatedCount = 0;
    for (const [codigoRaw, stockVal] of Object.entries(updates)) {
      const codigo = (codigoRaw || '').trim();
      const idx = codigoToIndex.get(codigo);
      if (idx === undefined) { unknown.push(codigo); continue; }
      const nuevoStock = Math.max(0, Math.trunc(Number(stockVal || 0)));
      if (!isFinite(nuevoStock)) { continue; }
      if (productos[idx].stock !== nuevoStock) {
        productos[idx] = { ...productos[idx], stock: nuevoStock };
        updatedCount++;
      }
    }
    if (updatedCount > 0) {
      this.productosSubject.next([...productos]);
      this.persistirProductos();
      this.persistirSqliteKv('productos', this.productosSubject.value);
    }
    return { updated: updatedCount, unknown };
  }

  /**
   * Inserta o actualiza muchos productos de una sola vez, identificándolos por su código.
   * - Si el producto existe (mismo código), actualiza campos básicos y mantiene el stock actual por defecto.
   * - Si no existe, lo crea asignando un id nuevo y respetando el stock provisto en la entrada.
   * - Emite una única vez a los observers y persiste una sola vez para mejorar el rendimiento.
   */
  upsertProductosPorCodigoEnBloque(entries: Producto[], opciones?: { keepExistingStock?: boolean }): { created: number; updated: number } {
    const keepExistingStock = opciones?.keepExistingStock !== false;
    const actuales = this.productosSubject.value;
    const productos = [...actuales];
    let created = 0;
    let updated = 0;

    // Mapear códigos existentes a sus índices y calcular próximo id
    const codigoToIndex = new Map<string, number>();
    let maxId = 0;
    for (let i = 0; i < productos.length; i++) {
      const p = productos[i];
      const c = (p.codigo || '').trim();
      if (c) codigoToIndex.set(c, i);
      if (typeof p.id === 'number') maxId = Math.max(maxId, p.id);
    }

    for (const entry of entries) {
      const codigo = (entry.codigo || '').trim();
      if (!codigo) continue;
      const idx = codigoToIndex.get(codigo);
      if (idx !== undefined) {
        const existente = productos[idx];
        const merged: Producto = {
          ...existente,
          nombre: entry.nombre ?? existente.nombre,
          categoria: entry.categoria ?? existente.categoria,
          proveedor: entry.proveedor ?? existente.proveedor,
          descripcion: entry.descripcion ?? existente.descripcion,
          precioCosto: typeof entry.precioCosto === 'number' ? entry.precioCosto : existente.precioCosto,
          porcentajeGanancia: typeof entry.porcentajeGanancia === 'number' ? entry.porcentajeGanancia : existente.porcentajeGanancia,
          precio: typeof entry.precio === 'number' ? entry.precio : existente.precio,
          tipoVenta: entry.tipoVenta ?? existente.tipoVenta,
          codigoBarras: entry.codigoBarras ?? existente.codigoBarras,
          stock: keepExistingStock ? existente.stock : (typeof entry.stock === 'number' ? entry.stock : existente.stock),
          stockMinimo: typeof entry.stockMinimo === 'number' ? entry.stockMinimo : existente.stockMinimo,
        };
        const changed = (
          merged.nombre !== existente.nombre ||
          merged.categoria !== existente.categoria ||
          merged.proveedor !== existente.proveedor ||
          merged.descripcion !== existente.descripcion ||
          merged.precio !== existente.precio ||
          merged.precioCosto !== existente.precioCosto ||
          merged.porcentajeGanancia !== existente.porcentajeGanancia ||
          merged.tipoVenta !== existente.tipoVenta ||
          merged.codigoBarras !== existente.codigoBarras ||
          merged.stock !== existente.stock ||
          merged.stockMinimo !== existente.stockMinimo
        );
        if (changed) {
          productos[idx] = merged;
          updated++;
        }
      } else {
        const nuevo: Producto = {
          ...entry,
          id: ++maxId,
          fechaCreacion: new Date(entry.fechaCreacion || new Date())
        };
        productos.push(nuevo);
        if (codigo) codigoToIndex.set(codigo, productos.length - 1);
        created++;
      }
    }

    // Actualizar subjects una sola vez
    this.productosSubject.next(productos);

    // Recalcular categorías únicas basadas en productos actuales
    const categoriasUnicas = Array.from(
      new Set(productos.map(p => (p.categoria || '').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
    this.categoriasSubject.next(categoriasUnicas);

    // Persistir de una vez
    this.persistirProductos();
    this.persistirCategorias();
    this.persistirSqliteKv('productos', this.productosSubject.value);
    this.persistirSqliteKv('categorias', this.categoriasSubject.value);

    return { created, updated };
  }

  actualizarStock(id: number, cantidad: number): void {
    const productos = this.productosSubject.value;
    const index = productos.findIndex(p => p.id === id);
    if (index !== -1) {
      productos[index].stock += cantidad;
      this.productosSubject.next([...productos]);
      this.persistirProductos();
    }
  }

  getVentas(): Observable<Venta[]> {
    return this.ventas$;
  }

  getVentasActuales(): Venta[] {
    return this.ventasSubject.value;
  }

  getProductosActuales(): Producto[] {
    return this.productosSubject.value;
  }

  /** Suma de (precio de costo × stock) para todo el inventario. */
  getValorStockTotal(): number {
    return this.productosSubject.value.reduce((acc, p) => {
      const costo = Number(p.precioCosto) || 0;
      const stock = Number(p.stock) || 0;
      return acc + costo * stock;
    }, 0);
  }

  getVentaById(id: number): Venta | undefined {
    const numId = Number(id);
    return this.ventasSubject.value.find(v => Number(v.id) === numId);
  }

  crearVenta(venta: Venta): boolean {
    const ventas = this.ventasSubject.value;
    const maxId = ventas.length ? Math.max(...ventas.map(v => Number(v.id) || 0)) : 0;
    venta.id = maxId + 1;
    for (const vp of venta.productos) {
      if (!this.getProductoById(vp.productoId)) return false;
    }
    let total = 0;
    venta.productos.forEach(vp => {
      vp.subtotal = Number(vp.cantidad) * Number(vp.precioUnitario);
      total += vp.subtotal;
      this.descontarStockVenta(vp.productoId, vp.cantidad);
    });
    let descuento = 0;
    if (typeof venta.descuentoPct === 'number' && !isNaN(venta.descuentoPct)) {
      descuento = total * (Number(venta.descuentoPct) / 100);
      venta.descuentoMonto = Number(descuento.toFixed(2));
    } else if (typeof venta.descuentoMonto === 'number' && !isNaN(venta.descuentoMonto)) {
      descuento = Number(venta.descuentoMonto);
    }
    const base = Math.max(0, Number((total - descuento).toFixed(2)));
    const redondeo = Number(venta.redondeo || 0);
    const totalManualVal = Number((venta as any).totalManual || 0);
    if (!isNaN(totalManualVal) && totalManualVal > 0) {
      venta.total = Math.max(0, Math.round(totalManualVal));
    } else {
      venta.total = Math.max(0, Math.round(base + redondeo));
    }
    if (!venta.pagos) { venta.pagos = []; }

    this.ventasSubject.next([...ventas, venta]);
    this.persistirVentas();
    this.persistirSqliteKv('productos', this.productosSubject.value);
    this.persistirSqliteKv('ventas', this.ventasSubject.value);
    return true;
  }

  eliminarVenta(id: number, restock: boolean = true): boolean {
    const numId = Number(id);
    if (!Number.isFinite(numId) || numId <= 0) return false;
    const venta = this.getVentaById(numId);
    if (!venta) return false;
    if (restock) {
      for (const vp of venta.productos) {
        this.actualizarStock(vp.productoId, vp.cantidad);
      }
    }
    const ventas = this.ventasSubject.value.filter(v => Number(v.id) !== numId);
    this.ventasSubject.next(ventas);
    this.persistirVentas();
    this.persistirSqliteKv('productos', this.productosSubject.value);
    this.persistirSqliteKv('ventas', this.ventasSubject.value);
    return true;
  }

  buscarProductos(termino: string): Producto[] {
    const productos = this.productosSubject.value;
    return productos.filter(p => 
      p.nombre.toLowerCase().includes(termino.toLowerCase()) ||
      p.codigo.toLowerCase().includes(termino.toLowerCase()) ||
      p.categoria.toLowerCase().includes(termino.toLowerCase())
    );
  }

  getProductosBajoStock(): Producto[] {
    return this.productosSubject.value.filter(p =>
      p.stockMinimo > 0 && p.stock <= p.stockMinimo
    );
  }

  /** Descuenta stock solo si el producto tiene inventario cargado (> 0). */
  private descontarStockVenta(productoId: number, cantidad: number): void {
    const p = this.getProductoById(productoId);
    if (!p) return;
    const stockActual = Number(p.stock) || 0;
    if (stockActual <= 0) return;
    const descontar = Math.min(cantidad, stockActual);
    this.actualizarStock(productoId, -descontar);
  }

  getVentasPorFecha(fechaInicio: Date, fechaFin: Date): Venta[] {
    return this.ventasSubject.value.filter(v => 
      v.fecha >= fechaInicio && v.fecha <= fechaFin
    );
  }

  getTotalVentas(fechaInicio: Date, fechaFin: Date): number {
    const ventas = this.getVentasPorFecha(fechaInicio, fechaFin);
    return ventas.reduce((total, venta) => total + venta.total, 0);
  }

  getVentasUltimas24h(): Venta[] {
    const ahora = new Date();
    const inicio = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
    return this.getVentasPorFecha(inicio, ahora).sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  }

  getSumaPagosPorMetodo(fechaInicio: Date, fechaFin: Date): Record<string, number> {
    const ventas = this.getVentasPorFecha(fechaInicio, fechaFin);
    const mapa: Record<string, number> = {};
    for (const v of ventas) {
      for (const p of v.pagos || []) {
        const key = (p.metodo || 'Desconocido').trim();
        mapa[key] = (mapa[key] || 0) + Number(p.monto || 0);
      }
    }
    return mapa;
  }

  getCategorias(): Observable<string[]> {
    return this.categorias$;
  }

  agregarCategoria(nombre: string): void {
    const n = (nombre || '').trim();
    if (!n) return;
    const categorias = this.categoriasSubject.value;
    if (!categorias.map(c => c.toLowerCase()).includes(n.toLowerCase())) {
      this.categoriasSubject.next([...categorias, n].sort((a, b) => a.localeCompare(b)));
      this.persistirCategorias();
    }
  }

  countProductosPorCategoria(nombre: string): number {
    const n = (nombre || '').trim().toLowerCase();
    if (!n) return 0;
    return this.productosSubject.value.filter(p => (p.categoria || '').trim().toLowerCase() === n).length;
  }

  eliminarCategoria(nombre: string): boolean {
    const n = (nombre || '').trim();
    if (!n) return false;
    const categorias = this.categoriasSubject.value;
    const existe = categorias.some(c => c.toLowerCase() === n.toLowerCase());
    if (!existe) return false;
    const nuevas = categorias.filter(c => c.toLowerCase() !== n.toLowerCase());
    this.categoriasSubject.next(nuevas);
    this.persistirCategorias();
    return true;
  }

  getProveedoresLista(): Observable<string[]> {
    return this.proveedoresLista$;
  }

  agregarProveedorLista(nombre: string): void {
    const n = (nombre || '').trim();
    if (!n) return;
    const proveedores = this.proveedoresListaSubject.value;
    if (!proveedores.map(p => p.toLowerCase()).includes(n.toLowerCase())) {
      this.proveedoresListaSubject.next([...proveedores, n].sort((a, b) => a.localeCompare(b)));
      this.persistirProveedoresLista();
    }
  }

  countProductosPorProveedor(nombre: string): number {
    const n = (nombre || '').trim().toLowerCase();
    if (!n) return 0;
    return this.productosSubject.value.filter(p => (p.proveedor || '').trim().toLowerCase() === n).length;
  }

  eliminarProveedorLista(nombre: string): boolean {
    const n = (nombre || '').trim();
    if (!n) return false;
    const proveedores = this.proveedoresListaSubject.value;
    const existe = proveedores.some(p => p.toLowerCase() === n.toLowerCase());
    if (!existe) return false;
    this.proveedoresListaSubject.next(proveedores.filter(p => p.toLowerCase() !== n.toLowerCase()));
    this.persistirProveedoresLista();
    return true;
  }

  getGastos(): Observable<Gasto[]> {
    return this.gastos$;
  }

  getGastosActuales(): Gasto[] {
    return this.gastosSubject.value;
  }

  getCategoriasGasto(): Observable<string[]> {
    return this.categoriasGasto$;
  }

  agregarCategoriaGasto(nombre: string): void {
    const n = (nombre || '').trim();
    if (!n) return;
    const categorias = this.categoriasGastoSubject.value;
    if (!categorias.map(c => c.toLowerCase()).includes(n.toLowerCase())) {
      this.categoriasGastoSubject.next([...categorias, n].sort((a, b) => a.localeCompare(b)));
      this.persistirCategoriasGasto();
    }
  }

  countGastosPorCategoria(nombre: string): number {
    const n = (nombre || '').trim().toLowerCase();
    if (!n) return 0;
    return this.gastosSubject.value.filter(g => (g.categoria || '').trim().toLowerCase() === n).length;
  }

  eliminarCategoriaGasto(nombre: string): boolean {
    const n = (nombre || '').trim();
    if (!n) return false;
    const categorias = this.categoriasGastoSubject.value;
    const existe = categorias.some(c => c.toLowerCase() === n.toLowerCase());
    if (!existe) return false;
    this.categoriasGastoSubject.next(categorias.filter(c => c.toLowerCase() !== n.toLowerCase()));
    this.persistirCategoriasGasto();
    return true;
  }

  agregarGasto(gasto: Gasto): void {
    const gastos = this.gastosSubject.value;
    const nextId = gastos.length ? Math.max(...gastos.map(g => g.id || 0)) + 1 : 1;
    gasto.id = nextId;
    gasto.fecha = new Date(gasto.fecha);
    this.gastosSubject.next([...gastos, gasto]);

    const cat = (gasto.categoria || '').trim();
    if (cat) this.agregarCategoriaGasto(cat);

    this.persistirGastos();
  }

  actualizarGasto(gasto: Gasto): void {
    const gastos = this.gastosSubject.value;
    const idx = gastos.findIndex(g => g.id === gasto.id);
    if (idx === -1) return;
    gastos[idx] = { ...gasto, fecha: new Date(gasto.fecha) };
    this.gastosSubject.next([...gastos]);

    const cat = (gasto.categoria || '').trim();
    if (cat) this.agregarCategoriaGasto(cat);

    this.persistirGastos();
  }

  eliminarGasto(id: number): void {
    const gastos = this.gastosSubject.value.filter(g => g.id !== id);
    this.gastosSubject.next(gastos);
    this.persistirGastos();
  }

  getGastosEnRango(inicio: Date, fin: Date): Gasto[] {
    const start = inicio.getTime();
    const end = fin.getTime();
    return this.gastosSubject.value.filter(g => {
      const t = new Date(g.fecha).getTime();
      return t >= start && t <= end;
    });
  }

  getTotalGastosEnRango(inicio: Date, fin: Date): number {
    return this.getGastosEnRango(inicio, fin).reduce((acc, g) => acc + (Number(g.monto) || 0), 0);
  }

  getInicioFinMes(anio: number, mes: number): { inicio: Date; fin: Date } {
    const inicio = new Date(anio, mes, 1, 0, 0, 0, 0);
    const fin = new Date(anio, mes + 1, 0, 23, 59, 59, 999);
    return { inicio, fin };
  }

  getInicioFinDia(anio: number, mes: number, dia: number): { inicio: Date; fin: Date } {
    const inicio = new Date(anio, mes, dia, 0, 0, 0, 0);
    const fin = new Date(anio, mes, dia, 23, 59, 59, 999);
    return { inicio, fin };
  }

  getVendedores(): Observable<string[]> {
    return this.vendedores$;
  }

  getVendedoresActuales(): string[] {
    return this.vendedoresSubject.value;
  }

  agregarVendedor(nombre: string): boolean {
    const n = (nombre || '').trim();
    if (!n) return false;
    const actuales = this.vendedoresSubject.value;
    if (actuales.some(v => v.toLowerCase() === n.toLowerCase())) return false;
    this.vendedoresSubject.next([...actuales, n]);
    this.persistirVendedores();
    this.persistirSqliteKv('vendedores', this.vendedoresSubject.value);
    return true;
  }

  eliminarVendedor(nombre: string): boolean {
    const n = (nombre || '').trim();
    if (!n) return false;
    const actuales = this.vendedoresSubject.value;
    const restantes = actuales.filter(v => v.toLowerCase() !== n.toLowerCase());
    if (restantes.length === actuales.length) return false;
    this.vendedoresSubject.next(restantes);
    this.persistirVendedores();
    this.persistirSqliteKv('vendedores', this.vendedoresSubject.value);
    return true;
  }

  getProveedores(): Observable<Proveedor[]> {
    return this.proveedores$;
  }

  getProveedoresActuales(): Proveedor[] {
    return this.proveedoresSubject.value;
  }

  agregarProveedor(data: { nombre: string; ubicacion: string; descripcion: string; }): Proveedor | null {
    const nombre = (data.nombre || '').trim();
    if (!nombre) return null;
    const actuales = this.proveedoresSubject.value;
    const nextId = actuales.length ? Math.max(...actuales.map(p => p.id)) + 1 : 1;
    const proveedor: Proveedor = {
      id: nextId,
      nombre,
      ubicacion: (data.ubicacion || '').trim(),
      descripcion: (data.descripcion || '').trim(),
      listas: []
    };
    this.proveedoresSubject.next([...actuales, proveedor]);
    this.persistirProveedores();
    this.persistirSqliteKv('proveedores', this.proveedoresSubject.value);
    return proveedor;
  }

  eliminarProveedor(id: number): boolean {
    const actuales = this.proveedoresSubject.value;
    const restantes = actuales.filter(p => p.id !== id);
    if (restantes.length === actuales.length) return false;
    this.proveedoresSubject.next(restantes);
    this.persistirProveedores();
    this.persistirSqliteKv('proveedores', this.proveedoresSubject.value);
    return true;
  }

  actualizarProveedor(data: { id: number; nombre: string; ubicacion: string; descripcion: string; }): boolean {
    const proveedores = this.proveedoresSubject.value;
    const idx = proveedores.findIndex(p => p.id === data.id);
    if (idx === -1) return false;
    const actual = proveedores[idx];
    proveedores[idx] = {
      ...actual,
      nombre: (data.nombre || '').trim(),
      ubicacion: (data.ubicacion || '').trim(),
      descripcion: (data.descripcion || '').trim(),
    };
    this.proveedoresSubject.next([...proveedores]);
    this.persistirProveedores();
    return true;
  }

  agregarListaPrecios(proveedorId: number, nombreArchivo: string, items: ItemListaProveedor[]): ListaPreciosProveedor | null {
    const proveedores = this.proveedoresSubject.value;
    const idx = proveedores.findIndex(p => p.id === proveedorId);
    if (idx === -1) return null;
    const listas = proveedores[idx].listas || [];
    const nextId = listas.length ? Math.max(...listas.map(l => l.id)) + 1 : 1;
    const lista: ListaPreciosProveedor = {
      id: nextId,
      proveedorId,
      nombreArchivo,
      fechaCarga: new Date(),
      items: items.map(it => ({
        codigo: String(it.codigo || '').trim(),
        nombre: String(it.nombre || '').trim(),
        precio: Number(it.precio || 0)
      }))
    };
    proveedores[idx] = { ...proveedores[idx], listas: [...listas, lista] };
    this.proveedoresSubject.next([...proveedores]);
    this.persistirProveedores();
    this.persistirSqliteKv('proveedores', this.proveedoresSubject.value);
    return lista;
  }

  getItemsProveedor(proveedorId: number): ItemListaProveedor[] {
    const prov = this.proveedoresSubject.value.find(p => p.id === proveedorId);
    if (!prov) return [];
    const todos = (prov.listas || []).flatMap(l => l.items || []);
    const map = new Map<string, ItemListaProveedor>();
    for (const lista of (prov.listas || []).sort((a, b) => b.fechaCarga.getTime() - a.fechaCarga.getTime())) {
      for (const it of (lista.items || [])) {
        const key = (it.codigo || '').trim();
        if (key && !map.has(key)) {
          map.set(key, it);
        }
      }
    }
    return Array.from(map.values());
  }

  vaciarListasProveedor(proveedorId: number): boolean {
    const proveedores = this.proveedoresSubject.value;
    const idx = proveedores.findIndex(p => p.id === proveedorId);
    if (idx === -1) return false;
    proveedores[idx] = { ...proveedores[idx], listas: [] };
    this.proveedoresSubject.next([...proveedores]);
    this.persistirProveedores();
    this.persistirSqliteKv('proveedores', this.proveedoresSubject.value);
    return true;
  }

  getPedidosProveedor(proveedorId: number): PedidoProveedor[] {
    return this.pedidosSubject.value
      .filter(p => p.proveedorId === proveedorId)
      .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  }

  agregarPedidoProveedor(data: { proveedorId: number; items: PedidoItemProveedor[]; }): PedidoProveedor {
    const pedidos = this.pedidosSubject.value;
    const nextId = pedidos.length ? Math.max(...pedidos.map(p => p.id)) + 1 : 1;
    const total = data.items.reduce((acc, it) => acc + Number(it.subtotal || (Number(it.precio) * Number(it.cantidad))), 0);
    const pedido: PedidoProveedor = {
      id: nextId,
      proveedorId: data.proveedorId,
      fecha: new Date(),
      items: data.items.map(it => ({ ...it, subtotal: Number(it.subtotal || (Number(it.precio) * Number(it.cantidad))) })),
      total: Number(total.toFixed(2)),
      entregado: false,
      pagado: false
    };
    this.pedidosSubject.next([pedido, ...pedidos]);
    this.persistirPedidos();
    this.persistirSqliteKv('pedidos', this.pedidosSubject.value);
    return pedido;
  }

  actualizarPedidoFlags(id: number, cambios: Partial<Pick<PedidoProveedor, 'entregado' | 'pagado'>>): void {
    const pedidos = this.pedidosSubject.value;
    const idx = pedidos.findIndex(p => p.id === id);
    if (idx === -1) return;
    pedidos[idx] = { ...pedidos[idx], ...cambios };
    this.pedidosSubject.next([...pedidos]);
    this.persistirPedidos();
    this.persistirSqliteKv('pedidos', this.pedidosSubject.value);
  }

  eliminarPedidoProveedor(id: number): boolean {
    const pedidos = this.pedidosSubject.value;
    const restantes = pedidos.filter(p => p.id !== id);
    if (restantes.length === pedidos.length) return false;
    this.pedidosSubject.next(restantes);
    this.persistirPedidos();
    this.persistirSqliteKv('pedidos', this.pedidosSubject.value);
    return true;
  }
  private async persistirSqliteKv(key: string, value: any): Promise<void> {
    try {
      const electronAPI: any = (window as any)?.electronAPI;
      if (!electronAPI?.kvSet) return;
      await electronAPI.kvSet(key, JSON.stringify(value));
    } catch {}
  }
}