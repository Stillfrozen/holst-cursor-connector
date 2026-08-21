---
title: "holst-cursor-connector"
tags:
  - проект/workspace
  - подпроект/tools
  - тип/guide
  - область/meta
---
# holst-cursor-connector

Локальный **MCP-сервер** и **Python-парсер** для досок [Holst](https://holst.so): скачивание `.holst` бэкапов через Playwright, разбор в markdown для LLM (фреймы, стикеры, PBR-карточки).

Целевой сценарий в Cursor:

> «Посмотри на доске PBR фрейм от 20.05 — найди план работ по карточке X на платформе back»

Агент синхронизирует доску, читает фрейм и отвечает по содержимому Holst (не Kaiten).

## Что внутри

| Компонент | Путь |
|-----------|------|
| Playwright download | `src/holst/fetch-backup.ts`, `npm run holst:fetch` |
| Python-парсер `.holst` | `python/holst_parser/` |
| MCP stdio | `src/stdio-entry.ts` → `holst_sync_board`, `holst_list_frames`, … |
| Cursor skill | `skills/holst/SKILL.md` (PBR-сетка карточек) |
| Установщик | `npm run holst:install` |

## Требования

- **Node.js** ≥ 20
- **Python** ≥ 3.10 (`python3` в PATH)
- **Chromium** для Playwright (`npx playwright install chromium`)
- Аккаунт Holst с доступом к нужным доскам

## Быстрая установка

```bash
git clone https://github.com/Stillfrozen/holst-cursor-connector.git
cd holst-cursor-connector
npm run holst:install -- --configure-mcp
npm run holst:login
```

Перезагрузите MCP в Cursor (**Settings → MCP**).

Подробная инструкция на русском: **[docs/INSTALL.md](./docs/INSTALL.md)**.

## MCP tools

| Tool | Назначение |
|------|------------|
| `holst_login_status` | Проверка `~/.holst/auth.json` |
| `holst_sync_board` | Скачать `.holst` (если кэш устарел) + parse |
| `holst_list_frames` | Список фреймов |
| `holst_get_frame` | Markdown одного фрейма |
| `holst_parse_backup` | Parse локального `.holst` без download |

## CLI

```bash
npm run holst:login                              # один раз — браузерный логин
npm run holst:fetch -- "https://app.holst.so/board/{uuid}"
npm run holst:fetch -- "My board alias"          # из ~/.holst/boards.json
npm run start:stdio                            # MCP вручную
```

## Алиасы досок

`~/.holst/boards.json` — **только локально** (создаётся из шаблона `examples/boards.json`):

```json
{
  "Example board": "00000000-0000-4000-8000-000000000001"
}
```

UUID — из URL доски Holst. **Не коммить** реальные алиасы в git.

## Кэш

```
~/.cache/holst-boards/{boardId}/
  backup.holst
  parsed/
    index.json
    board-summary.md
    frames/{slug}.md
    data.json          # координаты объектов — для PBR-сетки
    assets/*
```

## Переменные окружения

| Variable | Default |
|----------|---------|
| `HOLST_STORAGE_STATE` | `~/.holst/auth.json` |
| `HOLST_CACHE_DIR` | `~/.cache/holst-boards` |
| `HOLST_BOARDS_ALIASES` | `~/.holst/boards.json` |
| `HOLST_PARSER_ROOT` | `{repo}/python` |
| `HOLST_CACHE_TTL_MINUTES` | `60` |
| `HOLST_DOWNLOAD_TIMEOUT_MS` | `900000` |

## Разработка

```bash
npm install
npm run build
npm test
cd python && PYTHONPATH=. python3 -m unittest discover -s tests -v
npm run test:e2e    # нужен локальный .holst (см. scripts/e2e-parse.sh)
```

## Ограничения

- Нет официального API Holst — download через UI («Скачать резервную копию» в меню названия доски).
- Markdown-фрейм **без координат**; для PBR читай `parsed/data.json` или следуй skill (колонка X × строка платформы Y).
- Большие доски: download 1–5+ минут.

## Лицензия

MIT — см. [LICENSE](./LICENSE).
