-- Set up nvim-cmp
local cmp = require'cmp'

require("luasnip.loaders.from_vscode").lazy_load()

cmp.setup({
  snippet = {
    expand = function(args)
      require('luasnip').lsp_expand(args.body)
    end,
  },
  mapping = {
    ['<C-b>'] = cmp.mapping.scroll_docs(-4),
    ['<C-f>'] = cmp.mapping.scroll_docs(4),
    ['<C-Space>'] = cmp.mapping.complete(),
    ['<C-e>'] = cmp.mapping.close(),
    ['<CR>'] = cmp.mapping.confirm({ select = false }),
    ['<Up>'] = cmp.mapping.select_prev_item({ behavior = cmp.SelectBehavior.Insert } ),
    ['<Down>'] = cmp.mapping.select_next_item({ behavior = cmp.SelectBehavior.Insert } ),

    ['<C-p>'] = cmp.mapping.select_prev_item({ behavior = cmp.SelectBehavior.Insert } ),
    ['<C-n>'] = cmp.mapping.select_next_item({ behavior = cmp.SelectBehavior.Insert} ),
  },
  sources = cmp.config.sources({
      { name = 'nvim_lsp' },
      { name = 'luasnip' }, -- For luasnip users.
      -- { name = 'ultisnips' }, -- For ultisnips users.
      -- { name = 'snippy' }, -- For snippy users.
    }, {
      { name = 'buffer' },
    })
  })
