# Contributing

> **Status:** 🚧 Placeholder — full guide sẽ được bổ sung sau khi MVP chạy ổn.

## Quick rules

- **License:** Mọi contribution phải tương thích MIT.
- **Code style:** ESLint + Prettier (sẽ setup ở Phase 7).
- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`).
- **Branches:** `main` (stable) · `feat/<name>` · `fix/<name>`.

## Local dev

```bash
git clone https://github.com/hpbaoan-source/fine-video-as-code.git
cd fine-video-as-code
npm install
npm run dev   # auto-reload server
```

## Adding a new template

1. Tạo folder `backend/templates/<template-name>/` với `Composition.tsx`.
2. Đăng ký vào `backend/templates/index.ts`.
3. Thêm vào dropdown ở `web/index.html`.
4. Tạo sample ở `samples/<NN>-<template-name>/`.

## Reporting issues

Mở GitHub issue kèm:

- Mô tả ngắn
- Steps to reproduce
- Expected vs actual behavior
- OS + Node version
