import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../icon/icon.component';
import { FormsModule } from '@angular/forms';
import { DatabaseService, Producto, Venta, VentaProducto, PagoVenta } from '../../services/database.service';
import { BarcodeScannerService } from '../../services/barcode-scanner.service';
import { Subscription } from 'rxjs';
import { ToastService } from '../../services/toast.service';
import { BRAND } from '../../config/brand.config';
import { LOGOS } from '../../config/logos.config';
type VentaProductoExt = VentaProducto & { editCantidad?: string };
type PagoVentaExt = PagoVenta & { montoStr?: string };

@Component({
  selector: 'app-ventas',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './ventas.component.html',
  styleUrls: ['./ventas.component.scss']
})
export class VentasComponent implements OnInit, OnDestroy {
  logos = LOGOS;
  productos: Producto[] = [];
  filtro = '';
  carrito: VentaProductoExt[] = [];
  pagos: PagoVentaExt[] = [];
  vendedor = 'Vendedor 1';
  cliente = '';
  private sub?: Subscription;
  private ventasSub?: Subscription;
  ventasRevision = 0;
  ventaAEliminar: Venta | null = null;
  restockConfirm = true;
  fechaSeleccionada: string = '';
  mostrarCalendario = false;
  descuentoPct: number = 0;
  descuentoMonto: number = 0;
  vendedores: string[] = [];
  nuevoVendedorNombre: string = '';
  mostrarNuevoVendedor = false;
  mostrarResumenVenta = false;
  ahora: Date = new Date();
  aplicarRedondeo = false;
  totalManualStr: string = '';
  get totalManual(): number { return Math.max(0, Math.round(Number((this.totalManualStr || '').replace(/\D+/g,'') || 0))); }
  onTotalManualInput(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const digits = (input.value || '').replace(/\D+/g, '');
    this.totalManualStr = digits;
  }
  editTotalManual = false;
  ultimoEscaneo = '';
  escaneoActivo = false;

  db = inject(DatabaseService);
  private toast = inject(ToastService);
  private barcodeScanner = inject(BarcodeScannerService);

  toggleEditTotalManual(): void { this.editTotalManual = !this.editTotalManual; }
  startEditTotal(): void { this.editTotalManual = true; }
  finishEditTotal(): void { this.editTotalManual = false; }
  clearTotalManual(): void { this.totalManualStr = ''; this.editTotalManual = false; }

  ngOnInit(): void {
    this.sub = this.db.getProductos().subscribe(items => (this.productos = items));
    this.ventasSub = this.db.getVentas().subscribe(() => {
      this.ventasRevision++;
    });
    this.db.getVendedores().subscribe(vs => {
      this.vendedores = vs;
      if (!this.vendedores.includes(this.vendedor) && this.vendedores.length) {
        this.vendedor = this.vendedores[0];
      }
    });
    this.pagos = [{ metodo: 'Efectivo', monto: 0, montoStr: '' }];
    this.iniciarCapturaEscanner();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.ventasSub?.unsubscribe();
    this.barcodeScanner.stopCapture();
    this.escaneoActivo = false;
  }

  private iniciarCapturaEscanner(): void {
    this.barcodeScanner.startCapture({
      onScan: (codigo) => this.procesarCodigoBarras(codigo),
      isPaused: () => this.escaneoPausado(),
    });
    this.escaneoActivo = true;
  }

  get escaneoEnPausa(): boolean {
    return this.mostrarResumenVenta || !!this.ventaAEliminar || this.entradaManualEnVentas();
  }

  private escaneoPausado(): boolean {
    return this.escaneoEnPausa;
  }

  /** True si el foco está en un campo donde el usuario escribe a mano. */
  private entradaManualEnVentas(): boolean {
    const el = document.activeElement as HTMLElement | null;
    if (!el?.closest('.ventas-container')) return false;
    return this.esCampoEditableManual(el);
  }

  private esCampoEditableManual(el: HTMLElement): boolean {
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') {
      const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
      return !['checkbox', 'radio', 'button', 'submit', 'reset', 'date', 'hidden', 'file'].includes(type);
    }
    return el.isContentEditable;
  }

  private procesarCodigoBarras(codigo: string): void {
    const code = this.barcodeScanner.codigoParaBusqueda(codigo);
    const producto = this.db.getProductoByCodigoBarras(code);
    if (!producto) {
      this.ultimoEscaneo = codigo;
      this.toast.show(`Producto no encontrado (${codigo})`, 'warning');
      return;
    }

    const agregado = this.agregarAlCarrito(producto, { silencioso: true });
    if (agregado) {
      this.ultimoEscaneo = codigo;
      this.filtro = '';
      const enCarrito = this.carrito.find(vp => vp.productoId === producto.id);
      const cantidad = enCarrito?.cantidad || 1;
      this.toast.show(
        cantidad > 1 ? `${producto.nombre} (x${cantidad})` : `${producto.nombre} agregado al carrito`,
        'success'
      );
      return;
    }

    this.ultimoEscaneo = codigo;
    this.toast.show(`${producto.nombre}: no se pudo agregar`, 'warning');
  }

  get productosFiltrados(): Producto[] {
    const t = (this.filtro || '').toLowerCase();
    return this.productos.filter(p =>
      p.nombre.toLowerCase().includes(t) ||
      p.codigo.toLowerCase().includes(t) ||
      (p.codigoBarras || '').toLowerCase().includes(t)
    );
  }

  // Paginación del catálogo de productos (columna izquierda)
  pageCatalogo = 1;
  pageSizeCatalogo = 20;
  get productosFiltradosTotal(): number {
    return this.productosFiltrados.length;
  }
  get productosCatalogoPaginados(): Producto[] {
    const arr = this.productosFiltrados;
    const total = arr.length;
    const max = Math.max(1, Math.ceil(total / this.pageSizeCatalogo));
    if (this.pageCatalogo > max) this.pageCatalogo = max;
    const start = (this.pageCatalogo - 1) * this.pageSizeCatalogo;
    return arr.slice(start, start + this.pageSizeCatalogo);
  }
  get paginaDesdeCatalogo(): number { return this.productosFiltradosTotal ? ((this.pageCatalogo - 1) * this.pageSizeCatalogo + 1) : 0; }
  get paginaHastaCatalogo(): number {
    const fin = this.pageCatalogo * this.pageSizeCatalogo;
    return fin > this.productosFiltradosTotal ? this.productosFiltradosTotal : fin;
  }
  goToPageCatalogo(p: number): void {
    const max = Math.max(1, Math.ceil(this.productosFiltradosTotal / this.pageSizeCatalogo));
    this.pageCatalogo = Math.max(1, Math.min(max, Math.trunc(p)));
  }
  trackByProductoCatalogo(_i: number, p: Producto): number | string { return p.id || p.codigo; }

  etiquetaStock(p: Producto): string {
    const stock = Number(p.stock) || 0;
    if (p.tipoVenta === 'kg') return `${stock} kg`;
    return String(stock);
  }

  // Paginación del carrito (productos en la venta)
  pageCarrito = 1;
  pageSizeCarrito = 6;
  get carritoPaginado(): VentaProductoExt[] {
    const arr = this.carrito || [];
    const total = arr.length;
    const max = Math.max(1, Math.ceil(total / this.pageSizeCarrito));
    if (this.pageCarrito > max) this.pageCarrito = max;
    const start = (this.pageCarrito - 1) * this.pageSizeCarrito;
    return arr.slice(start, start + this.pageSizeCarrito);
  }
  get totalItemsCarrito(): number { return (this.carrito || []).length; }
  get paginaDesdeCarrito(): number { return this.totalItemsCarrito ? ((this.pageCarrito - 1) * this.pageSizeCarrito + 1) : 0; }
  get paginaHastaCarrito(): number {
    const fin = this.pageCarrito * this.pageSizeCarrito;
    return fin > this.totalItemsCarrito ? this.totalItemsCarrito : fin;
  }
  goToPageCarrito(p: number): void {
    const max = Math.max(1, Math.ceil(this.totalItemsCarrito / this.pageSizeCarrito));
    this.pageCarrito = Math.max(1, Math.min(max, Math.trunc(p)));
  }

  agregarAlCarrito(p: Producto, _opts?: { silencioso?: boolean }): boolean {
    const existente = this.carrito.find(vp => vp.productoId === p.id);
    if (existente) {
      existente.cantidad += 1;
      existente.subtotal = existente.cantidad * existente.precioUnitario;
      (existente as any).editCantidad = String(existente.cantidad);
    } else {
      this.carrito.push({
        productoId: p.id!,
        codigo: p.codigo,
        nombre: p.nombre,
        cantidad: 1,
        precioUnitario: p.precio,
        subtotal: p.precio,
        editCantidad: '1' as any,
      } as any);
    }
    return true;
  }

  quitarDelCarrito(vp: VentaProductoExt): void {
    this.carrito = this.carrito.filter(x => x !== vp);
  }

  actualizarCantidad(vp: VentaProductoExt): void {
    if (vp.cantidad <= 0) vp.cantidad = 0.001;
    vp.subtotal = Math.round(vp.cantidad * vp.precioUnitario);
  }

  onCantidadChange(vp: VentaProductoExt, value: string): void {
    // Al escribir, no forzamos decimales; solo saneamos y guardamos en editCantidad
    const raw = (value || '').replace(/,/g, '.').replace(/[^0-9.]/g, '');
    const parts = raw.split('.');
    const normalized = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : raw;
    (vp as any).editCantidad = normalized;
  }

  onCantidadBlur(vp: VentaProductoExt): void {
    const text = String((vp as any).editCantidad ?? vp.cantidad ?? '');
    const val = Number(text || '');
    if (!isFinite(val) || val <= 0) {
      (vp as any).editCantidad = String(vp.cantidad);
      return;
    }
    vp.cantidad = Math.max(0.001, Number(val.toFixed(3)));
    (vp as any).editCantidad = String(vp.cantidad);
    this.actualizarCantidad(vp);
  }

  get subtotalCarrito(): number {
    return this.carrito.reduce((acc, x) => acc + Math.round(x.subtotal), 0);
  }

  get totalCarrito(): number {
    const subtotal = this.subtotalCarrito;
    const desc = Math.max(0, Math.min(100, Number(this.descuentoPct || 0)));
    const monto = Math.round((subtotal * desc) / 100);
    this.descuentoMonto = monto;
    return Math.max(0, subtotal - monto);
  }

  get redondeoCarrito(): number {
    if (!this.aplicarRedondeo) return 0;
    const total = Math.max(0, Math.round(this.totalCarrito));
    const resto50 = total % 50;
    return resto50 === 0 ? 0 : (50 - resto50);
  }

  get totalConRedondeo(): number {
    const manual = this.totalManual;
    if (manual > 0) return manual;
    return Math.max(0, Math.round(this.totalCarrito + this.redondeoCarrito));
  }

  get carritoResumen(): Array<{ nombre: string; cantidad: number; precioUnitario: number; subtotal: number }> {
    const baseItems = (this.carrito || []).map((vp:any)=>({ nombre: vp.nombre, cantidad: vp.cantidad, precioUnitario: vp.precioUnitario, subtotal: Math.round(Number(vp.subtotal)) }));
    const totalDeseado = this.totalManual > 0 ? this.totalManual : 0;
    if (!baseItems.length || totalDeseado === 0) return baseItems;
    const sumaActual = baseItems.reduce((acc,it)=>acc+Math.round(Number(it.subtotal||0)),0);
    if (sumaActual === totalDeseado) return baseItems;
    const diff = totalDeseado - sumaActual;
    const n = baseItems.length || 1;
    const porItem = Math.trunc(diff / n);
    const resto = diff - porItem * n;
    return baseItems.map((it, idx) => ({
      ...it,
      subtotal: Math.max(0, Math.round(Number(it.subtotal || 0) + porItem + (idx < Math.abs(resto) ? Math.sign(resto) : 0)))
    }));
  }

  get totalPagos(): number {
    return this.pagos.reduce((acc, p) => acc + Math.round(Number(p.monto || 0)), 0);
  }

  get totalPagosEfectivo(): number {
    return this.pagos.reduce((acc, p) => acc + (p.metodo === 'Efectivo' ? Math.round(Number(p.monto || 0)) : 0), 0);
  }

  get totalPagosNoEfectivo(): number {
    return this.pagos.reduce((acc, p) => acc + (p.metodo !== 'Efectivo' ? Math.round(Number(p.monto || 0)) : 0), 0);
  }

  get restante(): number {
    return Math.max(0, this.totalConRedondeo - this.totalPagos);
  }

  get vuelto(): number {
    const noEfectivo = this.totalPagosNoEfectivo;
    const necesarioConEfectivo = Math.max(0, this.totalConRedondeo - noEfectivo);
    const cambio = this.totalPagosEfectivo - necesarioConEfectivo;
    return Math.max(0, Math.round(cambio));
  }

  get estaBalanceado(): boolean {
    return (this.totalPagos + 0.009) >= this.totalConRedondeo && this.totalConRedondeo > 0;
  }

  get pagosPorMetodoActual(): { metodo: string; total: number }[] {
    const mapa = new Map<string, number>();
    for (const p of this.pagos) {
      const key = (p.metodo || 'Desconocido').trim();
      mapa.set(key, (mapa.get(key) || 0) + Number(p.monto || 0));
    }
    return Array.from(mapa.entries()).map(([metodo, total]) => ({ metodo, total }));
  }

  agregarPago(): void {
    this.pagos.push({ metodo: 'Efectivo', monto: 0 });
  }

  quitarPago(p: PagoVenta): void {
    this.pagos = this.pagos.filter(x => x !== p);
  }

  rellenarPago(p: PagoVenta): void {
    if (p.metodo === 'Efectivo') {
      const faltante = this.totalConRedondeo - this.totalPagos;
      if (faltante > 0) {
        const nuevo = Math.round(Number(p.monto || 0)) + faltante;
        p.monto = nuevo;
        (p as any).montoStr = this.formatPeso(nuevo);
      }
      return;
    }
    const sumaEfectivo = this.totalPagosEfectivo;
    const sumaNoEfectivoExcl = this.pagos
      .filter(x => x !== p && x.metodo !== 'Efectivo')
      .reduce((acc, x) => acc + Math.round(Number(x.monto || 0)), 0);
    const permitido = Math.max(0, this.totalConRedondeo - sumaEfectivo - sumaNoEfectivoExcl);
    if (permitido > 0) {
      const nuevo = Math.round(permitido);
      p.monto = nuevo;
      (p as any).montoStr = this.formatPeso(nuevo);
    }
  }

  onMetodoPagoChange(p: PagoVenta): void {
    this.onPagoChange(p);
  }

  onPagoChange(p: PagoVenta): void {
    if (p.metodo === 'Efectivo') {
      // Efectivo puede exceder por vuelto; redondear a pesos
      p.monto = Math.max(0, Math.round(Number(p.monto || 0)));
      (p as any).montoStr = p.monto.toLocaleString('es-AR');
      return;
    }
    const sumaNoEfectivoExcl = this.pagos
      .filter(x => x !== p && x.metodo !== 'Efectivo')
      .reduce((acc, x) => acc + Math.round(Number(x.monto || 0)), 0);
    const sumaEfectivo = this.totalPagosEfectivo;
    const maxParaEste = Math.max(0, this.totalConRedondeo - sumaEfectivo - sumaNoEfectivoExcl);
    const actual = Math.round(Number(p.monto || 0));
    if (actual > maxParaEste) {
      p.monto = maxParaEste;
    } else if (actual < 0) {
      p.monto = 0;
    } else {
      p.monto = actual;
    }
    (p as any).montoStr = p.monto.toLocaleString('es-AR');
  }

  onPagoInput(p: PagoVentaExt, ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const digits = (input.value || '').replace(/\D+/g, '');
    const val = digits ? parseInt(digits, 10) : 0;
    p.monto = val;
    p.montoStr = val.toLocaleString('es-AR');
  }

  onPagoBlur(p: PagoVentaExt): void {
    const val = Math.max(0, Math.round(Number(p.monto || 0)));
    p.monto = val;
    p.montoStr = val.toLocaleString('es-AR');
    this.onPagoChange(p);
  }

  private formatPeso(n: number): string {
    return Math.max(0, Math.round(Number(n || 0))).toLocaleString('es-AR');
  }

  abrirResumenVenta(): void {
    if (!this.carrito.length) {
      this.toast.show('Agrega productos a la venta', 'warning');
      return;
    }
    const total = this.totalConRedondeo;
    if ((this.totalPagos + 0.009) < total) {
      this.toast.show('El total de pagos no coincide con el total de la venta', 'warning');
      return;
    }
    this.ahora = new Date();
    this.mostrarResumenVenta = true;
  }

  cerrarResumenVenta(): void {
    this.mostrarResumenVenta = false;
  }

  guardarVenta(): void {
    if (!this.carrito.length) {
      this.toast.show('Agrega productos a la venta', 'warning');
      return;
    }
    const total = this.totalConRedondeo;
    if ((this.totalPagos + 0.009) < total) {
      this.toast.show('El total de pagos no coincide con el total de la venta', 'warning');
      return;
    }

    const venta: Venta = {
      numeroTicket: 'T-' + Date.now(),
      fecha: new Date(),
      productos: this.carrito.map(vp => ({ ...vp })),
      total: total,
      totalManual: this.totalManual > 0 ? this.totalManual : undefined,
      redondeo: this.redondeoCarrito,
      descuentoPct: this.descuentoPct || 0,
      descuentoMonto: this.descuentoMonto || 0,
      metodoPago: this.pagos.map(p => p.metodo).join(' + '),
      pagos: this.pagos.map(p => ({ ...p })),
      cliente: this.cliente || undefined,
      vendedor: this.vendedor,
      vuelto: this.vuelto,
    };

    const ok = this.db.crearVenta(venta);
    if (!ok) {
      this.toast.show('No se pudo registrar la venta', 'error');
      return;
    }
    this.toast.show('Venta registrada', 'success');
    this.mostrarResumenVenta = false;
    // Intentar abrir cajón si hay API disponible
    try {
      const api: any = (window as any)?.electronAPI;
      if (api && typeof api.openCashDrawer === 'function') {
        api.openCashDrawer();
      }
    } catch {}
    this.carrito = [];
    this.pagos = [{ metodo: 'Efectivo', monto: 0 }];
    this.descuentoPct = 0;
    this.descuentoMonto = 0;
    this.filtro = '';
    this.clearTotalManual();
  }

  get ultimas24h(): Venta[] {
    return this.db.getVentasUltimas24h();
  }

  get resumenPeriodo(): { metodo: string; total: number }[] {
    if (this.fechaSeleccionada) {
      const parsed = this.parseFechaSeleccionada(this.fechaSeleccionada);
      if (parsed) {
        const mapa = this.db.getSumaPagosPorMetodo(parsed.inicio, parsed.fin);
        return Object.entries(mapa)
          .map(([metodo, total]) => ({ metodo, total }))
          .filter(x => x.total > 0);
      }
    }
    const ahora = new Date();
    const inicio = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
    const mapa = this.db.getSumaPagosPorMetodo(inicio, ahora);
    return Object.entries(mapa)
      .map(([metodo, total]) => ({ metodo, total }))
      .filter(x => x.total > 0);
  }

  get ventasDelDia(): Venta[] {
    const ventas = this.db.getVentasActuales();
    if (!this.fechaSeleccionada) {
      return this.ultimas24h;
    }
    const parsed = this.parseFechaSeleccionada(this.fechaSeleccionada);
    if (!parsed) return this.ultimas24h;
    const { inicio, fin } = parsed;
    return ventas
      .filter(v => v.fecha >= inicio && v.fecha <= fin)
      .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  }

  // Paginación ventas
  pageVentas = 1;
  pageSizeVentas = 20;
  get ventasDelDiaPaginadas(): Venta[] {
    const arr = this.ventasDelDia;
    const total = arr.length;
    const max = Math.max(1, Math.ceil(total / this.pageSizeVentas));
    if (this.pageVentas > max) this.pageVentas = max;
    const start = (this.pageVentas - 1) * this.pageSizeVentas;
    return arr.slice(start, start + this.pageSizeVentas);
  }
  get totalVentasFiltradas(): number { return this.ventasDelDia.length; }
  setPageSizeVentas(size: number): void { this.pageSizeVentas = Math.max(10, Math.min(200, Math.trunc(size))); this.pageVentas = 1; }
  goToPageVentas(p: number): void {
    const max = Math.max(1, Math.ceil(this.totalVentasFiltradas / this.pageSizeVentas));
    this.pageVentas = Math.max(1, Math.min(max, Math.trunc(p)));
  }

  // Getters para mostrar rangos sin usar Math en template
  get paginaDesdeVentas(): number {
    if (this.totalVentasFiltradas === 0) return 0;
    return (this.pageVentas - 1) * this.pageSizeVentas + 1;
  }
  get paginaHastaVentas(): number {
    const fin = this.pageVentas * this.pageSizeVentas;
    return fin > this.totalVentasFiltradas ? this.totalVentasFiltradas : fin;
  }

  getTotalVentaMostrar(v: Venta): number {
    const totalGuardado = Math.max(0, Math.round(Number(v.total || 0)));
    const tienePropRedondeo = Object.prototype.hasOwnProperty.call(v as any, 'redondeo');
    if (tienePropRedondeo) {
      return totalGuardado;
    }
    const productos = (v.productos || []);
    const subtotal = productos.reduce((acc, p: any) => acc + Math.round(Number(p.subtotal || (Number(p.cantidad || 0) * Number(p.precioUnitario || 0)))), 0);
    let descuento = 0;
    if (v.descuentoPct && v.descuentoPct > 0) {
      descuento = Math.round((subtotal * Number(v.descuentoPct)) / 100);
    } else if (v.descuentoMonto && v.descuentoMonto > 0) {
      descuento = Math.round(Number(v.descuentoMonto));
    }
    const base = Math.max(0, subtotal - descuento);
    const resto = base % 100;
    const faltante = resto === 0 ? 0 : (100 - resto);
    const redondeoCalc = faltante > 0 && faltante <= 40 ? faltante : 0;
    if (Math.abs(totalGuardado - base) <= 1) {
      return base + redondeoCalc;
    }
    return totalGuardado;
  }

  get cantidadPagosElectronicosDia(): number {
    const ventas = this.ventasDelDia;
    const metodosValidos = new Set(['Transferencia', 'Débito', 'Crédito']);
    let count = 0;
    for (const v of ventas) {
      for (const p of (v.pagos || [])) {
        if (metodosValidos.has((p.metodo || '').trim())) {
          count++;
        }
      }
    }
    return count;
  }

  async exportarVentasDia(): Promise<void> {
    if (!this.fechaSeleccionada) {
      this.toast.show('Seleccioná un día para exportar.', 'warning');
      return;
    }
    const parsed = this.parseFechaSeleccionada(this.fechaSeleccionada);
    if (!parsed) {
      this.toast.show('Fecha inválida.', 'error');
      return;
    }
    const { inicio, fin } = parsed;
    const ventas = this.db.getVentasPorFecha(inicio, fin);
    const metodosValidos = new Map<string, string>([
      ['Transferencia', 'transferencia'],
      ['Débito', 'debito'],
      ['Crédito', 'credito'],
    ]);

    const two = (n: number) => String(n).padStart(2, '0');
    const filas = [] as Array<{ 'FECHA': string; 'HORA': string; 'MONTO': number; 'METODO DE PAGO': string }>;
    for (const v of ventas) {
      for (const p of (v.pagos || [])) {
        const etiqueta = metodosValidos.get((p.metodo || '').trim());
        if (!etiqueta) continue;
        const d = v.fecha;
        const fechaStr = `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`;
        const horaStr = `${two(d.getHours())}:${two(d.getMinutes())}`;
        filas.push({
          'FECHA': fechaStr,
          'HORA': horaStr,
          'MONTO': Number(p.monto || 0),
          'METODO DE PAGO': etiqueta,
        });
      }
    }

    if (!filas.length) {
      this.toast.show('No hay pagos por transferencia/débito/crédito para ese día.', 'info');
      return;
    }

    try {
      const { utils, write } = await import('xlsx');
      const ws = utils.json_to_sheet(filas);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, 'Ventas');

      const y = inicio.getFullYear();
      const m = String(inicio.getMonth() + 1).padStart(2, '0');
      const d = String(inicio.getDate()).padStart(2, '0');
      const fileName = `Reporte_Ventas_${y}-${m}-${d}.xlsx`;

      const wbout = write(wb, { bookType: 'xlsx', type: 'array' });
      const electronAPI = (window as any)?.electronAPI;
      if (electronAPI?.saveFile) {
        const result = await electronAPI.saveFile(wbout, {
          defaultPath: fileName,
          filters: [{ name: 'Excel', extensions: ['xlsx'] }]
        });
        if (result?.ok) {
          this.toast.show('Reporte exportado a Excel.');
        } else if (result?.canceled) {
          this.toast.show('Guardado cancelado.', 'info');
        } else {
          this.toast.show('No se pudo guardar el archivo.', 'error');
        }
      } else {
        const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const { saveAs } = await import('file-saver');
        saveAs(blob, fileName);
        this.toast.show('Reporte exportado a Excel.');
      }
    } catch (e) {
      this.toast.show('Error al exportar el reporte.', 'error');
    }
  }

  onFechaChange(valor: string): void {
    const limpio = (valor || '')
      .replace(/-/g, '/')
      .replace(/[^0-9/]/g, '')
      .slice(0, 10);
    this.fechaSeleccionada = limpio;
  }

  private parseFechaSeleccionada(valor: string): { inicio: Date; fin: Date } | null {
    const sep = valor.includes('/') ? '/' : valor.includes('-') ? '-' : '';
    if (!sep) return null;
    const partes = valor.split(sep);
    if (partes.length !== 3) return null;
    const dia = Number(partes[0]);
    const mes = Number(partes[1]);
    const anio = Number(partes[2]);
    if (!dia || !mes || !anio) return null;
    const inicio = new Date(anio, mes - 1, dia, 0, 0, 0, 0);
    const fin = new Date(anio, mes - 1, dia, 23, 59, 59, 999);
    return { inicio, fin };
  }

  solicitarEliminarVenta(v: Venta): void {
    this.ventaAEliminar = v;
    this.restockConfirm = true;
  }

  confirmarEliminarVenta(): void {
    const v = this.ventaAEliminar;
    if (!v || v.id == null || Number(v.id) <= 0) {
      this.toast.show('No se pudo identificar la venta a eliminar', 'error');
      this.ventaAEliminar = null;
      return;
    }
    const ok = this.db.eliminarVenta(Number(v.id), this.restockConfirm);
    if (!ok) {
      this.toast.show('No se pudo eliminar la venta', 'error');
      return;
    }
    this.toast.show('Venta eliminada', 'info');
    this.ventaAEliminar = null;
  }

  cancelarEliminarVenta(): void {
    this.ventaAEliminar = null;
  }

  aplicarDescuento(): void {
    const valor = Number(this.descuentoPct || 0);
    if (isNaN(valor)) {
      this.descuentoPct = 0;
      return;
    }
    this.descuentoPct = Math.min(100, Math.max(0, Math.round(valor)));
  }

  setDescuento(pct: number): void {
    this.descuentoPct = Math.min(100, Math.max(0, pct));
  }

  agregarVendedor(): void {
    const n = (this.nuevoVendedorNombre || '').trim();
    if (!n) return;
    const ok = this.db.agregarVendedor(n);
    if (ok) {
      this.toast.show('Vendedor agregado', 'success');
      this.nuevoVendedorNombre = '';
    } else {
      this.toast.show('El vendedor ya existe o es inválido', 'warning');
    }
  }

  eliminarVendedor(nombre: string): void {
    const ok = this.db.eliminarVendedor(nombre);
    if (ok) {
      this.toast.show('Vendedor eliminado', 'info');
      if (this.vendedor === nombre) {
        this.vendedor = this.vendedores[0] || 'Vendedor 1';
      }
    } else {
      this.toast.show('No se pudo eliminar', 'warning');
    }
  }

  

  async imprimirTicketVenta(v: Venta): Promise<void> {
    try {
      const api = (window as any)?.electronAPI;
      if (!api?.escposPrint) { this.toast.show('Impresora térmica no disponible en escritorio', 'warning'); return; }
      const venta = { ...v } as Venta & { redondeo?: number };
      if (!(venta as any).redondeo || Number(venta.redondeo) <= 0) {
        const productos = (venta.productos || []);
        const subtotal = productos.reduce((acc, p: any) => acc + Math.round(Number(p.subtotal || (Number(p.cantidad || 0) * Number(p.precioUnitario || 0)))), 0);
        let descuento = 0;
        if (venta.descuentoPct && venta.descuentoPct > 0) {
          descuento = Math.round((subtotal * Number(venta.descuentoPct)) / 100);
        } else if (venta.descuentoMonto && venta.descuentoMonto > 0) {
          descuento = Math.round(Number(venta.descuentoMonto));
        }
        const base = Math.max(0, subtotal - descuento);
        const resto50 = base % 50;
        venta.redondeo = resto50 === 0 ? 0 : (50 - resto50);
        const totalCalc = Math.max(0, Math.round(base + (venta.redondeo || 0)));
        if (Math.abs(Number(venta.total || 0) - totalCalc) > 1) {
          venta.total = totalCalc;
        }
      }
      const fecha = venta.fecha instanceof Date ? venta.fecha : new Date(venta.fecha);
      const two = (n:number)=>String(n).padStart(2,'0');
      const fechaStr = `${two(fecha.getDate())}/${two(fecha.getMonth()+1)}/${fecha.getFullYear()} ${two(fecha.getHours())}:${two(fecha.getMinutes())}`;
      // Preparar ítems ajustando subtotales si hay totalManual para que sumen al total deseado
      const baseItems = (venta.productos||[]).map((p:any)=>({ cantidad: p.cantidad, detalle: p.nombre, precio: p.precioUnitario, subtotal: Math.round(Number(p.subtotal)) }));
      const subtotalSinDescuento = baseItems.reduce((acc, it) => acc + Math.round(Number(it.subtotal || 0)), 0);
      const payload = {
        negocio: { nombre: BRAND.nombre },
        fecha: fechaStr,
        numero: venta.numeroTicket,
        vendedor: venta.vendedor,
        items: baseItems,
        subtotalSinDescuento,
        total: Math.max(0, Math.round(Number(venta.total || 0))),
        redondeo: Number((venta as any).redondeo || 0),
        descuentoPct: Number(venta.descuentoPct || 0),
        descuentoMonto: Number(venta.descuentoMonto || 0),
        aplicarRedondeo: Number((venta as any).totalManual || 0) > 0 ? false : (Number((venta as any).redondeo || 0) > 0)
      };
      this.toast.show('Enviando a impresora térmica...', 'info');
      const res = await api.escposPrint(payload);
      if (res?.ok) this.toast.show('Ticket impreso'); else this.toast.show(`No se pudo imprimir: ${res?.error || 'desconocido'}`, 'error');
    } catch (e:any) {
      this.toast.show('Error de impresión', 'error');
    }
  }

  
}