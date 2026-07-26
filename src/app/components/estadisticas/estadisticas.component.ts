import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DatabaseService, Venta } from '../../services/database.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-estadisticas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './estadisticas.component.html',
  styleUrls: ['./estadisticas.component.scss']
})
export class EstadisticasComponent implements OnInit, AfterViewInit, OnDestroy {
  ventasMes: Venta[] = [];
  cantidadVentasMes = 0;
  productoMasVendido = '';
  cantidadProductoMasVendido = 0;
  stockProductoMasVendido = 0;
  productoMasVendidoId?: number;
  totalMes = 0;
  totalGastosMes = 0;
  valorStockTotal = 0;
  unidadesVendidasMes = 0;
  ticketPromedio = 0;
  ingresosPorDiaSemana: { dia: string; total: number }[] = [];
  maxIngresoDiaSemana = 1;
  mejorDiaSemana = '';
  pagosMes: { metodo: string; total: number }[] = [];
  pagosUso: { metodo: string; count: number; percent: number }[] = [];
  horasConteo: number[] = Array(24).fill(0);
  horasPicoTop: { hora: string; count: number }[] = [];
  topProductosMes: { nombre: string; cantidad: number }[] = [];
  ventasPorVendedor: { vendedor: string; count: number; total: number }[] = [];

  pieOptions: any = {};
  areaOptions: any = {};
  areaStackOptions: any = {};

  @ViewChild('areaChart', { static: false }) set areaChartSetter(el: ElementRef<HTMLDivElement> | undefined) {
    this.areaChartRef = el;
    if (this.echartsLib && this.viewReady && el) {
      setTimeout(() => this.initOrUpdateCharts());
    }
  }
  @ViewChild('pieChart', { static: false }) set pieChartSetter(el: ElementRef<HTMLDivElement> | undefined) {
    this.pieChartRef = el;
    if (this.echartsLib && this.viewReady && el) {
      setTimeout(() => this.initOrUpdateCharts());
    }
  }
  private areaChartRef?: ElementRef<HTMLDivElement>;
  private pieChartRef?: ElementRef<HTMLDivElement>;
  private echartsLib: any;
  private areaInstance: any;
  private pieInstance: any;
  private areaStackInstance: any;
  private viewReady = false;
  private onResize = () => {
    try {
      this.areaInstance?.resize();
      this.pieInstance?.resize();
    } catch {}
  };

  meses = [
    'Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
  ];
  mesSeleccionado = new Date().getMonth();
  anioSeleccionado = new Date().getFullYear();
  anios: number[] = [];
  private subs: Array<{ unsubscribe(): void }> = [];

  constructor(private db: DatabaseService) {}

  ngOnInit(): void {
    const ahora = new Date();
    const base = ahora.getFullYear();
    this.anios = Array.from({ length: 6 }, (_, i) => base - i);
    this.subs.push(
      this.db.getVentas().subscribe(() => this.recalcular()),
      this.db.getGastos().subscribe(() => this.recalcular()),
      this.db.getProductos().subscribe(() => this.recalcular()),
    );
    this.recalcular();
  }

  async ngAfterViewInit(): Promise<void> {
    this.viewReady = true;
    if (!this.echartsLib) {
      this.echartsLib = await import('echarts');
    }
    this.initOrUpdateCharts();
    window.addEventListener('resize', this.onResize);
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.subs.forEach(s => s.unsubscribe());
    this.disposeCharts();
  }

  onPeriodoChange(): void {
    this.recalcular();
  }

  private recalcular(): void {
    const { inicio, fin } = this.db.getInicioFinMes(this.anioSeleccionado, this.mesSeleccionado);
    this.totalGastosMes = this.db.getTotalGastosEnRango(inicio, fin);
    this.valorStockTotal = this.db.getValorStockTotal();

    const ventas = this.db.getVentasActuales();
    this.ventasMes = ventas.filter(v => {
      const f = new Date(v.fecha);
      return f.getFullYear() === this.anioSeleccionado && f.getMonth() === this.mesSeleccionado;
    });
    this.cantidadVentasMes = this.ventasMes.length;
    this.totalMes = this.ventasMes.reduce((acc, v) => acc + v.total, 0);

    this.calcularIngresosPorDiaSemana();

    if (this.ventasMes.length === 0) {
      this.unidadesVendidasMes = 0;
      this.ticketPromedio = 0;
      this.productoMasVendido = '';
      this.cantidadProductoMasVendido = 0;
      this.stockProductoMasVendido = 0;
      this.productoMasVendidoId = undefined;
      this.pagosMes = [];
      this.pagosUso = [];
      this.horasConteo = Array(24).fill(0);
      this.horasPicoTop = [];
      this.topProductosMes = [];
      this.ventasPorVendedor = [];
      this.pieOptions = this.buildPieOptions();
      this.areaOptions = this.buildAreaOptions();
      if (this.echartsLib && this.viewReady) {
        setTimeout(() => this.initOrUpdateCharts());
      } else {
        this.disposeCharts();
      }
      return;
    }
    this.unidadesVendidasMes = this.ventasMes.reduce((acc, v) => acc + v.productos.reduce((a, p) => a + Number(p.cantidad || 0), 0), 0);
    this.ticketPromedio = this.cantidadVentasMes ? Number((this.totalMes / this.cantidadVentasMes).toFixed(2)) : 0;

    const mapaCant: Record<string, { id?: number; nombre: string; cantidad: number; codigo?: string }> = {};
    for (const v of this.ventasMes) {
      for (const vp of v.productos) {
        const key = (vp.productoId ? `id:${vp.productoId}` : `cod:${vp.codigo}`);
        if (!mapaCant[key]) mapaCant[key] = { id: vp.productoId, nombre: vp.nombre, cantidad: 0, codigo: vp.codigo };
        mapaCant[key].cantidad += Number(vp.cantidad || 0);
      }
    }
    const ranking = Object.values(mapaCant).sort((a, b) => b.cantidad - a.cantidad);
    if (ranking.length) {
      const top = ranking[0];
      this.productoMasVendido = top.nombre;
      this.cantidadProductoMasVendido = top.cantidad;
      this.productoMasVendidoId = top.id;
      if (this.productoMasVendidoId != null) {
        this.stockProductoMasVendido = this.db.getProductoById(this.productoMasVendidoId)?.stock ?? 0;
      } else {
        const prod = this.db.getProductosActuales?.() ? this.db.getProductosActuales!().find(p => p.codigo === top.codigo) : undefined;
        this.stockProductoMasVendido = prod?.stock ?? 0;
      }
      this.topProductosMes = ranking.slice(0, 5).map(r => ({ nombre: r.nombre, cantidad: r.cantidad }));
    } else {
      this.productoMasVendido = '';
      this.cantidadProductoMasVendido = 0;
      this.stockProductoMasVendido = 0;
      this.productoMasVendidoId = undefined;
      this.topProductosMes = [];
    }

    const pagosMap = new Map<string, number>();
    const pagosCountMap = new Map<string, number>();
    for (const v of this.ventasMes) {
      for (const p of v.pagos || []) {
        const k = (p.metodo || 'Desconocido').trim();
        pagosMap.set(k, (pagosMap.get(k) || 0) + Number(p.monto || 0));
        pagosCountMap.set(k, (pagosCountMap.get(k) || 0) + 1);
      }
    }
    this.pagosMes = Array.from(pagosMap.entries()).map(([metodo, total]) => ({ metodo, total: Number(total.toFixed(2)) }));
    const totalUso = Array.from(pagosCountMap.values()).reduce((a, b) => a + b, 0) || 1;
    this.pagosUso = Array.from(pagosCountMap.entries()).map(([metodo, count]) => ({ metodo, count, percent: Number(((count / totalUso) * 100).toFixed(2)) }));

    this.horasConteo = Array(24).fill(0);
    for (const v of this.ventasMes) {
      const h = v.fecha.getHours();
      this.horasConteo[h] += 1;
    }
    const horasIdx = Array.from({ length: 24 }, (_, i) => i);
    const top3 = horasIdx
      .map(i => ({ i, c: this.horasConteo[i] }))
      .sort((a, b) => b.c - a.c)
      .slice(0, 3);
    this.horasPicoTop = top3.map(t => ({ hora: `${t.i.toString().padStart(2,'0')}:00`, count: t.c }));

    const vendedorMap = new Map<string, { count: number; total: number }>();
    for (const v of this.ventasMes) {
      const vend = (v.vendedor || 'Sin asignar').trim();
      const cur = vendedorMap.get(vend) || { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(v.total || 0);
      vendedorMap.set(vend, cur);
    }
    this.ventasPorVendedor = Array.from(vendedorMap.entries())
      .map(([vendedor, { count, total }]) => ({ vendedor, count, total: Number(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);

    this.pieOptions = this.buildPieOptions();
    this.areaOptions = this.buildAreaOptions();
    this.areaStackOptions = undefined;

    if (this.echartsLib && this.viewReady) {
      setTimeout(() => this.initOrUpdateCharts());
    }
  }

  private calcularIngresosPorDiaSemana(): void {
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const totals: number[] = Array(7).fill(0);
    for (const v of this.ventasMes) {
      totals[new Date(v.fecha).getDay()] += Number(v.total || 0);
    }
    this.maxIngresoDiaSemana = Math.max(1, ...totals);
    this.ingresosPorDiaSemana = dias.map((d, i) => ({ dia: d, total: Number(totals[i].toFixed(2)) }));
    const mejor = this.ingresosPorDiaSemana.reduce((a, b) => (b.total > a.total ? b : a), { dia: '-', total: 0 });
    this.mejorDiaSemana = mejor.total > 0 ? mejor.dia : '';
  }

  private buildPieOptions(): any {
    const data = this.pagosUso.map(p => ({ value: p.percent, name: p.metodo }));
    return {
      tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
      series: [
        {
          name: 'Métodos de pago',
          type: 'pie',
          radius: ['32%', '78%'],
          padAngle: 3,
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: { show: true, formatter: '{b}\n{d}%' },
          data
        }
      ]
    };
  }

  private buildAreaOptions(): any {
    const dias = this.ingresosPorDiaSemana.map(d => d.dia);
    const valores = this.ingresosPorDiaSemana.map(d => d.total);
    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          const val = Number(p?.value || 0);
          return `${p?.axisValue || ''}<br/>Ingresos: $${val.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
      },
      xAxis: { type: 'category', data: dias, boundaryGap: false },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: (v: number) => `$${Math.round(v).toLocaleString('es-AR')}`
        }
      },
      grid: { left: 8, right: 12, top: 16, bottom: 8, containLabel: true },
      series: [
        {
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          areaStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(52, 152, 219, 0.35)' },
                { offset: 1, color: 'rgba(52, 152, 219, 0.05)' }
              ]
            }
          },
          lineStyle: { width: 3, color: '#FF9933' },
          data: valores
        }
      ]
    };
  }

  private buildAreaStackOptions(): any {
    const daysInMonth = new Date(this.anioSeleccionado, this.mesSeleccionado + 1, 0).getDate();
    const dias = Array.from({ length: daysInMonth }, (_, i) => (i + 1).toString().padStart(2, '0'));

    const topMetodos = [...this.pagosMes]
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)
      .map(p => p.metodo);

    const metodoToDaily: Record<string, number[]> = {};
    for (const m of topMetodos) metodoToDaily[m] = Array(daysInMonth).fill(0);
    for (const v of this.ventasMes) {
      const d = v.fecha.getDate() - 1;
      for (const p of v.pagos || []) {
        const m = (p.metodo || 'Desconocido').trim();
        if (metodoToDaily[m]) {
          metodoToDaily[m][d] += Number(p.monto || 0);
        }
      }
    }

    const palette = ['#FF9933', '#10b981', '#E07A28'];
    const series = topMetodos.map((m, idx) => ({
      name: m,
      type: 'line',
      stack: 'total',
      smooth: true,
      symbolSize: 6,
      lineStyle: { width: 2, color: palette[idx % palette.length] },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: palette[idx % palette.length] + '99' },
            { offset: 1, color: palette[idx % palette.length] + '10' }
          ]
        }
      },
      data: metodoToDaily[m].map(v => Number(v.toFixed(2)))
    }));

    return {
      tooltip: { trigger: 'axis' },
      legend: { data: topMetodos },
      grid: { left: 8, right: 12, top: 28, bottom: 8, containLabel: true },
      xAxis: { type: 'category', boundaryGap: false, data: dias },
      yAxis: { type: 'value' },
      series
    };
  }

  private initOrUpdateCharts(): void {
    if (!this.echartsLib) return;
    const areaEl = this.areaChartRef?.nativeElement;
    const pieEl = this.pieChartRef?.nativeElement;
    const areaStackEl = null;
    if (areaEl) {
      this.areaInstance = this.areaInstance || this.echartsLib.init(areaEl);
      this.areaInstance.setOption(this.areaOptions, true);
    }
    if (pieEl) {
      this.pieInstance = this.pieInstance || this.echartsLib.init(pieEl);
      this.pieInstance.setOption(this.pieOptions, true);
    }
  }

  private disposeCharts(): void {
    try { this.areaInstance?.dispose(); } catch {}
    try { this.pieInstance?.dispose(); } catch {}
    this.areaInstance = undefined as any;
    this.pieInstance = undefined as any;
  }
}