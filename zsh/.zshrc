# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block; everything else may go below.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

# PATH configuration
export PATH="/opt/nvim-linux-x86_64/bin:$PATH"
export PATH="/usr/lib/jvm/default-java/bin:$PATH"
export PATH="$HOME/.local/bin:$PATH"

# NVM configuration - Force correct path
export NVM_DIR="$HOME/.nvm"
export NVM_MIRROR="https://nodejs.org/dist"

# Auto-install nvm if not present
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    echo "nvm not found. Installing..."
    # Unset any existing NVM_DIR to avoid conflicts
    unset NVM_DIR
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    # Reset NVM_DIR after install
    export NVM_DIR="$HOME/.nvm"
fi

# Load nvm if it exists
if [ -s "$NVM_DIR/nvm.sh" ]; then
    source "$NVM_DIR/nvm.sh"
    
    # Auto-use node version from .nvmrc if present (only runs if nvm is loaded)
    autoload -U add-zsh-hook
    load-nvmrc() {
      local node_version="$(nvm version)"
      local nvmrc_path="$(nvm_find_nvmrc)"
      
      if [ -n "$nvmrc_path" ]; then
        local nvmrc_node_version=$(nvm version "$(cat "${nvmrc_path}")")
        
        if [ "$nvmrc_node_version" = "N/A" ]; then
          nvm install
        elif [ "$nvmrc_node_version" != "$node_version" ]; then
          nvm use --silent
        fi
      elif [ "$node_version" != "$(nvm version default)" ]; then
        nvm use default --silent
      fi
    }
    add-zsh-hook chpwd load-nvmrc
    load-nvmrc
fi

# Load nvm bash completion if it exists
if [ -s "$NVM_DIR/bash_completion" ]; then
    source "$NVM_DIR/bash_completion"
fi

# Function to detect Linux distro and install package
install_package() {
    local package=$1
    local install_cmd=""

    # Detect the distribution
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        case "$ID" in
            nixos)
                echo "$package not found. On NixOS, please add it to your configuration.nix or home-manager config."
                return 1
                ;;
            ubuntu|debian|pop|linuxmint)
                install_cmd="sudo apt update && sudo apt install -y $package"
                ;;
            fedora|rhel|centos)
                install_cmd="sudo dnf install -y $package"
                ;;
            arch|manjaro|endeavouros|cachyos)
                install_cmd="sudo pacman -S --noconfirm $package"
                ;;
            opensuse*)
                install_cmd="sudo zypper install -y $package"
                ;;
            *)
                echo "Unknown distribution: $ID. Skipping $package installation."
                return 1
                ;;
        esac

        if [ -n "$install_cmd" ]; then
            echo "$package not found. Installing..."
            eval $install_cmd
        fi
    fi
}

# Auto-install fzf if not present
if ! command -v fzf &> /dev/null; then
    install_package fzf
fi

# Auto-install zoxide if not present (using curl installer as it's distro-agnostic)
if ! command -v zoxide &> /dev/null; then
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        if [ "$ID" = "nixos" ]; then
            echo "zoxide not found. On NixOS, please add it to your configuration.nix or home-manager config."
        else
            echo "zoxide not found. Installing..."
            curl -sSfL https://raw.githubusercontent.com/ajeetdsouza/zoxide/main/install.sh | sh
            export PATH="$HOME/.local/bin:$PATH"
        fi
    fi
fi

# Install zinit if not present
ZINIT_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}/zinit/zinit.git"
if [ ! -d "$ZINIT_HOME" ]; then
   mkdir -p "$(dirname $ZINIT_HOME)"
   git clone https://github.com/zdharma-continuum/zinit.git "$ZINIT_HOME"
fi
source "${ZINIT_HOME}/zinit.zsh"

# Powerlevel10k theme
zinit ice depth=1
zinit light romkatv/powerlevel10k

# Plugins
zinit light zsh-users/zsh-syntax-highlighting
zinit light zsh-users/zsh-completions
zinit light zsh-users/zsh-autosuggestions
zinit light jeffreytse/zsh-vi-mode
zinit light Aloxaf/fzf-tab

# Autoload completions
autoload -U compinit && compinit

# fzf configuration
export FZF_DEFAULT_OPTS="--height 40% --layout=reverse --border"

# fzf key bindings and completion
if [ -f /usr/share/doc/fzf/examples/key-bindings.zsh ]; then
  source /usr/share/doc/fzf/examples/key-bindings.zsh
fi
if [ -f /usr/share/doc/fzf/examples/completion.zsh ]; then
  source /usr/share/doc/fzf/examples/completion.zsh
fi

# fzf-tab config
zstyle ':completion:*:git-checkout:*' sort false
zstyle ':completion:*:descriptions' format '[%d]'
zstyle ':fzf-tab:complete:cd:*' fzf-preview 'ls -1 --color=always $realpath'
zstyle ':fzf-tab:*' switch-group ',' '.'

# zoxide (smarter cd)
eval "$(zoxide init zsh)"

# Aliases
alias cd="z"
alias cdi="zi"
alias ls='eza'
alias cat='bat'

# Keybindings
bindkey -e
bindkey '^p' history-search-backward
bindkey '^n' history-search-forward

# History settings
HISTFILE=~/.config/zsh/.histfile
HISTSIZE=1000
SAVEHIST=1000
setopt SHARE_HISTORY
setopt HIST_IGNORE_ALL_DUPS

# Completion styling
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-Z}'
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"

# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh
