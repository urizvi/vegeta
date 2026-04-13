declare module 'react-simple-maps' {
  import { ComponentType, ReactNode, SVGProps, CSSProperties, Ref } from 'react';

  export interface ComposableMapProps {
    projection?: string;
    projectionConfig?: Record<string, unknown>;
    width?: number;
    height?: number;
    style?: CSSProperties;
    className?: string;
    children?: ReactNode;
    ref?: Ref<SVGSVGElement>;
  }

  export interface ZoomableGroupProps {
    center?: [number, number];
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    translateExtent?: [[number, number], [number, number]];
    onMoveStart?: (pos: { coordinates: [number, number]; zoom: number }) => void;
    onMove?: (pos: { x: number; y: number; zoom: number; dragging: boolean }) => void;
    onMoveEnd?: (pos: { coordinates: [number, number]; zoom: number }) => void;
    children?: ReactNode;
  }

  export interface GeographiesProps {
    geography: string | object;
    children: (props: { geographies: GeographyFeature[] }) => ReactNode;
    parseGeographies?: (features: GeographyFeature[]) => GeographyFeature[];
  }

  export interface GeographyFeature {
    rsmKey: string;
    type: string;
    properties: Record<string, unknown>;
    geometry: {
      type: string;
      coordinates: unknown;
    };
  }

  export interface GeographyProps extends SVGProps<SVGPathElement> {
    geography: GeographyFeature;
    style?: {
      default?: CSSProperties;
      hover?: CSSProperties;
      pressed?: CSSProperties;
    };
    onClick?: (event: React.MouseEvent<SVGPathElement>, geography: GeographyFeature) => void;
    onMouseEnter?: (event: React.MouseEvent<SVGPathElement>, geography: GeographyFeature) => void;
    onMouseLeave?: (event: React.MouseEvent<SVGPathElement>, geography: GeographyFeature) => void;
  }

  export const ComposableMap: ComponentType<ComposableMapProps>;
  export const ZoomableGroup: ComponentType<ZoomableGroupProps>;
  export const Geographies: ComponentType<GeographiesProps>;
  export const Geography: ComponentType<GeographyProps>;
  export const Sphere: ComponentType<SVGProps<SVGPathElement> & { id?: string }>;
  export const Graticule: ComponentType<SVGProps<SVGPathElement> & { step?: [number, number] }>;
  export const Marker: ComponentType<{ coordinates: [number, number]; children?: ReactNode } & SVGProps<SVGGElement>>;
}
