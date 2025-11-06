vim.g.mapleader = ' '
vim.g.maplocalleader = ' '

vim.opt.backspace = '2'
vim.opt.showcmd = true
vim.opt.laststatus = 2
vim.opt.autowrite = true
vim.opt.cursorline = true
vim.opt.autoread = true

-- use spaces for tabs and whatnot
vim.opt.tabstop = 2
vim.opt.shiftwidth = 2
vim.opt.shiftround = true
vim.opt.expandtab = true

-- conceallevel for obsidian
vim.opt.conceallevel= 1

vim.cmd [[ set noswapfile ]]
vim.cmd [[ set termguicolors ]]

--Line numbers
vim.wo.number = true

-- vim diagnostic to display LSP error inline
vim.diagnostic.config({
  virtual_text = false, -- use tiny-inline-diagnostic.nvim plugin
})
