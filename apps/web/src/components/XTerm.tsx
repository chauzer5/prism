import {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  type Ref,
} from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export interface XTermHandle {
  write(data: string): void;
  clear(): void;
  dimensions(): { cols: number; rows: number } | null;
  terminal: Terminal | null;
}

interface XTermProps {
  theme?: Record<string, string>;
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  className?: string;
  disabled?: boolean;
  convertEol?: boolean;
}

const defaultTheme = {
  background: "#00000000",
  foreground: "#d1d5db",
  cursor: "#ff2d7b",
  cursorAccent: "#110d1e",
  black: "#6b7280",
  red: "#ef4444",
  green: "#00ff88",
  yellow: "#f59e0b",
  blue: "#3b82f6",
  magenta: "#8b5cf6",
  cyan: "#06b6d4",
  white: "#d1d5db",
};

export const XTerm = forwardRef(function XTerm(
  props: XTermProps,
  ref: Ref<XTermHandle>,
) {
  const { theme = defaultTheme, onData, onResize, className, disabled, convertEol = true } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const onDataRef = useRef(onData);
  onDataRef.current = onData;
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  useImperativeHandle(ref, () => ({
    write(data: string) {
      terminalRef.current?.write(data);
    },
    clear() {
      terminalRef.current?.clear();
    },
    dimensions() {
      const t = terminalRef.current;
      if (!t) return null;
      return { cols: t.cols, rows: t.rows };
    },
    get terminal() {
      return terminalRef.current;
    },
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const fitAddon = new FitAddon();
    const terminal = new Terminal({
      theme,
      fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
      fontSize: 11,
      lineHeight: 1.3,
      cursorBlink: false,
      cursorInactiveStyle: "none",
      convertEol,
      allowTransparency: true,
      scrollback: 5000,
      disableStdin: !!disabled,
    });

    terminal.loadAddon(fitAddon);
    terminal.open(container);

    // Small delay to let the container settle before first fit
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
        onResizeRef.current?.(terminal.cols, terminal.rows);
      } catch {
        // Container may not be visible yet
      }
    });

    terminal.onData((data) => {
      onDataRef.current?.(data);
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const handleResize = () => {
      try {
        fitAddon.fit();
        onResizeRef.current?.(terminal.cols, terminal.rows);
      } catch {
        // ignore
      }
    };
    window.addEventListener("resize", handleResize);

    // ResizeObserver for container size changes (e.g. panel resizing)
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
    // Only run on mount/unmount — theme and disabled are set via terminal options below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update disabled state without remounting
  useEffect(() => {
    const terminal = terminalRef.current;
    if (terminal) {
      terminal.options.disableStdin = !!disabled;
      terminal.options.cursorBlink = !disabled;
    }
  }, [disabled]);

  // Update convertEol without remounting
  useEffect(() => {
    const terminal = terminalRef.current;
    if (terminal) {
      terminal.options.convertEol = !!convertEol;
    }
  }, [convertEol]);

  // Update theme without remounting
  useEffect(() => {
    const terminal = terminalRef.current;
    if (terminal) {
      terminal.options.theme = theme;
    }
  }, [theme]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height: "100%" }}
    />
  );
});
