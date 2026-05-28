---
title: "Установка holst-cursor-connector"
tags:
  - проект/workspace
  - подпроект/tools
  - тип/guide
  - область/meta
---
# Установка holst-cursor-connector

Пошаговая настройка MCP + skill для Cursor на macOS / Linux.

## 1. Клонировать репозиторий

```bash
git clone https://github.com/Stillfrozen/holst-cursor-connector.git
cd holst-cursor-connector
```

Замените URL на ваш fork/org после публикации на GitHub.

## 2. Автоустановка (рекомендуется)

```bash
npm run holst:install -- --configure-mcp
```

Скрипт:

1. `npm install` + `npm run build`
2. `npx playwright install chromium`
3. Создаёт `~/.holst/boards.json` из `examples/boards.json` (если файла нет)
4. Копирует skill → `~/.cursor/skills/holst/SKILL.md` (с абсолютным путём к репо)
5. Пишет `examples/mcp-snippet.json`
6. С флагом `--configure-mcp` — добавляет сервер `holst` в `~/.cursor/mcp.json`

Повторный запуск с `--skip-build` — только skill + MCP snippet:

```bash
npm run holst:install -- --skip-build --configure-mcp
```

## 3. Ручная установка

### 3.1 Сборка

```bash
npm install
npm run build
npx playwright install chromium
```

### 3.2 MCP в Cursor

**Cursor → Settings → MCP → Edit config** (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "holst": {
      "command": "node",
      "args": ["/ABS/PATH/TO/holst-cursor-connector/dist/stdio-entry.js"],
      "env": {
        "HOLST_STORAGE_STATE": "/Users/YOU/.holst/auth.json",
        "HOLST_CACHE_DIR": "/Users/YOU/.cache/holst-boards",
        "HOLST_PARSER_ROOT": "/ABS/PATH/TO/holst-cursor-connector/python"
      }
    }
  }
}
```

Используйте **абсолютные пути**. После правки — **Reload** MCP.

### 3.3 Skill

```bash
mkdir -p ~/.cursor/skills/holst
cp skills/holst/SKILL.md ~/.cursor/skills/holst/SKILL.md
```

В skill замените `{{HOLST_CONNECTOR_ROOT}}` на путь к клону (или перезапустите `holst:install`).

### 3.4 Алиасы досок

```bash
mkdir -p ~/.holst
cp examples/boards.json ~/.holst/boards.json
# добавьте свои alias → UUID; файл только локально, не коммить
```

## 4. Логин в Holst

```bash
npm run holst:login
```

Откроется браузер → войдите в Holst → вернитесь в терминал → **Enter**. Сессия сохранится в `~/.holst/auth.json`.

Проверка через MCP: tool `holst_login_status` → `exists: true`.

## 5. Первая синхронизация

```bash
npm run holst:fetch -- "https://app.holst.so/board/YOUR-BOARD-UUID"
# или по alias из ~/.holst/boards.json:
npm run holst:fetch -- "My board alias"
```

Кэш: `~/.cache/holst-boards/{boardId}/parsed/`.

В Cursor (с подключённым MCP):

- «Синхронизируй доску {alias или URL}»
- «Покажи фреймы на доске …»
- «План работ по карточке X на фрейме 20.05.26, платформа back»

## 6. Проверка работоспособности

```bash
npm test
cd python && PYTHONPATH=. python3 -m unittest discover -s tests -v
```

## Troubleshooting

| Проблема | Решение |
|----------|---------|
| Redirect на `/login` | `npm run holst:login` заново |
| MCP «Connection closed» на большой доске | CLI: `npm run holst:fetch -- URL` (timeout до 15 мин) |
| «Download menu not found» | Меню: клик по **названию доски** → «Скачать резервную копию» |
| Parser not found | `HOLST_PARSER_ROOT` → `{repo}/python` |
| PBR: план «не там» | Не Kaiten — только Holst; план в **строке платформы** (🍑 back), см. skill |
| Skill не подхватывается | Файл должен быть в `~/.cursor/skills/holst/SKILL.md`, перезапуск чата |

## Обновление

```bash
cd holst-cursor-connector
git pull
npm run holst:install -- --configure-mcp
```

При смене пути к репозиторию — обязательно перезапустите `holst:install`, чтобы обновить skill и MCP.

## Безопасность

- `~/.holst/auth.json` — cookies/session Holst; **не коммить**, не шарить.
- Репозиторий не хранит учётные данные и UUID приватных досок — только примеры в `examples/boards.json`.
