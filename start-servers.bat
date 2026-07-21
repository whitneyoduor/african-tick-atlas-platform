@echo off
cd /d C:\Users\HP\Downloads\African Tick Atlas Platform\server
start "Backend" npx tsx src/index.ts
cd /d C:\Users\HP\Downloads\African Tick Atlas Platform
start "Frontend" npx vite --host
echo Both servers starting...
