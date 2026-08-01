import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, QueryList, ViewChildren } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DatabaseService, Producto, Venta } from '../../services/database.service';
import { Subscription } from 'rxjs';
import { BRAND } from '../../config/brand.config';
import { LOGOS } from '../../config/logos.config';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChildren('statMonto') statMontos!: QueryList<ElementRef<HTMLElement>>;

  brand = BRAND;
  logos = LOGOS;
  totalProductos = 0;
  totalVentasHoy = 0; 
  totalGastadoHoy = 0;
  productosBajoStock = 0;
  totalVentas = 0;
  productosBajoStockList: Producto[] = [];
  ultimasVentas: Venta[] = [];

  backupTitulo = 'Backup automático a las 12:00';
  backupDetalle = '';
  nubeDetectada: boolean | null = null;

  fechaSeleccionada = '';
  mostrarCalendario = false;
  private ventasSnapshot: Venta[] = [];

  private subscription = new Subscription();
  private resizeListener = () => this.ajustarMontos();

  constructor(private databaseService: DatabaseService) {}

  ngOnInit(): void {
    this.cargarDatos();
    this.cargarEstadoBackup();
  }

  ngAfterViewInit(): void {
    this.statMontos.changes.subscribe(() => this.ajustarMontos());
    this.ajustarMontos();
    window.addEventListener('resize', this.resizeListener);
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    window.removeEventListener('resize', this.resizeListener);
  }

  private ajustarMontos(): void {
    setTimeout(() => {
      requestAnimationFrame(() => {
        for (const ref of this.statMontos) {
          const el = ref.nativeElement;
          el.style.fontSize = '';
          let size = parseFloat(getComputedStyle(el).fontSize);
          const min = 11;
          while (el.scrollWidth > el.clientWidth && size > min) {
            size -= 0.5;
            el.style.fontSize = `${size}px`;
          }
        }
      });
    });
  }

  private cargarDatos(): void {
    this.subscription.add(
      this.databaseService.productos$.subscribe(productos => {
        this.totalProductos = productos.length;
        this.productosBajoStock = productos.filter(p => p.stockMinimo > 0 && p.stock <= p.stockMinimo).length;
        this.productosBajoStockList = productos
          .filter(p => p.stockMinimo > 0 && p.stock <= p.stockMinimo);
      })
    );

    this.subscription.add(
      this.databaseService.ventas$.subscribe(ventas => {
        this.ventasSnapshot = ventas;
        this.aplicarFiltroDia();
      })
    );

    this.subscription.add(
      this.databaseService.gastos$.subscribe(() => {
        this.aplicarFiltroDia();
      })
    );
  }

  get tituloVentasCard(): string {
    return this.fechaSeleccionada ? `Ventas del ${this.fechaSeleccionada}` : 'Ventas Hoy';
  }

  get tituloGastadoCard(): string {
    return this.fechaSeleccionada ? `Total Gastado del ${this.fechaSeleccionada}` : 'Total Gastado Hoy';
  }

  get tituloUltimas(): string {
    return this.fechaSeleccionada ? 'Últimas Ventas del día' : 'Últimas Ventas';
  }

  get dataFolderTitle(): string {
    const base = `Abrir carpeta de datos (Documentos/${BRAND.dataDir}/datos/${BRAND.dbFile})`;
    return this.backupDetalle ? `${base}\n${this.backupDetalle}` : base;
  }

  private async cargarEstadoBackup(): Promise<void> {
    const electronAPI: any = (window as any)?.electronAPI;
    if (!electronAPI?.backupGetStatus) return;
    try {
      const res = await electronAPI.backupGetStatus();
      if (!res?.ok || !res.status) return;
      const s = res.status;
      const partes: string[] = [`Backup diario: ${s.scheduledTime || '12:00'}`];
      if (s.lastLocalBackup) {
        const fecha = new Date(s.lastLocalBackup);
        partes.push(`Último: ${fecha.toLocaleString('es-AR')}`);
      } else {
        partes.push('Último: pendiente');
      }
      this.nubeDetectada = !!s.cloudDetected;
      this.backupDetalle = partes.join(' · ');
    } catch {}
  }

  onFechaChangeDesdeDate(value: string): void {
    if (!value) {
      this.fechaSeleccionada = '';
    } else {
      const [y, m, d] = value.split('-');
      this.fechaSeleccionada = `${d}/${m}/${y}`;
    }
    this.mostrarCalendario = false;
    this.aplicarFiltroDia();
  }

  limpiarFecha(): void {
    this.fechaSeleccionada = '';
    this.aplicarFiltroDia();
  }

  private aplicarFiltroDia(): void {
    const ventas = this.ventasSnapshot || [];
    let inicio: Date;
    let fin: Date;
    if (this.fechaSeleccionada) {
      const [d, m, y] = this.fechaSeleccionada.split('/').map(n => Number(n));
      inicio = new Date(y, m - 1, d, 0, 0, 0, 0);
      fin = new Date(y, m - 1, d, 23, 59, 59, 999);
    } else {
      const hoy = new Date();
      inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0, 0);
      fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59, 999);
    }

    const delDia = ventas.filter(v => v.fecha >= inicio && v.fecha <= fin);
    this.totalVentas = delDia.length;
    this.totalVentasHoy = delDia.reduce((acc, v) => acc + v.total, 0);
    this.totalGastadoHoy = this.databaseService.getTotalGastosEnRango(inicio, fin);
    this.ultimasVentas = delDia
      .slice()
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      .slice(0, 5);
    this.ajustarMontos();
  }

  nuevoProducto(): void {
    alert('Función de Nuevo Producto - En desarrollo');
  }

  nuevaVenta(): void {
    alert('Función de Nueva Venta - En desarrollo');
  }

  gestionarProductos(): void {
    alert('Función de Gestionar Productos - En desarrollo');
  }

  verVentas(): void {
    alert('Función de Ver Ventas - En desarrollo');
  }

  async abrirCarpetaDatos(): Promise<void> {
    const electronAPI: any = (window as any)?.electronAPI;
    if (electronAPI?.openDataFolder) {
      await electronAPI.openDataFolder();
    }
  }
}
