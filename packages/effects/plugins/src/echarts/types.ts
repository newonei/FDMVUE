import type {
  BarSeriesOption,
  HeatmapSeriesOption,
  LineSeriesOption,
  MapSeriesOption,
  PieSeriesOption,
  RadarSeriesOption,
  ScatterSeriesOption,
} from 'echarts/charts';
import type {
  DatasetComponentOption,
  DataZoomComponentOption,
  GeoComponentOption,
  GridComponentOption,
  LegendComponentOption,
  TitleComponentOption,
  ToolboxComponentOption,
  TooltipComponentOption,
  VisualMapComponentOption,
} from 'echarts/components';
import type { ComposeOption } from 'echarts/core';

export type ECOption = ComposeOption<
  | BarSeriesOption
  | DatasetComponentOption
  | DataZoomComponentOption
  | GeoComponentOption
  | GridComponentOption
  | HeatmapSeriesOption
  | LegendComponentOption
  | LineSeriesOption
  | MapSeriesOption
  | PieSeriesOption
  | RadarSeriesOption
  | ScatterSeriesOption
  | TitleComponentOption
  | ToolboxComponentOption
  | TooltipComponentOption
  | VisualMapComponentOption
>;
