import {
  getFiberFromHostInstance,
  isInstrumentationActive,
} from "bippy";
import { getElementContext } from "../core/context.js";
import { getTagName } from "./get-tag-name.js";

const COMPUTED_STYLE_MAX_PROPERTIES = 120;

const formatComputedSection = (element: Element): string => {
  if (!(element instanceof HTMLElement)) return "";
  const styles = window.getComputedStyle(element);
  const lines: string[] = [];
  const count = styles.length;
  const limit = Math.min(count, COMPUTED_STYLE_MAX_PROPERTIES);
  for (let index = 0; index < limit; index++) {
    const name = styles.item(index);
    const value = styles.getPropertyValue(name);
    if (value) lines.push(`${name}: ${value}`);
  }
  if (count > limit) {
    lines.push(`... (+ ${count - limit} more computed properties)`);
  }
  return lines.join("\n");
};

const formatCssVariablesSection = (element: Element): string => {
  const styles = window.getComputedStyle(element);
  const lines: string[] = [];
  const count = styles.length;
  for (let index = 0; index < count; index++) {
    const name = styles.item(index);
    if (name.startsWith("--")) {
      const value = styles.getPropertyValue(name);
      if (value) lines.push(`${name}: ${value}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : "(none in scope)";
};

const formatBoxModelSection = (element: Element): string => {
  if (!(element instanceof HTMLElement)) return "";
  const styles = window.getComputedStyle(element);
  const margin = [
    styles.marginTop,
    styles.marginRight,
    styles.marginBottom,
    styles.marginLeft,
  ].join(" ");
  const border = [
    styles.borderTopWidth,
    styles.borderRightWidth,
    styles.borderBottomWidth,
    styles.borderLeftWidth,
  ].join(" ");
  const padding = [
    styles.paddingTop,
    styles.paddingRight,
    styles.paddingBottom,
    styles.paddingLeft,
  ].join(" ");
  const rect = element.getBoundingClientRect();
  const content = `${rect.width}px × ${rect.height}px`;
  return `margin:  ${margin}\nborder:  ${border}\npadding: ${padding}\ncontent: ${content}`;
};

const getInheritedHint = (
  element: Element,
  property: string,
): "inherited" | "applied" | "default" => {
  if (!(element instanceof HTMLElement)) return "applied";
  const parent = element.parentElement;
  if (!parent || !(parent instanceof HTMLElement)) return "applied";
  const own = window.getComputedStyle(element).getPropertyValue(property);
  const fromParent = window.getComputedStyle(parent).getPropertyValue(property);
  if (own === fromParent && own) return "inherited";
  return "applied";
};

const formatAppliedVsInheritedSection = (element: Element): string => {
  if (!(element instanceof HTMLElement)) return "";
  const styles = window.getComputedStyle(element);
  const applied: string[] = [];
  const inherited: string[] = [];
  const count = Math.min(styles.length, 60);
  for (let index = 0; index < count; index++) {
    const name = styles.item(index);
    const value = styles.getPropertyValue(name);
    if (!value) continue;
    const hint = getInheritedHint(element, name);
    const line = `${name}: ${value}`;
    if (hint === "inherited") inherited.push(line);
    else applied.push(line);
  }
  const parts: string[] = [];
  if (applied.length > 0) {
    parts.push("From this element's rules:\n" + applied.join("\n"));
  }
  if (inherited.length > 0) {
    parts.push("Inherited from parent:\n" + inherited.join("\n"));
  }
  return parts.length > 0 ? parts.join("\n\n") : "(browser defaults)";
};

const getRelativeLuminance = (r: number, g: number, b: number): number => {
  const [rs, gs, bs] = [r, g, b].map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
};

const parseRgb = (value: string): { r: number; g: number; b: number } | null => {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
    };
  }
  return null;
};

const getContrastRatio = (l1: number, l2: number): number => {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
};

const formatAccessibilitySection = (element: Element): string => {
  const role = element.getAttribute("role") ?? "none";
  const ariaLabel = element.getAttribute("aria-label") ?? "none";
  const tabIndex = element.hasAttribute("tabindex")
    ? element.getAttribute("tabindex")
    : "none";
  let contrastLine = "N/A";
  if (element instanceof HTMLElement) {
    const styles = window.getComputedStyle(element);
    const color = styles.color;
    const bg = styles.backgroundColor;
    const fg = parseRgb(color);
    const bgParsed = parseRgb(bg);
    if (fg && bgParsed) {
      const l1 = getRelativeLuminance(fg.r, fg.g, fg.b);
      const l2 = getRelativeLuminance(bgParsed.r, bgParsed.g, bgParsed.b);
      const ratio = getContrastRatio(l1, l2);
      contrastLine = `${ratio.toFixed(2)}:1`;
    }
  }
  return `role: ${role}\naria-label: ${ariaLabel}\ntab-index: ${tabIndex}\ncolor contrast: ${contrastLine}`;
};

const formatReactPropsSection = (element: Element): string => {
  const attrs: string[] = [];
  for (const { name, value } of element.attributes) {
    if (value.length > 80) {
      attrs.push(`${name}: "${value.slice(0, 77)}..."`);
    } else {
      attrs.push(`${name}: ${JSON.stringify(value)}`);
    }
  }
  if (attrs.length === 0) return "(no attributes)";

  let reactPropsLine = "";
  if (isInstrumentationActive()) {
    const fiber = getFiberFromHostInstance(element);
    if (fiber?.memoizedProps && typeof fiber.memoizedProps === "object") {
      const props = fiber.memoizedProps as Record<string, unknown>;
      const keys = Object.keys(props).filter(
        (key) => key !== "children" && props[key] !== undefined,
      );
      if (keys.length > 0) {
        const parts = keys.map((key) => {
          const value = props[key];
          const display =
            typeof value === "string" && value.length > 60
              ? `"${value.slice(0, 57)}..."`
              : JSON.stringify(value);
          return `${key}: ${display}`;
        });
        reactPropsLine = "React props:\n" + parts.join("\n") + "\n\n";
      }
    }
  }
  return reactPropsLine + "DOM attributes:\n" + attrs.join("\n");
};

export const generateDevtoolsPanel = async (
  element: Element,
  includeContextSnippet: boolean,
): Promise<string> => {
  const tagName = getTagName(element);
  const classes = element.getAttribute("class")?.trim() ?? "";
  const sections: string[] = [];

  sections.push("1. Classes");
  sections.push(classes || "(none)");

  if (element instanceof HTMLElement) {
    sections.push("\n2. Computed CSS");
    sections.push(formatComputedSection(element));

    sections.push("\n3. CSS Variables in scope");
    sections.push(formatCssVariablesSection(element));

    sections.push("\n4. Box model");
    sections.push(formatBoxModelSection(element));

    sections.push("\n5. Applied vs inherited");
    sections.push(formatAppliedVsInheritedSection(element));
  }

  sections.push("\n6. Accessibility");
  sections.push(formatAccessibilitySection(element));

  sections.push("\n7. Component / element");
  sections.push(formatReactPropsSection(element));

  if (includeContextSnippet) {
    const contextSnippet = await getElementContext(element, { maxLines: 2 });
    sections.push("\n8. React Grab context");
    sections.push(contextSnippet);
  }

  return sections.join("\n");
};

export const generateDevtoolsPanelForElements = async (
  elements: Element[],
  includeContextSnippet: boolean,
): Promise<string> => {
  const panels = await Promise.all(
    elements.map((element) =>
      generateDevtoolsPanel(element, includeContextSnippet),
    ),
  );
  return panels.join("\n\n---\n\n");
};
