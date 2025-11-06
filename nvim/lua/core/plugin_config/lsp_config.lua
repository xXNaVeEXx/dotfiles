local lspconfig = require("lspconfig")


-- Set up lspconfig.
  local capabilities = require('cmp_nvim_lsp').default_capabilities()
  -- Replace <YOUR_LSP_SERVER> with each lsp server you've enabled.


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
  on_attach = function(client, bufnr)
    -- Enable completion triggered by <c-x><c-o>
    vim.bo[bufnr].omnifunc = 'v:lua.vim.lsp.omnifunc'
  end,

})

lspconfig.clangd.setup({
 capabilities = capabilities,
  on_attach = function(client, bufnr)
    -- Enable completion triggered by <c-x><c-o>
    vim.bo[bufnr].omnifunc = 'v:lua.vim.lsp.omnifunc'
  end,
})

lspconfig.ts_ls.setup({
  capabilities = capabilities,
  on_attach = function(client, bufnr)
    -- Enable completion triggered by <c-x><c-o>
    vim.bo[bufnr].omnifunc = 'v:lua.vim.lsp.omnifunc'
  end,
})

lspconfig.tailwindcss.setup({
  cmd = { 'tailwindcss-language-server', '--stdio' },
  capabilities = capabilities,
  on_attach = function(client, bufnr)
    vim.bo[bufnr].omnifunc = 'v:lua.vim.lsp.omnifunc'
  end,
})

lspconfig.html.setup({
  capabilities = capabilities,
  on_attach = function(client, bufnr)
    -- Enable completion triggered by <c-x><c-o>
    vim.bo[bufnr].omnifunc = 'v:lua.vim.lsp.omnifunc'
  end,
})

lspconfig.jsonls.setup({
  capabilities = capabilities,
  on_attach = function(client, bufnr)
    -- Enable completion triggered by <c-x><c-o>
    vim.bo[bufnr].omnifunc = 'v:lua.vim.lsp.omnifunc'
  end,
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
  on_attach = function(client, bufnr)
    -- Enable completion triggered by <c-x><c-o>
    vim.bo[bufnr].omnifunc = 'v:lua.vim.lsp.omnifunc'
  end,
})

-- Nix Lsp
lspconfig.nil_ls.setup({
  autostart=true,
  capabilities = capabilities,
  on_attach = function(client, bufnr)
    -- Enable completion triggered by <c-x><c-o>
    vim.bo[bufnr].omnifunc = 'v:lua.vim.lsp.omnifunc'
  end,
})

-- eslint typescript lsp
lspconfig.eslint.setup({
  cmd = { 'vscode-eslint-language-server', '--stdio' },
  capabilities = capabilities,
  filetypes = { 
    "javascript", 
    "javascriptreact", 
    "typescript", 
    "typescriptreact", 
    "vue", 
    "svelte" 
  },
  on_attach = function(client, bufnr)
    vim.bo[bufnr].omnifunc = 'v:lua.vim.lsp.omnifunc'
    
    -- Auto-fix on save
    vim.api.nvim_create_autocmd("BufWritePre", {
      buffer = bufnr,
      command = "EslintFixAll",
    })
  end,
})
