@echo off
chcp 65001 >nul
cd /d C:\book
echo 正在启动 知行笔记 本地预览服务 (http://127.0.0.1:4600/) ...
echo 按 Ctrl+C 可停止服务。
"C:\Users\Claw01\.workbuddy\binaries\python\versions\3.13.12\python.exe" serve.py 4600
pause
