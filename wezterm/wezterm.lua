-- Pull in the wezterm API
local wezterm = require("wezterm")

-- This will hold the configuration.
local config = wezterm.config_builder()

config.font = wezterm.font('GohuFont 14 Nerd Font Mono')
config.font_size = 14

config.colors = {
  foreground = "#CBE0F0",
  background = "#011423",
  cursor_bg = "#47FF9C",
  cursor_border = "#47FF9C",
  cursor_fg = "#011423",
  selection_bg = "#033259",
  selection_fg = "#CBE0F0",
  ansi = { "#214969", "#E52E2E", "#44FFB1", "#FFE073", "#0FC5ED", "#a277ff", "#24EAF7", "#24EAF7" },
  brights = { "#214969", "#E52E2E", "#44FFB1", "#FFE073", "#A277FF", "#a277ff", "#24EAF7", "#24EAF7" },
}

config.enable_tab_bar = false

config.window_decorations = "RESIZE"
config.window_background_opacity = 0.8
config.macos_window_background_blur = 10

config.skip_close_confirmation_for_processes_named = {
  'bash',
  'sh',
  'zsh',
  'fish',
  'tmux',
  'nu',
  'cmd.exe',
  'pwsh.exe',
  'powershell.exe',
}

config.min_scroll_bar_height = "0.5cell"

-- Maus-Bindings: NICHT die Defaults ersetzen! Eine Zuweisung an
-- config.mouse_bindings ersetzt sämtliche Defaults (inkl. Klick öffnet
-- Hyperlink, Auswahl, Mausrad). Neuere WezTerm-Versionen bieten
-- wezterm.default_mouse_bindings() zum Mergen — wenn vorhanden, hängen wir
-- nur die zwei nicht-Default-Drag-Bindings an; sonst lassen wir die Defaults
-- komplett unangetastet (SUPER+Drag ist ohnehin Default).
if wezterm.default_mouse_bindings then
  local mouse = wezterm.default_mouse_bindings()
  table.insert(mouse, {
    event = { Drag = { streak = 1, button = 'Left' } },
    mods = 'CTRL|SHIFT',
    action = wezterm.action.StartWindowDrag,
  })
  table.insert(mouse, {
    event = { Drag = { streak = 1, button = 'Left' } },
    mods = 'ALT',
    action = wezterm.action.StartWindowDrag,
  })
  config.mouse_bindings = mouse
end

-- Klickbare Datei-Pfade im Terminal: JEDER absolute Pfad /home/… oder
-- /nix/store/… im Terminal-Text wird klickbar (file:line-Angaben öffnen die
-- Datei selbst; der Teil nach dem Doppelpunkt wird abgeschnitten).
local rules = wezterm.default_hyperlink_rules()
table.insert(rules, {
  regex = [==[/(?:home|nix/store)/[^\s'"`,()\[\]{}:;!?*|<>]+]==],
  format = 'file://$0',
})
config.hyperlink_rules = rules

-- and finally, return the configuration to wezterm
return config
