#!/bin/bash
echo "Installing AutoClaw dependencies..."
npm install

echo "Building AutoClaw..."
npm run build

echo ""
echo "============================================"
echo "  Installation Complete!"
echo "============================================"
echo ""
echo "To configure, run:"
echo "  npm start -- setup"
echo ""
echo "To use, run:"
echo "  npm start"
echo ""
