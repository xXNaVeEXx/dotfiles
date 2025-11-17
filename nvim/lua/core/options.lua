vim.g.mapleader = ' '
vim.g.maplocalleader = ' '

vim.opt.backspace = '2'
vim.opt.showcmd = true
vim.opt.laststatus = 2
vim.opt.autowrite = true
vim.opt.cursorline = true
vim.opt.autoread = true
vim.opt.cmdheight = 0

-- use spaces for tabs and whatnot
vim.opt.scrolloff = 10
vim.opt.termguicolors = true
vim.opt.tabstop = 4
vim.opt.shiftwidth = 4
vim.opt.number = true
vim.opt.clipboard = "unnamedplus"
vim.opt.wrap = false
vim.opt.updatetime = 500


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

vim.api.nvim_create_autocmd("TextYankPost", {
	desc = "Highlight when yanking text",
	group = vim.api.nvim_create_augroup('kickstart-highlight-yank', { clear = true }),
	callback = function()
		vim.highlight.on_yank()
	end,
})

vim.api.nvim_create_autocmd("VimEnter", {
	callback = function()
		if vim.fn.argc() == 0 and vim.fn.filereadable("README.md") == 1 then
			vim.cmd("edit README.md")
		end
	end,
})


vim.opt.undofile = true
vim.opt.undodir = vim.fn.stdpath("config") .. "/undodir"



