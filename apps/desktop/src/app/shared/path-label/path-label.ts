import { Component, computed, input } from "@angular/core";

/** Presentation only; filesystem operations keep the original path. */
export function displayPath(path: string): string {
  if (/^\\\\\?\\UNC\\/i.test(path)) {
    return "\\\\" + path.slice(8);
  }
  if (/^\\\\\?\\[a-z]:\\/i.test(path)) {
    return path.slice(4);
  }
  return path;
}

@Component({
  selector: "app-path-label",
  styleUrl: "./path-label.scss",
  template:
    '<span class="path-parent" aria-hidden="true">{{ parent() }}</span><span class="path-name" aria-hidden="true">{{ name() }}</span>',
  host: {
    class: "path-label",
    "[title]": "label()",
    "[attr.aria-label]": "label()",
  },
})
export class PathLabel {
  readonly path = input.required<string>();
  readonly label = computed(() => displayPath(this.path()));
  private readonly boundary = computed(() =>
    Math.max(this.label().lastIndexOf("\\"), this.label().lastIndexOf("/")),
  );

  readonly parent = computed(() => this.label().slice(0, this.boundary() + 1));
  readonly name = computed(() => this.label().slice(this.boundary() + 1));
}
