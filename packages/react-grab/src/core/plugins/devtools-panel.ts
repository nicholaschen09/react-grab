import type { Plugin } from "../../types.js";
import { copyContent } from "../../utils/copy-content.js";
import { generateDevtoolsPanelForElements } from "../../utils/devtools-panel.js";

export const devtoolsPanelPlugin: Plugin = {
  name: "devtools-panel",
  setup: () => ({
    actions: [
      {
        id: "copy-devtools-panel",
        label: "Copy devtools panel",
        onAction: async (context) => {
          await context.performWithFeedback(async () => {
            const text = await generateDevtoolsPanelForElements(
              context.elements,
              true,
            );
            if (!text.trim()) return false;
            return copyContent(text, {
              componentName: context.componentName ?? "element",
            });
          });
        },
      },
    ],
  }),
};
