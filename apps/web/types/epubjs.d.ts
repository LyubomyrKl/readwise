declare module 'epubjs' {
  export interface Book {
    renderTo(element: HTMLElement, options?: RenderOptions): Rendition;
    ready: Promise<void>;
    locations: {
      generate(chunk?: number): Promise<void>;
      total: number;
      percentageFromCfi(cfi: string): number;
    };
  }

  export interface Rendition {
    display(target?: string | number): Promise<void>;
    next(): Promise<void>;
    prev(): Promise<void>;
    destroy(): void;
    themes: {
      override(property: string, value: string): void;
      fontSize(size: string): void;
    };
    on(event: string, callback: (location: any) => void): void;
  }

  export interface RenderOptions {
    width?: string | number;
    height?: string | number;
    spread?: 'auto' | 'none' | 'always';
    stylesheet?: string;
  }

  export default function ePub(url: string): Book;
}

declare global {
  interface Window {
    ePub: typeof import('epubjs').default;
  }
}