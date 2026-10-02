' Smart Energy Dashboard — silent launcher (no console window)
' Double-click this file OR the Desktop icon. It runs the dashboard hidden and opens your browser.
Set WshShell = CreateObject("WScript.Shell")
dash = "C:\Users\User\Downloads\Dashboard"
' run hidden PowerShell
WshShell.Run "powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & dash & "\scripts\start-hidden.ps1""", 0, False
' small delay then open browser
WScript.Sleep 1500
WshShell.Run "http://127.0.0.1:8000", 1, False
