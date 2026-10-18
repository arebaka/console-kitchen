# Console Kitchen: {{hardware}}, прошивка {{firmware}}

Сгенерировано {{date}}.

## Компоненты

{{#components}}
- **{{name}}** {{version}}: {{description}}
{{/components}}
{{#hasManual}}

Скачать вручную: {{#manual}}**{{.}}** {{/manual}}
{{/hasManual}}

## Установка

1. Подключи PSP к компьютеру: **Settings → USB Connection**. Подойдёт и картридер.
2. Положи установщик в корень Memory Stick{{#go}} или внутренней памяти PSP Go{{/go}} и запусти его там:
   - Linux и macOS: `bash install.sh`
   - Windows: `powershell -ExecutionPolicy Bypass -File install.ps1`
3. Безопасно извлеки карту и выйди из режима USB.

Установщик скачивает всё прямо на карту: файлы с совпадающими именами перезаписываются, остальное на карте остаётся как есть. GitHub разрешает 60 анонимных запросов к API в час, укажи `GITHUB_TOKEN`, если запускаешь установщик часто.

Чтобы потом обновить карту, положи `dump.sh` или `dump.ps1` в её корень и запусти, затем открой `console-kitchen-dump.toml` в Console Kitchen через **Файл → Открыть**: на шаге сборки появятся `update.sh` и `update.ps1`. Для этого установщик оставляет сборку и файлы каждого компонента в `{{trace}}/`.
{{#cardUpdate}}

## Обновление карты

`update.sh` и `update.ps1` приводят карту, с которой снят снимок, к этой сборке. Положи один из них в корень этой карты и запусти там:

- Linux и macOS: `bash update.sh`
- Windows: `powershell -ExecutionPolicy Bypass -File update.ps1`

Что делает обновление:

{{#added}}
- Добавляет {{added}}
{{/added}}
{{#refreshed}}
- Скачивает заново то, у чего вышел новый релиз: {{refreshed}}
{{/refreshed}}
{{#removed}}
- Удаляет {{removed}}, их конфиги остаются на карте
{{/removed}}
{{#written}}
- Переписывает конфиги, в которых поменялись опции: {{written}}. Остальные остаются как на карте
{{/written}}
{{#deleted}}
- Удаляет то, что оставили другие сборки: {{deleted}}
{{/deleted}}

Всё, что обновление перезаписывает или удаляет, ложится в `backup/` на карте с теми же путями: скопируй обратно, чтобы вернуть. Конфиг, изменённый на карте после снимка, остаётся как есть, сделай снимок заново, чтобы его поменять. В конце обновление удаляет снимок: в нём конфиги с паролями.
{{/cardUpdate}}
{{#update}}

## Обновление системы

ARK-5 работает на прошивках 6.60 и 6.61, а на PSP стоит {{firmware}}. Заряди батарею, подключи блок питания и сначала запусти **Game → Memory Stick → PSP Update ver 6.61**.
{{/update}}

## ARK-5

1. Запусти **Game → Memory Stick → FasterARK**: он установит ARK-5 и сразу его загрузит.
2. Запусти **CustomIPL** и установи cIPL, чтобы ARK-5 загружался вместе с консолью. Без cIPL запускай FasterARK заново после каждого выключения PSP.

Настройки ARK-5 лежат в `PSP/SAVEDATA/ARK_01234/SETTINGS.TXT`, меню настроек, которое ARK добавляет в XMB, пишет тот же файл.
{{#hasPlugins}}

## Плагины

`SEPLUGINS/PLUGINS.TXT` загружает:

{{#plugins}}
- **{{name}}**: {{runlevels}}
{{/plugins}}
{{/hasPlugins}}
