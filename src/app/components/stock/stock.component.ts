import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../icon/icon.component';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { DatabaseService, Producto, TipoVenta } from '../../services/database.service';
import { ToastService } from '../../services/toast.service';
import { ProductoFormComponent } from '../producto-form/producto-form.component';
import { LOGOS } from '../../config/logos.config';

@Component({
  selector: 'app-stock',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, IconComponent, ProductoFormComponent],
  templateUrl: './stock.component.html',
  styleUrls: ['./stock.component.scss']
})
export class StockComponent implements OnInit, OnDestroy {
  logos = LOGOS;
  productos: Producto[] = [];
  filtroGeneral = '';
  ordenCampo: 'codigo' | 'nombre' | 'categoria' | 'proveedor' | 'precio' | 'stock' = 'nombre';
  ordenAsc = true;
  categorias: string[] = [];
  categoriaFiltro: string = '';
  private sub?: Subscription;
  private subCategorias?: Subscription;
  productoDetalle: Producto | null = null;
  productoAEliminar: Producto | null = null;
  mostrarFormProducto = false;
  productoFormId: number | null = null;

  showMassPrice = false;
  seleccionados = new Set<number>();
  categoriaAumento = '';
  ajusteGananciaPct = 0;
  page = 1;
  pageSize = 10;

  loading: { visible: boolean; done: boolean; title: string; summary: any } = {
    visible: false,
    done: false,
    title: '',
    summary: {}
  };

  constructor(
    private db: DatabaseService,
    private toast: ToastService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.sub = this.db.getProductos().subscribe(items => {
      this.productos = items;
    });
    this.subCategorias = this.db.getCategorias().subscribe(list => {
      this.categorias = list;
    });

    this.route.queryParamMap.subscribe(params => {
      const editar = params.get('editar');
      if (editar) {
        const id = Number(editar);
        if (!Number.isNaN(id)) {
          this.abrirEditarProducto(id);
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.subCategorias?.unsubscribe();
  }

  trackByProducto(_idx: number, p: Producto): number | string {
    return p.id || p.codigo;
  }

  setOrden(campo: 'codigo' | 'nombre' | 'categoria' | 'proveedor' | 'precio' | 'stock'): void {
    if (this.ordenCampo === campo) {
      this.ordenAsc = !this.ordenAsc;
    } else {
      this.ordenCampo = campo;
      this.ordenAsc = true;
    }
  }

  get productosFiltrados(): Producto[] {
    const term = (this.filtroGeneral || '').toLowerCase();
    let arr = this.productos.filter(p =>
      p.codigo.toLowerCase().includes(term) ||
      p.nombre.toLowerCase().includes(term) ||
      p.categoria.toLowerCase().includes(term) ||
      (p.proveedor || '').toLowerCase().includes(term) ||
      (p.codigoBarras || '').toLowerCase().includes(term)
    );

    if (this.categoriaFiltro) {
      arr = arr.filter(p => p.categoria === this.categoriaFiltro);
    }

    return arr.sort((a, b) => {
      const campo = this.ordenCampo;
      let va: any = (a as any)[campo];
      let vb: any = (b as any)[campo];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      const comp = va < vb ? -1 : va > vb ? 1 : 0;
      return this.ordenAsc ? comp : -comp;
    });
  }

  get productosVista(): Producto[] {
    const arr = this.productosFiltrados;
    const total = arr.length;
    const maxPage = Math.max(1, Math.ceil(total / this.pageSize));
    if (this.page > maxPage) this.page = maxPage;
    const start = (this.page - 1) * this.pageSize;
    return arr.slice(start, start + this.pageSize);
  }

  get totalFiltrados(): number {
    return this.productosFiltrados.length;
  }

  setPageSize(size: number): void {
    this.pageSize = Math.max(10, Math.min(500, Math.trunc(size)));
    this.page = 1;
  }

  goToPage(p: number): void {
    const max = Math.max(1, Math.ceil(this.totalFiltrados / this.pageSize));
    this.page = Math.max(1, Math.min(max, Math.trunc(p)));
  }

  get paginaDesde(): number {
    if (this.totalFiltrados === 0) return 0;
    return (this.page - 1) * this.pageSize + 1;
  }

  get paginaHasta(): number {
    const fin = this.page * this.pageSize;
    return fin > this.totalFiltrados ? this.totalFiltrados : fin;
  }

  solicitarEliminar(p: Producto): void {
    this.productoAEliminar = p;
  }

  cancelarEliminar(): void {
    this.productoAEliminar = null;
  }

  confirmarEliminar(): void {
    const p = this.productoAEliminar;
    if (!p || !p.id) { this.productoAEliminar = null; return; }
    this.db.eliminarProducto(p.id);
    this.productoAEliminar = null;
    this.toast.show('Producto eliminado', 'info');
  }

  async eliminarSeleccionados(): Promise<void> {
    if (!this.seleccionados.size) return;
    const ok = await this.toast.confirm(`¿Eliminar ${this.seleccionados.size} producto(s) seleccionados?`, 'warning');
    if (!ok) { this.toast.show('Operación cancelada', 'info'); return; }
    const ids = Array.from(this.seleccionados.values());
    for (const id of ids) {
      this.db.eliminarProducto(id);
    }
    this.seleccionados.clear();
    this.toast.show(`Eliminados ${ids.length} producto(s).`, 'info');
  }

  getCosto(p: Producto): number {
    return p.precioCosto ?? 0;
  }

  getGananciaPct(p: Producto): number {
    return p.porcentajeGanancia ?? 0;
  }

  etiquetaTipoVenta(tipo: TipoVenta): string {
    if (tipo === 'kg') return 'Por kilo';
    return 'Por unidad';
  }

  etiquetaStock(p: Producto): string {
    if (p.tipoVenta === 'kg') return `${p.stock} kg`;
    return String(p.stock);
  }

  esFraccionable(p: Producto): boolean {
    return p.tipoVenta === 'kg';
  }

  verInfo(p: Producto): void {
    this.productoDetalle = p;
  }

  cerrarInfo(): void {
    this.productoDetalle = null;
  }

  toggleSeleccion(id?: number): void {
    if (!id) return;
    if (this.seleccionados.has(id)) this.seleccionados.delete(id); else this.seleccionados.add(id);
  }

  seleccionarTodosVista(): void {
    for (const p of this.productosVista) {
      if (p.id) this.seleccionados.add(p.id);
    }
  }

  limpiarSeleccion(): void {
    this.seleccionados.clear();
  }

  async aplicarAumento(): Promise<void> {
    const porSeleccion = this.seleccionados.size > 0;
    const porCategoria = !!this.categoriaAumento;

    const delta = Number(this.ajusteGananciaPct);
    if (!isFinite(delta) || delta === 0) {
      this.toast.show('Ingresá un ajuste de ganancia válido (distinto de 0).', 'error');
      return;
    }

    const afectadas: Producto[] = [];
    this.startLoading('Aplicando cambios');
    await new Promise(r => setTimeout(r));

    const candidatos = porSeleccion || porCategoria
      ? this.productos
      : this.productosFiltrados;

    for (const p of candidatos) {
      const matchSel = porSeleccion && p.id ? this.seleccionados.has(p.id) : false;
      const matchCat = porCategoria ? p.categoria === this.categoriaAumento : false;
      const aplicar = (porSeleccion && matchSel) || (porCategoria && matchCat) || (!porSeleccion && !porCategoria);
      if (!aplicar) continue;

      const pctActual = Number(p.porcentajeGanancia) || 0;
      const nuevoPct = Math.max(0, Number((pctActual + delta).toFixed(2)));
      const nuevoPrecio = this.db.calcularPrecioVenta(p.precioCosto, nuevoPct);
      afectadas.push({
        ...p,
        porcentajeGanancia: nuevoPct,
        precio: nuevoPrecio,
      });
    }

    if (!afectadas.length) {
      this.toast.show('No hay productos que coincidan con la selección.', 'warning');
      this.cerrarLoading();
      return;
    }

    const count = this.db.actualizarProductosEnBloquePorId(afectadas);
    const scopeTxt = porSeleccion ? 'seleccionados' : (porCategoria ? `categoría "${this.categoriaAumento}"` : 'productos filtrados');
    const signo = delta > 0 ? '+' : '';
    this.toast.show(`% ganancia ajustado (${signo}${delta} pts en ${count} productos, ${scopeTxt}).`);
    this.showMassPrice = false;
    this.limpiarSeleccion();
    this.finishLoadingSuccess({ modificados: count });
  }

  onStockChange(p: Producto, value: any): void {
    const raw = String(value ?? '');
    const num = Number(raw.replace(/[^0-9.-]/g, '').replace(',', '.'));
    if (isNaN(num)) {
      p.stock = 0;
      return;
    }
    p.stock = this.esFraccionable(p)
      ? Math.max(0, Number(num.toFixed(3)))
      : Math.max(0, Math.trunc(num));
  }

  onStockBlur(p: Producto): void {
    const val = this.esFraccionable(p)
      ? Math.max(0, Number(Number(p.stock || 0).toFixed(3)))
      : Math.max(0, Math.trunc(Number(p.stock || 0)));
    if (p.stock !== val) p.stock = val;
    this.db.actualizarProducto(p);
  }

  private startLoading(title: string): void {
    this.loading = { visible: true, done: false, title, summary: {} };
  }

  private finishLoadingSuccess(summary: any): void {
    this.loading = { ...this.loading, done: true, summary };
  }

  cerrarLoading(): void {
    this.loading = { visible: false, done: false, title: '', summary: {} };
  }

  abrirAgregarProducto(): void {
    this.productoFormId = null;
    this.mostrarFormProducto = true;
    this.limpiarQueryEditar();
  }

  abrirEditarProducto(id: number): void {
    this.productoFormId = id;
    this.mostrarFormProducto = true;
    this.cerrarInfo();
  }

  cerrarFormProducto(): void {
    this.mostrarFormProducto = false;
    this.productoFormId = null;
    this.limpiarQueryEditar();
  }

  private limpiarQueryEditar(): void {
    if (this.route.snapshot.queryParamMap.has('editar')) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { editar: null },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    }
  }
}
