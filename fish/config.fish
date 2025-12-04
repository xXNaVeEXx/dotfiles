# PATH configuration for WSL

# Homebrew for macOS
if test -d /opt/homebrew/bin
    fish_add_path /opt/homebrew/bin
end

# Rust/Cargo
if test -f ~/.cargo/env.fish
    source ~/.cargo/env.fish
end

# Add Flutter if installed
if test -d ~/development/flutter/bin
    fish_add_path ~/development/flutter/bin
end

# Add VS Code (Windows)
if test -d "/mnt/c/Users/gamzat.mukailov/AppData/Local/Programs/Microsoft VS Code/bin"
    fish_add_path "/mnt/c/Users/gamzat.mukailov/AppData/Local/Programs/Microsoft VS Code/bin"
end

# Add Windsurf if installed
if test -d ~/.codeium/windsurf/bin
    fish_add_path ~/.codeium/windsurf/bin
end

# Add Neovim if installed
if test -d /opt/nvim-linux-x86_64/bin
    fish_add_path /opt/nvim-linux-x86_64/bin
end

# JAVA_HOME for WSL/Linux
if test -d /usr/lib/jvm/default-java
    set -gx JAVA_HOME /usr/lib/jvm/default-java
    fish_add_path $JAVA_HOME/bin
else if test -d /usr/lib/jvm/java-17-openjdk-amd64
    set -gx JAVA_HOME /usr/lib/jvm/java-17-openjdk-amd64
    fish_add_path $JAVA_HOME/bin
end

# Ollama host
set -gx OLLAMA_HOST "100.72.87.106"

# Angular CLI autocompletion
# Note: ng completion outputs bash syntax, not compatible with Fish
# ng completion script | source

# OpenAI/Qwen CLI configuration
set -gx OPENAI_API_KEY "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"
set -gx OPENAI_BASE_URL "https://openrouter.ai/api/v1"
set -gx OPENAI_MODEL "qwen/qwen3-coder:free"

if status is-interactive
    # Commands to run in interactive sessions can go here

    # Initialize zoxide if installed
    if type -q zoxide
        zoxide init fish --cmd cd | source
    end

    # Set up fzf key bindings
    if type -q fzf
        fzf --fish | source
    end

    # Use eza instead of ls
    if type -q eza
        alias ls='eza --icons'
    end
end
