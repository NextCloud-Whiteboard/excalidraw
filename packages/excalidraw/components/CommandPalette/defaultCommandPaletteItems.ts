import { actionToggleTheme } from "../../actions";
import { t } from "../../i18n";

import type { CommandPaletteItem } from "./types";

export const toggleTheme: CommandPaletteItem = {
  ...actionToggleTheme,
  category: "App",
  label: t("labels.toggleTheme"),
  perform: ({ actionManager }) => {
    actionManager.executeAction(actionToggleTheme, "commandPalette");
  },
};
