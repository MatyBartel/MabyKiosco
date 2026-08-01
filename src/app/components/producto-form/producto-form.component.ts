import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DatabaseService, Producto, TipoVenta } from '../../services/database.service';
import { BarcodeScannerService } from '../../services/barcode-scanner.service';
import { ToastService } from '../../services/toast.service';
import { IconComponent } from '../icon/icon.component';
import { LOGOS } from '../../config/logos.config';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-producto-form',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './producto-form.component.html',
  styleUrls: ['./producto-form.component.scss']
})
export class ProductoFormComponent implements OnInit, OnChanges, OnDestroy {
  logos = LOGOS;
  @Input() productoId: number | null = null;
  @Output() cerrar = new EventEmitter<void>();
  @Output() guardado = new EventEmitter<void>();

  db = inject(DatabaseService);
  private toast = inject(ToastService);
  private barcodeScanner = inject(BarcodeScannerService);

  readonly tiposVenta: { value: TipoVenta; label: string }[] = [
    { value: 'unidad', label: 'Por unidad' },
    { value: 'kg', label: 'Por kilo' },
  ];

  categorias: string[] = [];
  proveedoresLista: string[] = [];
  nuevaCategoriaNombre = '';
  nuevoProveedorNombre = '';
  mostrarModalCategorias = false;
  mostrarModalProveedores = false;
  mostrarModalEscanner = false;
  escaneoTemporal = '';

  codigo = '';
  codigoBarras = '';
  nombre = '';
  categoria = '';
  precioCosto: number | null = null;
  porcentajeGanancia: number | null = 30;
  precio: number | null = null;
  tipoVenta: TipoVenta = 'unidad';
  descripcion = '';
  stock: number | null = null;
  stockMinimo: number | null = 0;
  proveedor = '';

  private categoriasSub?: Subscription;
  private proveedoresSub?: Subscription;
  private recalculando = false;
  private escaneoTimer?: ReturnType<typeof setTimeout>;
  private codigoBarrasTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.categoriasSub = this.db.getCategorias().subscribe(cats => {
      this.categorias = cats;
    });
    this.proveedoresSub = this.db.getProveedoresLista().subscribe(provs => {
      this.proveedoresLista = provs;
    });
  }

  ngOnInit(): void {
    this.inicializarFormulario();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['productoId']) {
      this.inicializarFormulario();
    }
  }

  ngOnDestroy(): void {
    this.categoriasSub?.unsubscribe();
    this.proveedoresSub?.unsubscribe();
    clearTimeout(this.escaneoTimer);
    clearTimeout(this.codigoBarrasTimer);
  }

  get categoriasParaSelect(): string[] {
    const actual = (this.categoria || '').trim();
    if (!actual) return this.categorias;
    const existe = this.categorias.some(c => c.toLowerCase() === actual.toLowerCase());
    return existe ? this.categorias : [actual, ...this.categorias];
  }

  get proveedoresParaSelect(): string[] {
    const actual = (this.proveedor || '').trim();
    if (!actual) return this.proveedoresLista;
    const existe = this.proveedoresLista.some(p => p.toLowerCase() === actual.toLowerCase());
    return existe ? this.proveedoresLista : [actual, ...this.proveedoresLista];
  }

  get tituloFormulario(): string {
    return this.productoId ? 'Editar producto' : 'Agregar producto';
  }

  get etiquetaPrecio(): string {
    if (this.tipoVenta === 'kg') return 'Precio de venta ($/kg)*';
    return 'Precio de venta*';
  }

  get etiquetaStock(): string {
    if (this.tipoVenta === 'kg') return 'Stock inicial (kg)';
    return 'Stock inicial';
  }

  get stockStep(): string {
    return this.tipoVenta === 'unidad' ? '1' : '0.001';
  }

  private inicializarFormulario(): void {
    this.mostrarModalCategorias = false;
    this.mostrarModalProveedores = false;
    this.cerrarModalEscanner();
    if (this.productoId) {
      const p = this.db.getProductoById(this.productoId);
      if (!p) {
        this.toast.show('Producto no encontrado', 'warning');
        this.cancelar();
        return;
      }
      this.codigo = p.codigo;
      this.codigoBarras = p.codigoBarras || '';
      this.nombre = p.nombre;
      this.categoria = p.categoria;
      this.precioCosto = p.precioCosto;
      this.porcentajeGanancia = p.porcentajeGanancia;
      this.precio = p.precio;
      this.tipoVenta = p.tipoVenta === 'kg' ? 'kg' : 'unidad';
      this.descripcion = p.descripcion;
      this.stock = p.stock;
      this.stockMinimo = p.stockMinimo;
      this.proveedor = p.proveedor;
      return;
    }

    this.resetNuevo();
  }

  private resetNuevo(): void {
    this.codigo = '';
    this.codigoBarras = '';
    this.nombre = '';
    this.categoria = '';
    this.precioCosto = null;
    this.porcentajeGanancia = 30;
    this.precio = null;
    this.tipoVenta = 'unidad';
    this.descripcion = '';
    this.stock = null;
    this.stockMinimo = 0;
    this.proveedor = '';
  }

  onCostoChange(): void {
    if (this.recalculando) return;
    this.recalcularPrecioVenta();
  }

  onPorcentajeChange(): void {
    if (this.recalculando) return;
    this.recalcularPrecioVenta();
  }

  onPrecioChange(): void {
    if (this.recalculando) return;
    this.recalcularPorcentaje();
  }

  private recalcularPrecioVenta(): void {
    if (this.precioCosto == null || this.porcentajeGanancia == null) return;
    this.recalculando = true;
    this.precio = this.db.calcularPrecioVenta(this.precioCosto, this.porcentajeGanancia);
    this.recalculando = false;
  }

  private recalcularPorcentaje(): void {
    if (this.precioCosto == null || this.precio == null || this.precioCosto <= 0) return;
    this.recalculando = true;
    this.porcentajeGanancia = Number((((this.precio / this.precioCosto) - 1) * 100).toFixed(2));
    this.recalculando = false;
  }

  abrirModalCategorias(): void {
    this.nuevaCategoriaNombre = '';
    this.mostrarModalCategorias = true;
    setTimeout(() => document.getElementById('inputNuevaCategoriaModal')?.focus(), 0);
  }

  cerrarModalCategorias(): void {
    this.mostrarModalCategorias = false;
    this.nuevaCategoriaNombre = '';
  }

  agregarCategoriaDesdeModal(): void {
    const nombre = (this.nuevaCategoriaNombre || '').trim();
    if (!nombre) {
      this.toast.show('Escribí un nombre para la categoría.', 'warning');
      return;
    }
    const yaExiste = this.categorias.some(c => c.toLowerCase() === nombre.toLowerCase());
    if (yaExiste) {
      this.toast.show('Esa categoría ya existe.', 'warning');
      return;
    }
    this.db.agregarCategoria(nombre);
    this.categoria = nombre;
    this.nuevaCategoriaNombre = '';
    this.toast.show('Categoría agregada', 'success');
  }

  async eliminarCategoriaDesdeModal(nombre: string): Promise<void> {
    const n = (nombre || '').trim();
    if (!n) return;

    const cantidad = this.db.countProductosPorCategoria(n);
    const mensaje = cantidad > 0
      ? `¿Eliminar la categoría "${n}"?\n\nHay ${cantidad} producto(s) con esta categoría. No se borrarán: solo se quita de la lista.`
      : `¿Eliminar la categoría "${n}"?`;

    const ok = await this.toast.confirm(mensaje, 'warning');
    if (!ok) return;

    const eliminada = this.db.eliminarCategoria(n);
    if (!eliminada) {
      this.toast.show('No se pudo eliminar la categoría.', 'error');
      return;
    }

    if (this.categoria.toLowerCase() === n.toLowerCase()) {
      this.categoria = '';
    }
    this.toast.show('Categoría eliminada de la lista', 'info');
  }

  abrirModalProveedores(): void {
    this.nuevoProveedorNombre = '';
    this.mostrarModalProveedores = true;
    setTimeout(() => document.getElementById('inputNuevoProveedorModal')?.focus(), 0);
  }

  cerrarModalProveedores(): void {
    this.mostrarModalProveedores = false;
    this.nuevoProveedorNombre = '';
  }

  agregarProveedorDesdeModal(): void {
    const nombre = (this.nuevoProveedorNombre || '').trim();
    if (!nombre) {
      this.toast.show('Escribí un nombre para el proveedor.', 'warning');
      return;
    }
    const yaExiste = this.proveedoresLista.some(p => p.toLowerCase() === nombre.toLowerCase());
    if (yaExiste) {
      this.toast.show('Ese proveedor ya existe.', 'warning');
      return;
    }
    this.db.agregarProveedorLista(nombre);
    this.proveedor = nombre;
    this.nuevoProveedorNombre = '';
    this.toast.show('Proveedor agregado', 'success');
  }

  async eliminarProveedorDesdeModal(nombre: string): Promise<void> {
    const n = (nombre || '').trim();
    if (!n) return;

    const cantidad = this.db.countProductosPorProveedor(n);
    const mensaje = cantidad > 0
      ? `¿Eliminar el proveedor "${n}"?\n\nHay ${cantidad} producto(s) con este proveedor. No se borrarán: solo se quita de la lista.`
      : `¿Eliminar el proveedor "${n}"?`;

    const ok = await this.toast.confirm(mensaje, 'warning');
    if (!ok) return;

    const eliminado = this.db.eliminarProveedorLista(n);
    if (!eliminado) {
      this.toast.show('No se pudo eliminar el proveedor.', 'error');
      return;
    }

    if (this.proveedor.toLowerCase() === n.toLowerCase()) {
      this.proveedor = '';
    }
    this.toast.show('Proveedor eliminado de la lista', 'info');
  }

  abrirModalEscanner(): void {
    this.escaneoTemporal = this.codigoBarras || '';
    this.mostrarModalEscanner = true;
    setTimeout(() => {
      const input = document.getElementById('inputEscaneoBarras') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    }, 80);
  }

  cerrarModalEscanner(): void {
    this.mostrarModalEscanner = false;
    this.escaneoTemporal = '';
    clearTimeout(this.escaneoTimer);
  }

  onEscaneoInput(): void {
    clearTimeout(this.escaneoTimer);
    this.escaneoTimer = setTimeout(() => this.procesarEscaneo(true), 140);
  }

  onEscaneoEnter(event: Event): void {
    event.preventDefault();
    clearTimeout(this.escaneoTimer);
    this.procesarEscaneo(false);
  }

  procesarEscaneo(soloAuto = false): void {
    const code = this.barcodeScanner.codigoParaBusqueda(this.escaneoTemporal);
    if (!code) return;

    if (!this.barcodeScanner.esCodigoValido(code)) {
      if (!soloAuto) {
        this.toast.show('El código leído no parece válido.', 'warning');
      }
      return;
    }

    if (this.esCodigoBarrasDuplicado(code)) {
      return;
    }

    this.codigoBarras = code;
    this.cerrarModalEscanner();
    this.toast.show(`Código leído: ${code}`, 'success');
  }

  onCodigoBarrasChange(valor: string): void {
    clearTimeout(this.codigoBarrasTimer);
    const code = this.barcodeScanner.codigoParaBusqueda(valor);
    if (!code || code.length < 4) return;
    this.codigoBarrasTimer = setTimeout(() => this.validarCodigoBarrasDuplicado(), 350);
  }

  validarCodigoBarrasDuplicado(): boolean {
    const barras = this.barcodeScanner.codigoParaBusqueda(this.codigoBarras);
    if (!barras) return true;
    return !this.esCodigoBarrasDuplicado(barras);
  }

  private esCodigoBarrasDuplicado(code: string): boolean {
    const normalizado = this.barcodeScanner.codigoParaBusqueda(code);
    const duplicado = this.db.productoConCodigoDuplicado(normalizado, this.productoId);
    if (!duplicado) return false;
    this.toast.show(`Ya existe un producto con ese código (${duplicado.nombre}).`, 'error');
    if (this.barcodeScanner.codigosEquivalentes(this.codigoBarras, normalizado)) {
      this.codigoBarras = '';
    }
    this.escaneoTemporal = '';
    return true;
  }

  guardar(): void {
    if (!this.nombre?.trim() || !this.categoria?.trim()) {
      this.toast.show('Completá nombre y categoría.', 'error');
      return;
    }
    if (this.precioCosto == null || this.precioCosto < 0) {
      this.toast.show('Ingresá un precio de costo válido.', 'error');
      return;
    }
    if (this.porcentajeGanancia == null) {
      this.toast.show('Ingresá el porcentaje de ganancia.', 'error');
      return;
    }
    if (this.precio == null || this.precio <= 0) {
      this.toast.show('El precio de venta debe ser mayor a cero.', 'error');
      return;
    }

    const barras = this.codigoBarras.trim();
    if (barras && this.esCodigoBarrasDuplicado(barras)) {
      return;
    }

    const producto: Producto = {
      codigo: this.productoId ? this.codigo.trim() : (barras || this.db.generarCodigoInterno()),
      codigoBarras: barras || undefined,
      nombre: this.nombre.trim(),
      descripcion: this.descripcion.trim(),
      precioCosto: Number(this.precioCosto),
      porcentajeGanancia: Number(this.porcentajeGanancia),
      precio: Number(this.precio),
      tipoVenta: this.tipoVenta,
      stock: Number(this.stock || 0),
      stockMinimo: Number(this.stockMinimo || 0),
      categoria: this.categoria.trim(),
      proveedor: this.proveedor.trim(),
      fechaCreacion: new Date(),
    };

    if (this.productoId) {
      producto.id = this.productoId;
      producto.codigo = this.codigo.trim();
      const original = this.db.getProductoById(this.productoId);
      if (original?.fechaCreacion) {
        producto.fechaCreacion = original.fechaCreacion;
      }
      this.db.actualizarProducto(producto);
      this.toast.show('Producto actualizado', 'success');
    } else {
      this.db.agregarProducto(producto);
      this.toast.show('Producto agregado', 'success');
    }
    this.guardado.emit();
  }

  cancelar(): void {
    this.cerrar.emit();
  }
}
