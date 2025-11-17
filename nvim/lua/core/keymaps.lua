vim.keymap.set('n', '<c-k>', ':wincmd k<CR>')
vim.keymap.set('n', '<c-j>', ':wincmd j<CR>')
vim.keymap.set('n', '<c-h>', ':wincmd h<CR>')
vim.keymap.set('n', '<c-l>', ':wincmd l<CR>')

-- telescope
local builtin = require("telescope.builtin")
vim.keymap.set('n', '<leader>ff', builtin.find_files, { desc = 'Telescope find files' })
vim.keymap.set('n', '<leader>fg', builtin.live_grep, { desc = 'Telescope live grep' })
vim.keymap.set('n', '<leader>fb', builtin.buffers, { desc = 'Telescope buffers' })
vim.keymap.set('n', '<leader>fh', builtin.help_tags, { desc = 'Telescope help tags' })

-- resize window
vim.keymap.set('n', '<c-w>', ':resize +2<CR>')
vim.keymap.set('n', '<c-s>', ':resize -2<CR>')
vim.keymap.set('n', '<c-a>', ':vertical resize -2<CR>')
vim.keymap.set('n', '<c-d>', ':vertical resize +2<CR>')

-- fix ident
vim.keymap.set('n', '<leader>c', ':GuessIndent<CR>')

-- open errors
vim.keymap.set('n', '<leader>t', ':Trouble<CR>')

-- which key -> to show all keys
vim.keymap.set('n', '<leader>w', ':WhichKey<CR>')

-- open Neotree chose file and close again
vim.keymap.set('n', '<leader><Tab>', function()
  -- Check if NeoTree is open
  local manager = require("neo-tree.sources.manager")
  local state = manager.get_state("filesystem")

  if state and state.winid and vim.api.nvim_win_is_valid(state.winid) then
    -- If open, close it
    vim.cmd("Neotree close")
  else
    -- If closed, open it and set up auto-close
    vim.cmd("Neotree filesystem float")

    -- Set up auto-close when leaving NeoTree window
    --autocmd is listener that execute on event BufLeave
    vim.api.nvim_create_autocmd("BufLeave", {
      pattern = "*",
      once = true,
      callback = function()
        -- Small delay to allow file opening to complete
        vim.defer_fn(function()
          if vim.bo.filetype ~= "neo-tree" then
            vim.cmd("silent! Neotree close")
          end
        end, 100)
      end
    })
  end
end)

-- change tabs
vim.keymap.set('n', '<Tab>', 'gt')
vim.keymap.set('n', '<S-Tab>', 'gT')

-- Obsidian search
vim.keymap.set('n', '<leader>os', ':ObsidianSearch<CR>')

-- formating keymap
vim.keymap.set("n", "<leader>fo", function()
  require("conform").format({ async = true, lsp_fallback = true })
end, { desc = "Format buffer" })
