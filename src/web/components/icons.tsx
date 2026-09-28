import type { SVGProps } from "react";

const PATHS: Record<string, string[]> = {
  dashboard: ["M3 3h7v7H3z", "M14 3h7v7h-7z", "M14 14h7v7h-7z", "M3 14h7v7H3z"],
  music: [
    "M9 18V5l12-2v13",
    "M6 18a3 3 0 1 0 6 0 3 3 0 0 0-6 0z",
    "M18 16a3 3 0 1 0 6 0 3 3 0 0 0-6 0z",
  ],
  upload: ["M12 16V4", "M6 10l6-6 6 6", "M4 20h16"],
  code: ["M16 18l6-6-6-6", "M8 6l-6 6 6 6"],
  user: ["M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2", "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"],
  users: [
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    "M22 21v-2a4 4 0 0 0-3-3.87",
    "M16 3.13a4 4 0 0 1 0 7.75",
  ],
  logs: ["M8 6h13", "M8 12h13", "M8 18h13", "M3.01 6h.01", "M3.01 12h.01", "M3.01 18h.01"],
  settings: ["M4 21v-7", "M4 10V3", "M12 21v-9", "M12 8V3", "M20 21v-5", "M20 12V3", "M2 14h4", "M10 8h4", "M18 16h4"],
  play: ["M7 4.5v15l13-7.5z"],
  copy: ["M8 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z", "M14 4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2"],
  trash: ["M4 7h16", "M10 11v6", "M14 11v6", "M6 7l1 14h10l1-14", "M9 7V4h6v3"],
  download: ["M12 4v11", "M7 10l5 5 5-5", "M4 20h16"],
  link: ["M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7", "M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"],
  logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"],
  shield: ["M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z"],
  x: ["M18 6L6 18", "M6 6l12 12"],
  check: ["M20 6L9 17l-5-5"],
  search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M21 21l-4.3-4.3"],
  edit: ["M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"],
  info: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 16v-4", "M12 8h.01"],
  file: ["M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z", "M13 2v7h7"],
  plus: ["M12 5v14", "M5 12h14"],
  key: ["M15 7a4 4 0 1 1 4 4", "M12 12L4 20v0h4v4h4v-4l4-4", "M12 12l2-2"],
};

export function Icon({ name, className = "h-4 w-4", ...rest }: { name: string; className?: string } & SVGProps<SVGSVGElement>) {
  const filled = name === "play";
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={filled ? 0 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {(PATHS[name] ?? PATHS.info).map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
