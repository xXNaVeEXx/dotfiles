require("lazy").setup({

  -- load plugins
  --
  -- treesitter
  {
    "nvim-treesitter/nvim-treesitter",
    build = ":TSUpdate",
  },

  -- LSP client
  "neovim/nvim-lspconfig",

  -- LSP Server
  {
    "williamboman/mason.nvim"
  },

  -- LSP mason-lspconfig bridges mason.nvim with the lspconfig plugin - making it easier to use both plugins together.
  {
    "mason-org/mason-lspconfig.nvim",
    opts = {},
    dependencies = {
        { "mason-org/mason.nvim", opts = {} },
        "neovim/nvim-lspconfig",
    },
  },

  -- Code Autocomplete
  {
    "hrsh7th/nvim-cmp",
    event = { "InsertEnter", "CmdlineEnter" },
  },

  -- nvim-cmp source for neovim's built-in language server client.
  "hrsh7th/cmp-nvim-lsp",

  -- Snippets
  "L3MON4D3/LuaSnip",
  "saadparwaiz1/cmp_luasnip",
  -- Snippets collection for a set of different programming languages.#
  "rafamadriz/friendly-snippets",

  -- telescope -> like macos spotlight
    {
    'nvim-telescope/telescope.nvim', tag = '0.1.8',
-- or                              , branch = '0.1.x',
      dependencies = { 'nvim-lua/plenary.nvim' }
    },

  -- UI Theme
  { "catppuccin/nvim", name = "catppuccin", priority = 1000 },


  -- Tree View to see file structure
  {
   "nvim-neo-tree/neo-tree.nvim",
   branch = "v3.x",
   dependencies = {
     "nvim-lua/plenary.nvim",
     "nvim-tree/nvim-web-devicons", -- not strictly required, but recommended
     "MunifTanjim/nui.nvim",
     -- {"3rd/image.nvim", opts = {}}, -- Optional image support in preview window: See `# Preview Mode` for more information
   },
   lazy = false, -- neo-tree will lazily load itself
   ---@module "neo-tree"
   ---@type neotree.Config?
   opts = {
     -- fill any relevant options here
   },
  },


  --#region
  --
  -- plugin to see indent line
  --#endregion
  {
    "lukas-reineke/indent-blankline.nvim",
    main = "ibl",
    ---@module "ibl"
    ---@type ibl.config
    opts = {},
},

  -- Guess ident -> fixes identation
  'nmac427/guess-indent.nvim',

  -- Whichkey -> to show keymaps
  {
  "folke/which-key.nvim",
  event = "VeryLazy",
  opts = {
    -- your configuration comes here
    -- or leave it empty to use the default settings
    -- refer to the configuration section below
  },
  keys = {
    {
      "<leader>?",
      function()
        require("which-key").show({ global = false })
      end,
      desc = "Buffer Local Keymaps (which-key)",
    },
  },
},

  -- trouble -> jump to errors
  {
  "folke/trouble.nvim",
  opts = {}, -- for default options, refer to the configuration section for custom setup.
  cmd = "Trouble",
  keys = {
    {
      "<leader>xx",
      "<cmd>Trouble diagnostics toggle<cr>",
      desc = "Diagnostics (Trouble)",
    },
    {
      "<leader>xX",
      "<cmd>Trouble diagnostics toggle filter.buf=0<cr>",
      desc = "Buffer Diagnostics (Trouble)",
    },
    {
      "<leader>cs",
      "<cmd>Trouble symbols toggle focus=false<cr>",
      desc = "Symbols (Trouble)",
    },
    {
      "<leader>cl",
      "<cmd>Trouble lsp toggle focus=false win.position=right<cr>",
      desc = "LSP Definitions / references / ... (Trouble)",
    },
    {
      "<leader>xL",
      "<cmd>Trouble loclist toggle<cr>",
      desc = "Location List (Trouble)",
    },
    {
      "<leader>xQ",
      "<cmd>Trouble qflist toggle<cr>",
      desc = "Quickfix List (Trouble)",
    },
  },
},

  -- Obsidian
  {
  "epwalsh/obsidian.nvim",
  version = "*",  -- recommended, use latest release instead of latest commit
  lazy = true,
  ft = "markdown",
  -- Replace the above line with this if you only want to load obsidian.nvim for markdown files in your vault:
  -- event = {
  --   -- If you want to use the home shortcut '~' here you need to call 'vim.fn.expand'.
  --   -- E.g. "BufReadPre " .. vim.fn.expand "~" .. "/my-vault/*.md"
  --   -- refer to `:h file-pattern` for more examples
  --   "BufReadPre path/to/my-vault/*.md",
  --   "BufNewFile path/to/my-vault/*.md",
  -- },
  dependencies = {
    -- Required.
    "nvim-lua/plenary.nvim",

    -- see below for full list of optional dependencies 👇
  },
},


-- tiny-inline-diagnostic.nvim > better inline errors
{
    "rachartier/tiny-inline-diagnostic.nvim",
    event = "VeryLazy", -- Or `LspAttach`
    priority = 1000, -- needs to be loaded in first
    config = function()
        require('tiny-inline-diagnostic').setup()
    end
},



})


