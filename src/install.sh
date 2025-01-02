#!/bin/bash

# Path to the GNOME extensions directory
EXTENSIONS_DIR="$HOME/.local/share/gnome-shell/extensions"

# Check if the extensions directory exists, and create it if it doesn't
if [ ! -d "$EXTENSIONS_DIR" ]; then
    mkdir -p "$EXTENSIONS_DIR"
fi

# Move all folders from the current directory to the GNOME extensions directory
for dir in */; do
    if [ -d "$dir" ]; then
        mv "$dir" "$EXTENSIONS_DIR"
    fi
done

echo "All directories have been moved to $EXTENSIONS_DIR"
