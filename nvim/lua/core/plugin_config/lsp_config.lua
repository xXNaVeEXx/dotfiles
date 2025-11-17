local lspconfig = require("lspconfig")


-- Set up lspconfig.
local capabilities = require('cmp_nvim_lsp').default_capabilities()

-- Format on save autocmd (global, works for all buffers with LSP)
vim.api.nvim_create_autocmd("BufWritePre", {
  callback = function(args)
    vim.lsp.buf.format({
      bufnr = args.buf,
      timeout_ms = 2000,
    })
  end,
})

-- Common on_attach function for all LSP servers
local on_attach = function(client, bufnr)
  -- Enable completion triggered by <c-x><c-o>
  vim.bo[bufnr].omnifunc = 'v:lua.vim.lsp.omnifunc'
end


lspconfig.lua_ls.setup({

  -- setting vim as global var
  on_init = function(client)
    if client.workspace_folders then
      local path = client.workspace_folders[1].name
      if
        path ~= vim.fn.stdpath('config')
        and (vim.uv.fs_stat(path .. '/.luarc.json') or vim.uv.fs_stat(path .. '/.luarc.jsonc'))
      then
        return
      end
    end

    client.config.settings.Lua = vim.tbl_deep_extend('force', client.config.settings.Lua, {
      runtime = {
        -- Tell the language server which version of Lua you're using (most
        -- likely LuaJIT in the case of Neovim)
        version = 'LuaJIT',
        -- Tell the language server how to find Lua modules same way as Neovim
        -- (see `:h lua-module-load`)
        path = {
          'lua/?.lua',
          'lua/?/init.lua',
        },
      },
      -- Make the server aware of Neovim runtime files
      workspace = {
        checkThirdParty = false,
        library = {
          vim.env.VIMRUNTIME
          -- Depending on the usage, you might want to add additional paths
          -- here.
          -- '${3rd}/luv/library'
          -- '${3rd}/busted/library'
        }
        -- Or pull in all of 'runtimepath'.
        -- NOTE: this is a lot slower and will cause issues when working on
        -- your own configuration.
        -- See https://github.com/neovim/nvim-lspconfig/issues/3189
        -- library = {
        --   vim.api.nvim_get_runtime_file('', true),
        -- }
      }
    })
  end,
  settings = {
    Lua = {
      diagnostics = {
        globals = {"vim"},
      }
    }
  },

  capabilities = capabilities,
  on_attach = on_attach,

})

lspconfig.clangd.setup({
  capabilities = capabilities,
  on_attach = on_attach,
})

lspconfig.ts_ls.setup({
  capabilities = capabilities,
  on_attach = on_attach,
})

lspconfig.tailwindcss.setup({
  capabilities = capabilities,
  on_attach = on_attach,
})

lspconfig.html.setup({
  capabilities = capabilities,
  on_attach = on_attach,
})

lspconfig.jsonls.setup({
  capabilities = capabilities,
  on_attach = on_attach,
})

  -- todo configure abl openedge_language_server

--  lspconfig.abl.setup({
--    capabilities = capabilities,
--    on_attach = function(client, bufnr)
--      -- Enable completion triggered by <c-x><c-o>
--      vim.bo[bufnr].omnifunc = 'v:lua.vim.lsp.omnifunc'
--    end,
--  })

lspconfig.rust_analyzer.setup({
  capabilities = capabilities,
  on_attach = on_attach,
})

-- Nix Lsp
lspconfig.nil_ls.setup({
  autostart = true,
  capabilities = capabilities,
  on_attach = on_attach,
})


