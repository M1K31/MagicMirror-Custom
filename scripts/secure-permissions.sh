#!/bin/bash
# MagicMirror Security Permissions Script
# ========================================
# Sets appropriate file permissions for security-sensitive files
#
# Usage: ./scripts/secure-permissions.sh
#
# Run this script after installation and whenever you add new
# configuration or token files.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "MagicMirror Security Permissions Script"
echo "========================================"
echo ""

# Get script directory and MagicMirror root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
MM_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo "MagicMirror directory: $MM_ROOT"
echo ""

# Function to secure a file
secure_file() {
    local file="$1"
    local perms="$2"
    local desc="$3"
    
    if [ -f "$file" ]; then
        chmod "$perms" "$file"
        echo -e "${GREEN}✓${NC} Secured $desc: $file ($perms)"
    fi
}

# Function to secure a directory
secure_dir() {
    local dir="$1"
    local perms="$2"
    local desc="$3"
    
    if [ -d "$dir" ]; then
        chmod "$perms" "$dir"
        echo -e "${GREEN}✓${NC} Secured $desc: $dir ($perms)"
    fi
}

# 1. Secure configuration files
echo "Securing configuration files..."
secure_file "$MM_ROOT/config/config.js" "600" "config file"
secure_file "$MM_ROOT/config/config.js.sample" "644" "config sample"
secure_file "$MM_ROOT/.env" "600" "environment file"
secure_file "$MM_ROOT/.env.local" "600" "local environment file"

# 2. Secure token storage files
echo ""
echo "Securing token storage files..."
find "$MM_ROOT/modules/default" -name ".*_config.json" -type f 2>/dev/null | while read -r file; do
    chmod 600 "$file"
    echo -e "${GREEN}✓${NC} Secured token file: $file (600)"
done

# 3. Secure any .json files with "token" in the name
find "$MM_ROOT" -name "*token*.json" -type f 2>/dev/null | while read -r file; do
    # Skip node_modules
    if [[ "$file" != *"node_modules"* ]]; then
        chmod 600 "$file"
        echo -e "${GREEN}✓${NC} Secured token file: $file (600)"
    fi
done

# 4. Secure log directories
echo ""
echo "Securing log directories..."
if [ -d "$MM_ROOT/logs" ]; then
    secure_dir "$MM_ROOT/logs" "700" "logs directory"
    find "$MM_ROOT/logs" -name "*.log" -type f 2>/dev/null | while read -r file; do
        chmod 600 "$file"
        echo -e "${GREEN}✓${NC} Secured log file: $file (600)"
    done
fi

# 5. Secure HTTPS certificates if present
echo ""
echo "Securing SSL certificates..."
for cert in "$MM_ROOT"/*.pem "$MM_ROOT"/*.key "$MM_ROOT/certs"/*.pem "$MM_ROOT/certs"/*.key; do
    if [ -f "$cert" ]; then
        chmod 600 "$cert"
        echo -e "${GREEN}✓${NC} Secured certificate: $cert (600)"
    fi
done

# 6. Secure home directory token storage
echo ""
echo "Checking user home directory..."
TOKEN_DIR="$HOME/.magicmirror/tokens"
if [ -d "$TOKEN_DIR" ]; then
    chmod 700 "$HOME/.magicmirror"
    chmod 700 "$TOKEN_DIR"
    find "$TOKEN_DIR" -type f 2>/dev/null | while read -r file; do
        chmod 600 "$file"
        echo -e "${GREEN}✓${NC} Secured token: $file (600)"
    done
else
    echo -e "${YELLOW}!${NC} Token directory not found at $TOKEN_DIR (will be created on first auth)"
fi

# 7. Check for potentially exposed files
echo ""
echo "Checking for potentially exposed sensitive files..."

ISSUES=0

# Check if .env is in .gitignore
if [ -f "$MM_ROOT/.gitignore" ]; then
    if ! grep -q "^\.env$" "$MM_ROOT/.gitignore" 2>/dev/null; then
        echo -e "${YELLOW}!${NC} Warning: .env should be in .gitignore"
        ISSUES=$((ISSUES + 1))
    fi
else
    echo -e "${YELLOW}!${NC} Warning: No .gitignore found - secrets may be at risk"
    ISSUES=$((ISSUES + 1))
fi

# Check if config.js is in .gitignore
if [ -f "$MM_ROOT/.gitignore" ]; then
    if ! grep -q "config/config\.js$" "$MM_ROOT/.gitignore" 2>/dev/null && \
       ! grep -q "^config\.js$" "$MM_ROOT/.gitignore" 2>/dev/null; then
        echo -e "${YELLOW}!${NC} Warning: config/config.js should be in .gitignore"
        ISSUES=$((ISSUES + 1))
    fi
fi

# Check for any .env files that might be tracked
if [ -d "$MM_ROOT/.git" ]; then
    tracked_env=$(git -C "$MM_ROOT" ls-files 2>/dev/null | grep -E "^\.env" || true)
    if [ -n "$tracked_env" ]; then
        echo -e "${RED}✗${NC} CRITICAL: .env files are tracked by git!"
        echo "   Run: git rm --cached .env"
        ISSUES=$((ISSUES + 1))
    fi
fi

# 8. Summary
echo ""
echo "========================================"
echo "Summary"
echo "========================================"

if [ $ISSUES -eq 0 ]; then
    echo -e "${GREEN}All security checks passed!${NC}"
else
    echo -e "${YELLOW}Found $ISSUES potential security issue(s) - see warnings above${NC}"
fi

echo ""
echo "Recommendations:"
echo "1. Run this script after any configuration changes"
echo "2. Never commit .env or config.js to version control"
echo "3. Regularly rotate API keys and tokens"
echo "4. Review docs/SECURITY_AUDIT.md for more information"
echo ""
echo "Done!"
