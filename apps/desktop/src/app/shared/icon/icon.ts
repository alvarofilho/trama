import { Component, input } from "@angular/core";

const paths = {
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  folder: "M3 7h7l2 2h9v11H3zM3 7V4h7l2 3",
  agent: "M8 4h8v4H8zM5 8h14v12H5zM9 13h.01M15 13h.01M9 17h6",
  branch:
    "M6 6v12M18 6v3c0 5-12 0-12 6M8 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0M8 20a2 2 0 1 1-4 0 2 2 0 0 1 4 0M20 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
  shield: "M12 3 19 6v5c0 4.5-3 7.5-7 10-4-2.5-7-5.5-7-10V6zM9 12l2 2 4-4",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  trash: "M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5",
};

@Component({
  selector: "app-icon",
  styleUrl: "./icon.scss",
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path [attr.d]="paths[name()]" />
    </svg>
  `,
  host: {
    class: "app-icon",
    "aria-hidden": "true",
  },
})
export class Icon {
  readonly name = input.required<keyof typeof paths>();
  readonly paths = paths;
}
