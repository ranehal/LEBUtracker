@echo off
echo Installing dependencies for Excel export...
pip install pandas xlsxwriter openpyxl
echo.
echo Converting data.js to Excel...
python export_data.py
echo.
pause
