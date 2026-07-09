#!/bin/bash
cd ~/frappe/frappe-bench/apps/lms_plus
git add .
git commit -m "${1:-update: lms_plus changes}"
git push origin main
echo "Pushed to GitHub successfully"
